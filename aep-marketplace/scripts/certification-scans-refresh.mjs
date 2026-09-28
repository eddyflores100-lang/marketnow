#!/usr/bin/env node
/**
 * MarketNow — Refresco rodante CI de certification-scans.json (P2-a, audit F-02/F-08)
 * =============================================================================
 * Port a CI del scanner L2 de dev (scripts/deep_scan_npm.mjs, dato dev-machine
 * del 10-sep). Mismo motor, mejor higiene:
 *
 *   - Fuente viva del catálogo: public/api/skills-lite.json (post-split; el
 *     skills_index.json de 85MB fue eliminado el 2026-09-26).
 *   - Lote RODANTE: cada corrida re-escanea los N objetivos más VIEJOS (o nunca
 *     escaneados) del pool top-N npm + los 14 paquetes propios SIEMPRE.
 *     Con batch=200/día el pool completo rota en ~2 semanas y el dato del sitio
 *     deja de congelarse (causa raíz del F-08).
 *   - Integridad: cada tarball se descarga del registry y se verifica su
 *     shasum contra dist.shasum ANTES de extraer y escanear (fail-closed).
 *   - Scanner: @marketnow/sentinel-rules@1.1.2 en modo tarball (--no-skip:
 *     dist/ ES el código que ejecuta el usuario). El workflow lo instala con
 *     sha256 pineado — supply-chain verificable.
 *
 * Salida: public/api/certification-scans.json — mismo schema + campos
 * aditivos (refresh_mode, last_refresh_at, fresh_scans_30d, rotation).
 * Stats recalculados de verdad en cada corrida.
 *
 * Uso:
 *   node scripts/certification-scans-refresh.mjs [--minutes 20] [--batch 200]
 *        [--scanner-path /ruta/a/sentinel-scan.mjs] [--dry-run]
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP = join(__dirname, '..');                       // aep-marketplace/
const LITE = join(APP, 'public', 'api', 'skills-lite.json');
const OUT = join(APP, 'public', 'api', 'certification-scans.json');
const WORK = join(APP, '.scans-tmp');

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const MINUTES = parseFloat(arg('minutes', '20'));
const BATCH = parseInt(arg('batch', '200'), 10);
const SCANNER = arg('scanner-path', 'sentinel-scan');    // default: en PATH (npx install)
const DRY_RUN = argv.includes('--dry-run');
const TOP_N = parseInt(arg('top', '2868'), 10);          // mismo pool que el baseline

mkdirSync(join(WORK, 'tarballs'), { recursive: true });
mkdirSync(join(WORK, 'extracted'), { recursive: true });

const BASELINE_GENERATED_AT = '2026-09-10T07:13:04Z';    // provenance del dataset original
const OWN_PKGS = [
  'marketnow-mcp', 'marketnow-audit', 'marketnow-install-stack', 'agent-trust-card',
  '@marketnow/uts', '@marketnow/trust-core', '@marketnow/trust-adapters', '@marketnow/trust-gateway',
  '@marketnow/cline-trust-plugin', '@marketnow/uta-conformance', '@marketnow/sentinel-rules',
  '@marketnow/trust-mcp-middleware', '@marketnow/uta-verify', '@marketnow/trust-observability',
];
const own = (p) => p.startsWith('@marketnow/') || p.startsWith('marketnow-');

// ── 1. Pool objetivo (del catálogo vivo) ───────────────────────────────────
const catalog = JSON.parse(readFileSync(LITE, 'utf8'));
const npmEntries = catalog.filter(s => {
  const src = typeof s.source === 'object' ? s.source?.type : s.source;
  return (src === 'npm' || src === 'npm-registry') && own(String(s.name || '')) === false;
}).sort((a, b) => (b.npm_downloads_wk || 0) - (a.npm_downloads_wk || 0));

const pool = [
  ...OWN_PKGS.map(n => ({ name: n, dl: 0, own: true })),
  ...npmEntries.slice(0, TOP_N).map(e => ({ name: e.name, dl: e.npm_downloads_wk || 0, own: false })),
];
const poolIndex = new Map(pool.map(t => [t.name, t]));

// ── 2. Estado previo (scans existentes) + selección rodante ───────────────
const prev = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : { scans: [] };
const prevScans = Array.isArray(prev.scans) ? prev.scans : [];
const lastScanAt = new Map();
for (const s of prevScans) lastScanAt.set(s.name, s.scanned_at || 0);

// Propios SIEMPRE primero; después los más viejos/nunca-escaneados del pool.
const candidates = [...pool].sort((a, b) => {
  if (a.own !== b.own) return a.own ? -1 : 1;                      // own first
  const ta = lastScanAt.get(a.name) || 0, tb = lastScanAt.get(b.name) || 0;
  if (!ta !== !tb) return ta ? 1 : -1;                             // nunca-escaneado first
  return String(ta).localeCompare(String(tb));                     // más viejo first
}).slice(0, BATCH);

const staleScanNames = prevScans.filter(s => !poolIndex.has(s.name)).length;
console.log(`[pool] top-${Math.min(TOP_N, npmEntries.length)} npm + ${OWN_PKGS.length} own = ${pool.length}`);
console.log(`[estado previo] scans: ${prevScans.length} | fuera del pool (legacy): ${staleScanNames}`);
console.log(`[lote] ${candidates.length} objetivos (own=${candidates.filter(c => c.own).length}) | presupuesto ${MINUTES}min`);

// ── 3. Registro: metadata abreviada (corgi) del registry ──────────────────
async function meta(name) {
  const enc = name.startsWith('@') ? '@' + encodeURIComponent(name.slice(1)) : encodeURIComponent(name);
  const r = await fetch(`https://registry.npmjs.org/${enc}`, { headers: { Accept: 'application/vnd.npm.install-v1+json' } });
  if (!r.ok) throw new Error(`registry ${r.status}`);
  const doc = await r.json();
  const v = doc['dist-tags']?.latest;
  const ver = doc.versions?.[v];
  if (!ver) throw new Error('no latest version');
  return { version: v, tarball: ver.dist?.tarball, integrity: ver.dist?.integrity, shasum: ver.dist?.shasum, license: ver.license || null, deps: Object.keys(ver.dependencies || {}).length };
}

async function scanOne(t) {
  const t0 = Date.now();
  const m = await meta(t.name);
  const safe = t.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const tbPath = join(WORK, 'tarballs', safe + '.tgz');
  const exPath = join(WORK, 'extracted', safe);

  // descarga + verificación de integridad (shasum del registry)
  const tr = await fetch(m.tarball);
  if (!tr.ok) throw new Error(`tarball ${tr.status}`);
  const buf = Buffer.from(await tr.arrayBuffer());
  const sha = createHash('sha1').update(buf).digest('hex');
  if (m.shasum && m.shasum !== sha) throw new Error('shasum mismatch (registry integrity)');
  writeFileSync(tbPath, buf);

  // extracción (strip package/)
  rmSync(exPath, { recursive: true, force: true });
  mkdirSync(exPath, { recursive: true });
  execFileSync('tar', ['-xzf', tbPath, '-C', exPath, '--strip-components=1'], { stdio: 'pipe' });

  // escaneo (modo tarball: dist/ incluido — el código que corre en la máquina del usuario)
  let out;
  try {
    const stdout = execFileSync('node', [SCANNER, '--path', exPath, '--json', '--soft', '--no-skip'],
      { stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 128 * 1024 * 1024, timeout: 120_000 });
    out = JSON.parse(stdout.toString());
  } catch (e) {
    throw new Error('scanner: ' + String(e.message).slice(0, 120));
  }

  const items = out.items || [];
  const bySev = { ERROR: 0, WARNING: 0, INFO: 0 };
  const byRule = {};
  for (const f of items) { bySev[f.severity] = (bySev[f.severity] || 0) + 1; byRule[f.rule] = (byRule[f.rule] || 0) + 1; }
  const verdict = items.length === 0 ? 'clean' : (bySev.ERROR > 0 ? 'flagged-error' : (bySev.WARNING > 0 ? 'flagged-warning' : 'info-only'));

  // limpieza inmediata de disco: el shasum queda registrado como evidencia
  rmSync(exPath, { recursive: true, force: true });
  try { rmSync(tbPath, { force: true }); } catch {}

  return {
    name: t.name, version: m.version, own: !!t.own, weekly_downloads: t.dl,
    shasum: sha, integrity: m.integrity, license: m.license, deps_count: m.deps,
    tarball_bytes: buf.length, files_scanned: out.files_scanned, rules: out.rules,
    findings: items.length, by_severity: bySev, by_rule: byRule,
    top_findings: items.slice(0, 8).map(f => ({ rule: f.rule, severity: f.severity, file: f.file, line: f.line, snippet: f.snippet })),
    verdict, scanner: 'sentinel-rules@lite --no-skip', scanned_at: new Date().toISOString(), duration_ms: Date.now() - t0,
  };
}

// ── 4. Corrida con presupuesto de tiempo ──────────────────────────────────
const results = { scans: prevScans.slice() };             // copia: merge in-place
const deadline = Date.now() + MINUTES * 60_000;
let n = 0, errs = 0;
for (const t of candidates) {
  if (Date.now() > deadline) { console.log('[presupuesto] tiempo agotado'); break; }
  try {
    const rec = await scanOne(t);
    results.scans = results.scans.filter(r => r.name !== rec.name); // reemplaza el viejo
    results.scans.push(rec);
    n++;
    const flag = rec.verdict === 'clean' ? 'OK clean' : `! ${rec.verdict} (${rec.findings})`;
    console.log(`  ${flag.padEnd(26)} ${t.name}@${rec.version} [${rec.files_scanned} files, ${(rec.duration_ms / 1000).toFixed(1)}s]`);
  } catch (e) {
    errs++;
    results.scans = results.scans.filter(r => r.name !== t.name);  // error viejo fuera
    results.scans.push({ name: t.name, error: String(e.message).slice(0, 200), scanned_at: new Date().toISOString() });
    console.log(`  x ERROR ${t.name}: ${e.message}`);
  }
  try {
    const safe = t.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    rmSync(join(WORK, 'extracted', safe), { recursive: true, force: true });
    rmSync(join(WORK, 'tarballs', safe + '.tgz'), { force: true });
  } catch {}
}

// ── 5. Merge final + stats recalculados de verdad ─────────────────────────
const scans = results.scans;
const ok = scans.filter(s => !s.error);
const errList = scans.filter(s => s.error);
const inPool = scans.filter(s => poolIndex.has(s.name));
const verdicts = { clean: 0, 'flagged-warning': 0, 'flagged-error': 0, 'info-only': 0 };
for (const s of ok) verdicts[s.verdict] = (verdicts[s.verdict] || 0) + 1;

const topRules = {};
for (const s of ok) for (const [r, c] of Object.entries(s.by_rule || {})) topRules[r] = (topRules[r] || 0) + c;
const topRulesHit = Object.fromEntries(Object.entries(topRules).sort((a, b) => b[1] - a[1]).slice(0, 10));

const NOW = new Date().toISOString();
const cutoff30 = Date.now() - 30 * 24 * 3600 * 1000;
const fresh30 = ok.filter(s => s.scanned_at && Date.parse(s.scanned_at) >= cutoff30).length;

const doc = {
  schema: 'marketnow-certification-scans/1.0',
  generated_at: NOW,
  baseline_generated_at: BASELINE_GENERATED_AT,
  refresh_mode: 'rolling-ci',
  last_refresh_at: NOW,
  level: prev.level ?? 2,
  level_name: prev.level_name ?? 'sentinel-scanned',
  description: (prev.description || '').replace(
    /Deep code scan of the SHIPPED registry artifacts/,
    'Rolling CI deep scan of the SHIPPED registry artifacts') +
    ' Refresh: rolling batch in GitHub Actions (daily) — every run re-scans the oldest entries plus all @marketnow own packages, so results never go stale.',
  stats: {
    targets: pool.length,
    scanned: inPool.filter(s => !s.error).length,
    scan_errors: errList.length,
    completion: Math.round((inPool.filter(s => !s.error).length / pool.length) * 1000) / 10,
    clean: verdicts.clean,
    flagged_warning: verdicts['flagged-warning'],
    flagged_error: verdicts['flagged-error'],
    info_only: verdicts['info-only'],
    own_packages: ok.filter(s => s.own).length,
    weekly_download_volume_covered: ok.reduce((a, s) => a + (s.weekly_downloads || 0), 0),
    selection: `top ${TOP_N} npm packages by weekly downloads from the MarketNow catalog + all ${OWN_PKGS.length} @marketnow own packages; rolling refresh (oldest-first)`,
    refreshed_this_run: n,
    errors_this_run: errs,
  },
  top_rules_hit: topRulesHit,
  error_packages: errList.map(s => ({ name: s.name, reason: s.error })),
  scans,
  rotation: {
    mode: 'oldest-first + own-always',
    batch_size: BATCH,
    batch_minutes_budget: MINUTES,
    pool_size: pool.length,
    fresh_scans_30d: fresh30,
    note: 'Full pool rotation completes in pool_size / batch_size runs. Own @marketnow packages are re-scanned every run.',
  },
  disclaimer: prev.disclaimer || '',
  note: (prev.note || '') + ' [2026-09-28] Refresh rodante en CI: ver rotation.* y stats.refreshed_this_run.',
};

if (DRY_RUN) {
  console.log(`\n[DRY RUN] No se escribió nada. Resumen: refreshed=${n} errs=${errs} | pool=${pool.length} | fresh30=${fresh30}`);
} else {
  writeFileSync(OUT, JSON.stringify(doc, null, 2) + '\n');
  rmSync(WORK, { recursive: true, force: true });
  console.log(`\n[escrito] ${OUT}`);
  console.log(`[resumen] refreshed=${n} (errs ${errs}) | scanned=${doc.stats.scanned}/${doc.stats.targets} (${doc.stats.completion}%) | clean=${verdicts.clean} warn=${verdicts['flagged-warning']} err=${verdicts['flagged-error']} | fresh30=${fresh30}`);
}
