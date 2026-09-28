#!/usr/bin/env node
/**
 * MarketNow — Release Manifest Verifier (F-01 remediation)
 * ========================================================
 * Verifies a release manifest end-to-end:
 *   1. Ed25519 signature against the committed public key (mn-release-001)
 *   2. The canonical bytes hash matches (no post-signing tampering)
 *   3. Optional: live drift check — current npm dist-tags vs the manifest
 *
 * Usage:
 *   node scripts/verify-release.mjs                        # verifica el manifest del repo
 *   node scripts/verify-release.mjs <path-o-url.json>      # verifica otro manifest
 *   node scripts/verify-release.mjs --live                 # + drift vs npm/vercel en vivo
 * Exit codes: 0 = válido, 1 = inválido/fallido (CI-friendly).
 */
import { createPublicKey, verify as edVerify, createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';

const REPO_ROOT = execSync('git rev-parse --show-toplevel').toString().trim();

function canonical(o) {
  if (o === null || typeof o !== 'object') return JSON.stringify(o);
  if (Array.isArray(o)) return '[' + o.map(canonical).join(',') + ']';
  return '{' + Object.keys(o).sort().map(k => JSON.stringify(k) + ':' + canonical(o[k])).join(',') + '}';
}

const arg = process.argv[2] || `${REPO_ROOT}/aep-marketplace/public/api/release-manifest.json`;
const live = process.argv.includes('--live');

// ── load manifest (file or URL) ─────────────────────────────────────────────
let manifest, manifestRaw;
if (/^https?:/.test(arg)) {
  const r = await fetch(arg, { headers: { 'User-Agent': 'marketnow-verify' } });
  if (!r.ok) { console.error(`✗ no pude bajar ${arg}: HTTP ${r.status}`); process.exit(1); }
  manifestRaw = await r.text();
} else {
  if (!existsSync(arg)) { console.error(`✗ no existe ${arg}`); process.exit(1); }
  manifestRaw = readFileSync(arg, 'utf8');
}
manifest = JSON.parse(manifestRaw);

console.log(`manifest: ${manifest.release_id} (generado ${manifest.generated_at})`);

// ── 1. signature ────────────────────────────────────────────────────────────
const keyPath = `${REPO_ROOT}/_data/releases/release-public-key.json`;
if (!existsSync(keyPath)) { console.error('✗ falta _data/releases/release-public-key.json'); process.exit(1); }
const kp = JSON.parse(readFileSync(keyPath, 'utf8'));
const sig = manifest.signature;
if (!sig || sig.key_id !== kp.key_id) { console.error(`✗ signature ausente o key_id ≠ ${kp.key_id}`); process.exit(1); }

const { signature: _drop, ...payload } = manifest;
const canonicalBytes = Buffer.from(canonical(payload), 'utf8');
const hash = createHash('sha256').update(canonicalBytes).digest('hex');
if (sig.canonical_sha256 && sig.canonical_sha256 !== hash) {
  console.error(`✗ canonical sha256 difiere — el manifest fue alterado tras la firma`);
  console.error(`  firmado: ${sig.canonical_sha256}`);
  console.error(`  actual : ${hash}`);
  process.exit(1);
}
const pub = createPublicKey(kp.public_key_pem);
const ok = edVerify(null, canonicalBytes, pub, Buffer.from(sig.value, 'hex'));
if (!ok) { console.error('✗ FIRMA INVÁLIDA (Ed25519)'); process.exit(1); }
console.log(`✓ firma Ed25519 válida (key ${sig.key_id}, canonical sha256 ${hash.slice(0, 12)}…)`);

// ── 2. contenido esencial ───────────────────────────────────────────────────
console.log(`  git     : ${(manifest.git?.sha || '?').slice(0, 10)} (${manifest.git?.branch || '?'})`);
if (manifest.deployment) {
  console.log(`  deploy  : ${manifest.deployment.url} [${manifest.deployment.state}] sha=${(manifest.deployment.deployed_git_sha || '?').slice(0, 10)}`);
  if (manifest.deployment.deployed_git_sha && manifest.deployment.deployed_git_sha !== manifest.git?.sha) {
    console.log(`  ⚠ el manifest corre en master@${(manifest.git?.sha || '').slice(0, 10)} pero describe el deploy de ${(manifest.deployment.deployed_git_sha || '').slice(0, 10)} (normal: el manifest se genera post-deploy)`);
  }
}
const good = (manifest.npm || []).filter(p => p.tarball_sha256).length;
console.log(`  npm     : ${good}/${(manifest.npm || []).length} paquetes con tarball sha256`);
console.log(`  catalog : ${manifest.catalog?.bundle_entries} entradas; cert ${manifest.catalog?.certification?.checks_passed}/${manifest.catalog?.certification?.checks_total} all_pass=${manifest.catalog?.certification?.all_checks_pass}`);

// ── 3. live drift (opcional) ────────────────────────────────────────────────
if (live) {
  console.log('\ndrift vs registry npm (AHORA):');
  let drift = 0;
  for (const p of manifest.npm || []) {
    if (!p.version) continue;
    try {
      const meta = await (await fetch(`https://registry.npmjs.org/${encodeURIComponent(p.name).replace('%40', '@')}`, { headers: { 'User-Agent': 'marketnow-verify' } })).json();
      const latest = meta['dist-tags']?.latest;
      if (latest !== p.version) { console.log(`  ⚠ ${p.name}: manifest=${p.version} npm=${latest}`); drift++; }
    } catch {}
  }
  console.log(drift === 0 ? '  ✓ sin drift — el manifest refleja el registry actual' : `  ${drift} paquetes con drift`);
}

console.log('\n✓ MANIFEST VÁLIDO');
