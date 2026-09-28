#!/usr/bin/env node
/**
 * MarketNow — Release Manifest Generator + Signer (F-01 remediation)
 * ================================================================
 * Closes the audit's F-01 gap: there was NO artifact binding source → npm →
 * deployment → catalog. This script produces a SIGNED manifest that pins:
 *
 *   - the git SHA deployed to production (from the Vercel deployment itself)
 *   - every own npm package: version + tarball sha256 (downloaded + hashed)
 *   - the deployment identity (uid, url, readyState, created)
 *   - catalog + certification snapshot (bundle count, checks state)
 *
 * The manifest is signed (Ed25519, key mn-release-001; private key ONLY in
 * the GitHub secret MARKETNOW_RELEASE_KEY) and written to:
 *   _data/releases/release-<date>-<time>.json          (immutable history)
 *   aep-marketplace/public/api/release-manifest.json   (site surface)
 *
 * Committed with [skip ci] so the manifest ships with the NEXT deploy —
 * each manifest describes the release that PRECEDED its own deployment.
 *
 * Usage:
 *   MARKETNOW_RELEASE_KEY="$(cat key.pem)" node scripts/release-manifest.mjs
 * Env:
 *   MARKETNOW_RELEASE_KEY  (required) — Ed25519 private key PEM
 *   VERCEL_TOKEN           (optional) — to bind the live production deployment
 *   VERCEL_TEAM            (optional) — team id (default: user default team)
 *   MANIFEST_OUT           (optional) — override output path (testing)
 */
import { createPrivateKey, sign as edSign, createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';

const REPO_ROOT = execSync('git rev-parse --show-toplevel').toString().trim();
const PKGS = [
  'marketnow-mcp', 'agent-trust-card', 'marketnow-install-stack', 'marketnow-audit',
  '@marketnow/uts', '@marketnow/trust-core', '@marketnow/trust-adapters',
  '@marketnow/trust-gateway', '@marketnow/uta-verify', '@marketnow/uta-conformance',
  '@marketnow/cline-trust-plugin', '@marketnow/sentinel-rules',
  '@marketnow/trust-mcp-middleware', '@marketnow/trust-observability',
];
const KEY_ID = 'mn-release-001';

// ── canonical JSON (sorted keys, compact) — same scheme on sign and verify ──
function canonical(o) {
  if (o === null || typeof o !== 'object') return JSON.stringify(o);
  if (Array.isArray(o)) return '[' + o.map(canonical).join(',') + ']';
  return '{' + Object.keys(o).sort().map(k => JSON.stringify(k) + ':' + canonical(o[k])).join(',') + '}';
}

const log = (m) => console.log(`[manifest] ${m}`);

// ── 1. git state ────────────────────────────────────────────────────────────
const git_sha = execSync('git rev-parse HEAD').toString().trim();
const git_branch = execSync('git rev-parse --abbrev-ref HEAD').toString().trim();
log(`git: ${git_sha.slice(0, 10)} (${git_branch})`);

// ── 2. npm packages: version + tarball sha256 (download + hash) ────────────
const npmEntries = [];
for (const pkg of PKGS) {
  const url = `https://registry.npmjs.org/${encodeURIComponent(pkg).replace('%40', '@')}`;
  try {
    const meta = await (await fetch(url, { headers: { 'User-Agent': 'marketnow-release' } })).json();
    const latest = meta['dist-tags']?.latest;
    const v = meta.versions?.[latest];
    const tarball = v?.dist?.tarball;
    const integrity = v?.dist?.integrity;
    let sha256 = null, bytes = null;
    if (tarball) {
      const buf = Buffer.from(await (await fetch(tarball, { headers: { 'User-Agent': 'marketnow-release' } })).arrayBuffer());
      sha256 = createHash('sha256').update(buf).digest('hex');
      bytes = buf.length;
    }
    npmEntries.push({ name: pkg, version: latest, tarball_sha256: sha256, tarball_bytes: bytes, integrity, published_at: meta.time?.[latest] || null });
    log(`  npm ${pkg}@${latest} sha256=${sha256 ? sha256.slice(0, 16) + '…' : 'n/a'}`);
  } catch (e) {
    npmEntries.push({ name: pkg, error: String(e.message || e) });
    log(`  npm ${pkg}: ERROR ${e.message}`);
  }
}

// ── 3. live production deployment (Vercel) ──────────────────────────────────
let deployment = null;
if (process.env.VERCEL_TOKEN) {
  try {
    const q = new URLSearchParams({ limit: '1', target: 'production' });
    if (process.env.VERCEL_TEAM) q.set('teamId', process.env.VERCEL_TEAM);
    const r = await fetch(`https://api.vercel.com/v6/deployments?${q}`, {
      headers: { Authorization: `Bearer ${process.env.VERCEL_TOKEN}` },
    });
    const d = (await r.json()).deployments?.[0];
    if (d) {
      deployment = {
        uid: d.uid, name: d.name, url: d.url, state: d.readyState,
        created_at: new Date(d.created).toISOString(),
        deployed_git_sha: d.meta?.githubCommitSha || null,
        deployed_git_ref: d.meta?.githubCommitRef || null,
      };
      log(`vercel: ${deployment.url} state=${deployment.state} sha=${(deployment.deployed_git_sha || '?').slice(0, 10)}`);
    }
  } catch (e) { log(`vercel: ERROR ${e.message}`); }
} else {
  log('vercel: sin VERCEL_TOKEN — manifest sin bloque de deployment');
}

// ── 4. catalog + certification snapshot ─────────────────────────────────────
const catalog = {};
try {
  const bundle = JSON.parse(readFileSync(`${REPO_ROOT}/aep-marketplace/public/api/skills-lite.json`, 'utf8'));
  catalog.bundle_entries = bundle.length;
} catch (e) { catalog.bundle_error = String(e.message || e); }
try {
  const cert = JSON.parse(readFileSync(`${REPO_ROOT}/aep-marketplace/public/api/certification.json`, 'utf8'));
  catalog.certification = {
    generated_at: cert.generated_at,
    level: cert.level, level_name: cert.level_name,
    all_checks_pass: cert.index_certification?.all_checks_pass,
    checks_passed: cert.index_certification?.checks_passed,
    checks_total: cert.index_certification?.checks_total,
    coverage: cert.index_certification?.coverage,
  };
} catch (e) { catalog.certification_error = String(e.message || e); }
log(`catalog: ${catalog.bundle_entries} entries, cert ${catalog.certification?.checks_passed}/${catalog.certification?.checks_total} pass=${catalog.certification?.all_checks_pass}`);

// ── 5. build + sign ──────────────────────────────────────────────────────────
const now = new Date().toISOString();
const releaseId = `rel-${now.slice(0, 10)}-${now.slice(11, 19).replace(/:/g, '')}`;
const manifest = {
  schema: 'marketnow-release-manifest/1.0',
  release_id: releaseId,
  generated_at: now,
  generator: 'scripts/release-manifest.mjs',
  git: { sha: git_sha, branch: git_branch },
  deployment,
  npm: npmEntries,
  catalog,
  links: {
    verify_script: 'scripts/verify-release.mjs',
    public_key: '/_data/releases/release-public-key.json',
    api: '/api/release-manifest.json',
  },
};

const keyPem = process.env.MARKETNOW_RELEASE_KEY;
if (!keyPem) { console.error('[manifest] FALTA MARKETNOW_RELEASE_KEY — manifest sin firmar NO se escribe (fail closed)'); process.exit(1); }
const priv = createPrivateKey(keyPem);
const signingBytes = Buffer.from(canonical(manifest), 'utf8');
const sig = edSign(null, signingBytes, priv);
manifest.signature = {
  algorithm: 'Ed25519 (RFC 8032)',
  key_id: KEY_ID,
  value: sig.toString('hex'),
  signed_object: 'canonical(manifest sin signature)',
  canonical_sha256: createHash('sha256').update(signingBytes).digest('hex'),
};
log(`firma: ${manifest.signature.value.slice(0, 24)}… (canonical sha256 ${manifest.signature.canonical_sha256.slice(0, 12)}…)`);

// ── 6. write history + site surface ─────────────────────────────────────────
const dir = `${REPO_ROOT}/_data/releases`;
mkdirSync(dir, { recursive: true });
const out = process.env.MANIFEST_OUT || `${dir}/${releaseId}.json`;
writeFileSync(out, JSON.stringify(manifest, null, 2));
writeFileSync(`${REPO_ROOT}/aep-marketplace/public/api/release-manifest.json`, JSON.stringify(manifest, null, 2));
log(`escrito: _data/releases/${releaseId}.json + aep-marketplace/public/api/release-manifest.json`);

// drift report vs previous manifest (npm versions moved without redeploy?)
try {
  const files = execSync(`ls -1 ${dir}/rel-*.json 2>/dev/null || true`).toString().trim().split('\n').filter(Boolean);
  if (files.length > 1) {
    const prev = JSON.parse(readFileSync(files[files.length - 2], 'utf8'));
    const prevMap = new Map((prev.npm || []).filter(p => p.version).map(p => [p.name, p.version]));
    const drift = npmEntries.filter(p => p.version && prevMap.get(p.name) && prevMap.get(p.name) !== p.version);
    if (drift.length) {
      log('DRIFT npm desde el manifest anterior (nuevo publish sin deploy todavía):');
      drift.forEach(p => log(`  ${p.name}: ${prevMap.get(p.name)} → ${p.version}`));
    } else log('sin drift npm vs manifest anterior');
  }
} catch {}
