#!/usr/bin/env node
// audit-report-sync.mjs — Cierre del hallazgo M-01 (auditoría externa 2026-09-28)
// ============================================================================
// PROBLEMA: /api/audit-report.json quedó congelado en un snapshot del
// 2026-08-09 (9,248 skills) mientras el catálogo vivo indexa 68,388 y el
// pipeline L2 refresca a diario. Además, lib/stats-base.json (fuente del
// bloque security de /api/stats.json), agent.json, sentinel-roadmap.json y
// el fallback del SPA arrastraban cifras L2 de una generación anterior a
// la última actualización de certification-scans.json. Es decir: la
// superficie de transparencia divergía del estado real del catálogo.
//
// SOLUCIÓN (este script): una ÚNICA pasada de reconciliación que deriva
// TODAS las superficies de las mismas fuentes vivas:
//   · public/api/certification-scans.json      → autoridad L2 (refresh CI diario)
//   · _data/sentinel_certificates/_summary.json → autoridad del batch semanal
//   · public/api/certification.json             → revisión L1 del índice
//   · public/api/catalog-meta.json              → tiers del catálogo
//   · public/api/skills-lite.json               → bundle que sirve la UI
//   · public/_data/quarantine_decisions/MANIFEST.json → ledger de cuarentena
//
// Superficies que escribe/reconcilia:
//   1. public/api/audit-report.json     (regenerado — schema marketnow-audit-report/2.0)
//   2. public/api/skills_stats.json     (regenerado desde el bundle)
//   3. lib/stats-base.json              (security.* + aritmética de checks)
//   4. public/api/agent.json            (metrics.l2_* + desglose + metodología)
//   5. public/api/sentinel-roadmap.json (current_state.stats)
//   6. src/utils/liveStats.js           (FALLBACK_STATS — último valor conocido)
//
// DETERMINISMO: generated_at de cada superficie se deriva de la revisión de
// las FUENTES (scans.generated_at), nunca del reloj local → el modo --check
// es estable entre corridas y sirve como gate de CI:
//   node scripts/audit-report-sync.mjs           → reconcilia en sitio
//   node scripts/audit-report-sync.mjs --check   → sólo compara; exit 1 si drift
//
// El README promete "CI fails if any surface diverges". Este gate hace
// realidad esa promesa para la superficie de transparencia.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url))); // aep-marketplace/
const REPO = dirname(ROOT);                                    // raíz del repo
const CHECK = process.argv.includes('--check');
const L2_RULES = 29;
const L1_CHECKS = 10;
const FRESH_DAYS = 8; // caducidad del reporte: ciclo semanal + 1 día de gracia

const read = (p) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));
const readRepo = (p) => JSON.parse(readFileSync(join(REPO, p), 'utf8'));
const nf = (n) => n.toLocaleString('en-US');

// ── Fuentes (autoridades) ───────────────────────────────────────────────────
const scans = read('public/api/certification-scans.json');
const certsSummary = readRepo('_data/sentinel_certificates/_summary.json');
const certification = read('public/api/certification.json');
const catalogMeta = read('public/api/catalog-meta.json');
const bundle = read('public/api/skills-lite.json');
const quarantineManifest = read('public/_data/quarantine_decisions/MANIFEST.json');

const L2 = scans.stats || {};
const revision = scans.generated_at; // revisión de la autoridad L2 (ISO)
const revDate = revision.slice(0, 10);
const expires = new Date(new Date(revision).getTime() + FRESH_DAYS * 86400000).toISOString();
const totalIndexed = Array.isArray(bundle) ? bundle.length : 0;
const quarantinedTotal = Number(quarantineManifest.total_records || 0) ||
  (quarantineManifest.records || []).filter(r => (r.decision || '') === 'quarantine').length;

// Aritmética pública de checks (misma fórmula que audit-gate #10 y api/skills.js)
const l1Total = L1_CHECKS * totalIndexed;
const l2Total = L2_RULES * (L2.scanned || 0);
const checksTotal = l1Total + l2Total;
const flaggedReview = (L2.flagged_warning || 0) + (L2.flagged_error || 0);

const methodology =
  `${nf(checksTotal)} total = ${nf(l1Total)} L1 (${L1_CHECKS} L1 checks × ${nf(totalIndexed)} entries) + ` +
  `${nf(l2Total)} L2 (${L2_RULES} L2 rules × ${nf(L2.scanned || 0)} tarballs; top ${nf(L2.targets || 0)} npm targets, ` +
  `${L2.completion ?? 0}% completion)`;

// ── 1. audit-report.json v2 ─────────────────────────────────────────────────
// Ejemplos honestos: paquetes propios limpios (safe) y filas ERROR (flagged),
// con identidad de artefacto (shasum verificado contra dist.shasum del registry).
const ownClean = scans.scans
  .filter(s => s.own === true && (s.verdict || '') === 'clean')
  .sort((a, b) => (b.weekly_downloads || 0) - (a.weekly_downloads || 0))
  .slice(0, 5)
  .map(s => ({
    id: s.name, version: s.version, source: 'npm',
    artifact_shasum: s.shasum, verified_against: 'registry dist.shasum',
    l2: { verdict: s.verdict, findings: s.findings, rules: s.rules, scanned_at: s.scanned_at },
    risk_level: 'green', decision: 'admit', quarantined: false,
  }));
const flagged = scans.scans
  .filter(s => (s.by_severity?.ERROR || 0) > 0)
  .sort((a, b) => (b.by_severity?.ERROR || 0) - (a.by_severity?.ERROR || 0))
  .slice(0, 5)
  .map(s => ({
    id: s.name, version: s.version, source: 'npm',
    artifact_shasum: s.shasum, verified_against: 'registry dist.shasum',
    l2: { verdict: s.verdict, findings: s.findings,
      by_severity: { error: s.by_severity?.ERROR || 0, warning: s.by_severity?.WARNING || 0, info: s.by_severity?.INFO || 0 },
      scanned_at: s.scanned_at },
    risk_level: 'yellow', decision: 'review', quarantined: false,
    note: 'ERROR-severity patterns require human triage before install — see disclaimer in /api/certification-scans.json',
  }));

// previous_report: snapshot congelado original (carry-forward determinista).
// Si el archivo en disco ya es 2.0, se arrastra su previous_report tal cual
// (así --check es estable); si es del esquema viejo (1.x), se preserva su
// contenido como el snapshot superseded que motivó el cierre del M-01.
const previous = (() => {
  try {
    const old = read('public/api/audit-report.json');
    if (old.schema === 'marketnow-audit-report/2.0') return old.previous_report ?? null;
    return {
      generated_at: old.generated_at,
      total_skills: old.total_skills,
      summary: old.summary,
      superseded: true,
      superseded_reason: 'M-01 (external audit 2026-09-28): frozen snapshot was served as current transparency. Superseded by source-driven regeneration.',
    };
  } catch { return null; }
})();

const auditReport = {
  schema: 'marketnow-audit-report/2.0',
  generated_at: revision,
  expires_at: expires,
  is_current: true,
  catalog_revision: certification.generated_at,
  l2_scans_revision: scans.generated_at,
  batch_certification_revision: certsSummary.generated_at,
  revision_note: 'All figures derive from the live pipeline surfaces listed in provenance. This report is regenerated by scripts/audit-report-sync.mjs on every L2 refresh; CI (--check mode) fails if it drifts from its sources.',
  provenance: {
    l2_scans: { path: '/api/certification-scans.json', generated_at: scans.generated_at },
    batch_certificates: { path: '_data/sentinel_certificates/_summary.json', generated_at: certsSummary.generated_at },
    l1_index: { path: '/api/certification.json', generated_at: certification.generated_at },
    catalog_tiers: { path: '/api/catalog-meta.json', generated_at: catalogMeta.generated_at },
    catalog_bundle: { path: '/api/skills-lite.json', entries: totalIndexed },
    quarantine_ledger: { path: '/_data/quarantine_decisions/MANIFEST.json', published_at: quarantineManifest.published_at },
    release_provenance: '/api/release-manifest.json',
    methodology: '/api/sentinel-status.json',
  },
  previous_report: previous ? {
    generated_at: previous.generated_at,
    total_skills: previous.total_skills,
    summary: previous.summary,
    superseded: true,
    superseded_reason: 'M-01 (external audit 2026-09-28): frozen snapshot was served as current transparency. Superseded by source-driven regeneration.',
  } : null,
  total_skills: totalIndexed,
  tracked_all_sources: catalogMeta.total_all,
  summary: {
    l1_index_certified: totalIndexed,
    l1_checks_per_entry: L1_CHECKS,
    l1_checks_total: l1Total,
    batch_certified: certsSummary.total_certified,
    batch_failed: certsSummary.total_failed,
    sentinel_risk: certsSummary.by_risk,
    l2_targets: L2.targets,
    l2_deep_scanned: L2.scanned,
    l2_completion_pct: L2.completion,
    l2_clean: L2.clean,
    l2_flagged_warning: L2.flagged_warning,
    l2_flagged_error: L2.flagged_error,
    l2_scan_errors: L2.scan_errors,
    l2_own_packages: L2.own_packages,
    quarantined_total: quarantinedTotal,
    security_checks_performed: checksTotal,
  },
  coverage: {
    statement: `All ${nf(totalIndexed)} catalog entries carry L1 index certification; L2 deep-scans ${nf(L2.scanned || 0)} of ${nf(L2.targets || 0)} target tarballs (${L2.completion ?? 0}%). Batch certification covers ${nf(certsSummary.total_certified || 0)} skills. Indexed ≠ deep-scanned: entries outside the L2 target pool are certified with L1 + L1.6 static analysis only.`,
    l1: { total: totalIndexed, coverage_pct: 100 },
    l2: { scanned: L2.scanned, targets: L2.targets, completion_pct: L2.completion, pending: (L2.targets || 0) - (L2.scanned || 0) },
    l2_selection: L2.selection,
    l2_rotation: (scans.rotation || {}).mode,
  },
  semantics: {
    risk_level: {
      green: certification.risk_model?.green,
      yellow: certification.risk_model?.yellow,
      red: certification.risk_model?.red,
      note: 'risk_level encodes INSTALL mechanics of the entry (see /api/certification.json risk_model) — it is exposure classification, NOT a permission.',
    },
    sentinel_risk_buckets: 'low / medium / high / critical = severity buckets of the weekly batch certificates (code-scan evidence).',
    l2_scan_severity: 'clean / WARNING / ERROR = per-tarball deep-scan rows in certification-scans.json. Lite-engine hits are PATTERN matches and require human triage (see disclaimer there).',
    decision: 'admit | review | block — the admission decision. risk ≠ decision: a high-risk classification can still be admissible with review, and a low-risk one can be blocked by policy.',
    quarantine: `Tamper-evident public ledger (public/_data/quarantine_decisions/) — ${quarantinedTotal} decisions published. Quarantine is a decision, not a risk score.`,
    freshness: `expires_at = revision + ${FRESH_DAYS} days (weekly cadence + grace). Consumers MUST treat an expired report as stale and re-fetch.`,
  },
  score_distribution: certsSummary.by_score,
  safe_examples: ownClean,
  flagged_examples: flagged,
  raw_surfaces: [
    '/api/certification-scans.json',
    '/api/certification.json',
    '/api/skills-lite.json',
    '/api/stats.json',
    '/api/sentinel-status.json',
  ],
};

// ── 2. skills_stats.json (regenerado desde el bundle) ───────────────────────
const cats = {};
let priceMin = Infinity, priceMax = -Infinity, priceSum = 0, priceCount = 0;
for (const s of bundle) {
  const k = String(s.category || 'uncategorized').toLowerCase().trim().replace(/[\s/]+/g, '-');
  cats[k] = (cats[k] || 0) + 1;
  const p = typeof s.price === 'number' ? s.price : NaN;
  if (Number.isFinite(p)) {
    priceMin = Math.min(priceMin, p); priceMax = Math.max(priceMax, p);
    priceSum += p; priceCount++;
  }
}
const skillsStats = {
  total: totalIndexed,
  categories: Object.fromEntries(Object.entries(cats).sort((a, b) => b[1] - a[1])),
  price_min: priceCount ? priceMin : 0,
  price_max: priceCount ? priceMax : 0,
  price_avg: priceCount ? Number((priceSum / priceCount).toFixed(4)) : 0,
  generated_at: revision,
  source_of_truth: 'Recomputed from the deployed skills-lite.json bundle (same data the UI serves). Live figures: /api/stats.json. CI gate: audit-report-sync.mjs --check.',
};

// ── 3. lib/stats-base.json (security + aritmética) ──────────────────────────
const statsBase = read('lib/stats-base.json');
const sb = statsBase.security = statsBase.security || {};
sb.l2_targets = L2.targets;
sb.l2_sentinel_scanned = L2.scanned;
sb.l2_completion_pct = L2.completion;
sb.l2_clean = L2.clean;
sb.l2_flagged_warning = L2.flagged_warning;
sb.l2_flagged_error = L2.flagged_error;
sb.l2_scan_errors = L2.scan_errors;
sb.l2_own_packages = L2.own_packages;
sb.l1_index_certified = totalIndexed;
sb.security_checks_performed = checksTotal;
sb.security_checks_breakdown = {
  l1_index_checks: l1Total,
  l1_formula: `${L1_CHECKS} L1 checks x ${totalIndexed} entries`,
  l2_sentinel_rule_checks: l2Total,
  l2_formula: `${L2_RULES} L2 rules x ${L2.scanned} tarballs`,
  total: checksTotal,
};
sb.security_checks_methodology = methodology;
sb.l2_revision = revision; // revisión L2 de la que provienen estas cifras
statsBase.generated_at = revDate;

// ── 4. public/api/agent.json (metrics) ──────────────────────────────────────
const agent = read('public/api/agent.json');
const m = agent.metrics = agent.metrics || {};
m.l2_tarballs_deep_scanned = L2.scanned;
m.l2_clean = L2.clean;
m.l2_flagged_for_review = flaggedReview;
m.security_checks_performed = checksTotal;
m.security_checks_breakdown = {
  l1_index_checks: l1Total,
  l1_formula: `${L1_CHECKS} L1 checks x ${totalIndexed} entries`,
  l2_sentinel_rule_checks: l2Total,
  l2_formula: `${L2_RULES} L2 rules x ${L2.scanned} tarballs`,
  total: checksTotal,
};
m.security_checks_methodology = methodology;
m.as_of = revDate;
agent.generated_at = `${revDate}T00:00:00.000Z`;

// ── 5. public/api/sentinel-roadmap.json (current_state.stats) ───────────────
const roadmap = read('public/api/sentinel-roadmap.json');
const rs = roadmap.current_state = roadmap.current_state || {};
rs.stats = rs.stats || {};
rs.stats.with_l2 = L2.scanned;
rs.stats.l2_clean = L2.clean;
rs.stats.l2_flagged_warning = L2.flagged_warning;
rs.stats.l2_flagged_error = L2.flagged_error;

// ── 6. src/utils/liveStats.js (FALLBACK_STATS) ──────────────────────────────
const LS_PATH = join(ROOT, 'src/utils/liveStats.js');
const lsText = readFileSync(LS_PATH, 'utf8');
const lsPatched = lsText
  .replace(/l2: \d+,/, `l2: ${L2.scanned},`)
  .replace(/l2Targets: \d+,/, `l2Targets: ${L2.targets},`)
  .replace(/l2Pct: \d+,/, `l2Pct: ${Math.round(L2.completion ?? 0)},`)
  .replace(/clean: \d+,/, `clean: ${L2.clean},`)
  .replace(/warn: \d+,/, `warn: ${L2.flagged_warning},`)
  .replace(/err: \d+,/, `err: ${L2.flagged_error},`)
  .replace(/scanErrs: \d+,/, `scanErrs: ${L2.scan_errors},`)
  .replace(/ownPackages: \d+,/, `ownPackages: ${L2.own_packages},`)
  .replace(/generatedAt: '[\d-]+',/, `generatedAt: '${revDate}',`)
  .replace(/\(v2\.1\.0, [\d-]+\)\./, `(v2.1.0, ${revDate}).`);

// ── 7. M-01b: números vivos en las superficies estáticas de evidencia ───────
// 3ª auditoría externa (2026-09-28): las páginas /security/* y owasp.json
// incrustaban cifras L2 de una generación anterior (2,839/2,868/99% · 5.59M),
// certification.json arrastraba un deep_scan del 2026-09-10, la nota C4 de
// stats-base contradecía el C4 reparado, y el README raíz seguía en la era
// 9,248/v1.14.1/80-quarantined. Todas esas cifras se derivan ahora de las
// mismas fuentes vivas — con --check como gate, la clase completa de bug
// («discrepancia de números desde el día uno») queda estructuralmente muerta.
const c4 = (certification.checks || []).find(c => c.id === 'C4') || {};
const c4Fail = Number(c4.fail || 0);
const c4Green = c4Fail > 0 ? 9 : 10;
const c4RepairKey = Object.keys(certification.repairs_applied || {})
  .find(k => /^c4_.*\d{4}_\d{2}_\d{2}$/.test(k)) || '';
const c4RepairDate = ((c4RepairKey.match(/\d{4}_\d{2}_\d{2}$/) || [''])[0] || '').replace(/_/g, '-');
const pct = L2.completion ?? 0;
const dlVol = Number(L2.weekly_download_volume_covered || 0);
const dlM = (dlVol / 1e6).toFixed(1);
const npmOnly = (L2.targets || 0) - (L2.own_packages || 0);

// 7a) certification.json — deep_scan re-derivado de certification-scans.json
//     (antes: snapshot 2026-09-10 con 2,839/885/791/1,156/29).
certification.deep_scan = {
  level: 2,
  level_name: 'sentinel-scanned',
  detail_url: '/api/certification-scans.json',
  scanned: L2.scanned,
  clean: L2.clean,
  flagged_warning: L2.flagged_warning,
  flagged_error: L2.flagged_error,
  scan_errors: L2.scan_errors,
  weekly_download_volume_covered: dlVol,
  generated_at: revision,
};

// 7b) stats-base — la nota C4 refleja el estado real (excepciones o reparación)
sb.l1_checks_note = c4Fail > 0
  ? `C4 documents ${c4Fail} entries with url=null (provenance unknown) — see /api/certification.json checks`
  : `C4 provenance green: ${nf(c4.pass || totalIndexed)}/${nf(c4.total || totalIndexed)} pass` +
    (c4RepairDate ? ` — Smithery null-URL exceptions repaired ${c4RepairDate} (see repairs_applied.${c4RepairKey} in /api/certification.json)` : '');

// 7c) /security/sentinel-v3.0.html — badge, KPI de descargas, filas y STAGES
const sentHtml = readFileSync(join(ROOT, 'public/security/sentinel-v3.0.html'), 'utf8')
  .replace(/L2: [\d,]+ \/ [\d,]+ tarballs scanned \(\d+(?:\.\d+)?%\)/,
    `L2: ${nf(L2.scanned)} / ${nf(L2.targets)} tarballs scanned (${pct}%)`)
  .replace(/<div class="n">[\d.]+M<\/div><div class="l">weekly downloads covered/,
    `<div class="n">${dlM}M</div><div class="l">weekly downloads covered`)
  .replace(/(<tr><td>Auto-scanned<\/td><td>)[\d,]+/, `$1${nf(L2.scanned)}`)
  .replace(/<td>[\d,]+ error \/ [\d,]+ warning verdicts<\/td>/,
    `<td>${nf(L2.flagged_error)} error / ${nf(L2.flagged_warning)} warning verdicts</td>`)
  .replace(/top [\d,]+ npm targets by weekly downloads — long-tail packages carry L1 certification only \(\d+(?:\.\d+)?% completion of the covered set\)/,
    `top ${nf(npmOnly)} npm targets by weekly downloads — long-tail packages carry L1 certification only (${pct}% completion of the covered set)`)
  .replace(/raw L2 results per package \([\d,]+\)/, `raw L2 results per package (${nf(L2.scanned)})`)
  .replace(/counts:\{certified:\d+, checks:10, checks_fully_green:\d+, c4_exceptions:\d+\}/,
    `counts:{certified:${totalIndexed}, checks:10, checks_fully_green:${c4Green}, c4_exceptions:${c4Fail}}`)
  .replace(/counts:\{targets:\d+, scanned:\d+, completion:'\d+(?:\.\d+)?%', clean:\d+, flagged_warning:\d+, flagged_error:\d+\}/,
    `counts:{targets:${L2.targets}, scanned:${L2.scanned}, completion:'${pct}', clean:${L2.clean}, flagged_warning:${L2.flagged_warning}, flagged_error:${L2.flagged_error}}`)
  .replace(/evidence page generated [\d-]+/, `evidence page generated ${revDate}`);

// 7d) /security/evidence.html — KPIs, celda C4, fila L2, aritmética, honestidad
const c4Li = c4Fail > 0
  ? `<li>C4 documents ${c4Fail} entries with <code>source.url = null</code> (provenance unknown, smithery import) — published as C4 exceptions in the certification, not hidden.</li>`
  : `<li>The Smithery entries with <code>source.url = null</code> were repaired ${c4RepairDate || '2026-09-28'} by resolving their real provenance — history in <code>repairs_applied</code> (/api/certification.json). Unknown provenance is never trusted.</li>`;
const c4Cell = c4Fail > 0
  ? `<td class="hide-sm">${nf(totalIndexed)} certified · C4: ${c4Fail} documented exceptions (provenance unknown, url=null)</td>`
  : `<td class="hide-sm">${nf(totalIndexed)} certified · C4: ${nf(c4.total || totalIndexed)}/${nf(c4.total || totalIndexed)} pass${c4RepairDate ? ` — Smithery null-URL repaired ${c4RepairDate} (repairs_applied)` : ''}</td>`;
const evidHtml = readFileSync(join(ROOT, 'public/security/evidence.html'), 'utf8')
  .replace(/<div class="n">[\d,]+<\/div><div class="l">L1-certified entries · 10 checks · \d+ fully green/,
    `<div class="n">${nf(totalIndexed)}</div><div class="l">L1-certified entries · 10 checks · ${c4Green} fully green`)
  .replace(/<div class="n">[\d,]+<\/div><div class="l">tarballs deep-scanned \(29 rules\)/,
    `<div class="n">${nf(L2.scanned)}</div><div class="l">tarballs deep-scanned (29 rules)`)
  .replace(/<td class="hide-sm">[\d,]+ certified · C4: [^<]*<\/td>/, c4Cell)
  .replace(/<td class="hide-sm">[\d,]+ \/ [\d,]+ targets \(\d+(?:\.\d+)?%\) · [\d,]+ clean · [\d,]+ warn · [\d,]+ error · [\d.]+M weekly dl covered<\/td>/,
    `<td class="hide-sm">${nf(L2.scanned)} / ${nf(L2.targets)} targets (${pct}%) · ${nf(L2.clean)} clean · ${nf(L2.flagged_warning)} warn · ${nf(L2.flagged_error)} error · ${dlM}M weekly dl covered</td>`)
  .replace(/<td>[\d,]+ security checks performed = [\d,]+ L1 \(10 × [\d,]+\) \+ [\d,]+ L2 \(29 × [\d,]+\)[^<]*<\/td>/,
    `<td>${nf(checksTotal)} security checks performed = ${nf(l1Total)} L1 (10 × ${nf(totalIndexed)}) + ${nf(l2Total)} L2 (29 × ${nf(L2.scanned)}) — breakdown in agent.json</td>`)
  .replace(/top-[\d,]+ npm targets \(\d+(?:\.\d+)?% completion of that selection\)/,
    `top-${nf(npmOnly)} npm targets (${pct}% completion of that selection)`)
  .replace(/<li>(?:Four catalog entries have|C4 documents \d+ entries with|The Smithery entries with)[^\n]*<\/li>/, c4Li);

// 7e) owasp.json — cifras L2 en los textos de implementación/evidencia
const owaspText = readFileSync(join(ROOT, 'public/api/owasp.json'), 'utf8')
  .replace(/top [\d,]+ npm targets/, `top ${nf(npmOnly)} npm targets`)
  .replace(/certification-scans\.json \([\d,]+ scanned\)/, `certification-scans.json (${nf(L2.scanned)} scanned)`);
JSON.parse(owaspText); // fail-closed: nunca escribir JSON corrupto

// 7f) README raíz — tabla de stats regenerada desde fuentes + prosa al día
const npmVers = {};
for (const p of (read('lib/npm-versions.json').packages || [])) npmVers[p.name] = p.version;
const mcpVer = npmVers['marketnow-mcp'] || (statsBase.tools || {}).mcp_server_version || '1.15.0';
const statsTable = [
  '| Metric | Value |',
  '|--------|-------|',
  `| Security checks performed | **${nf(checksTotal)}** (${nf(l1Total)} L1 + ${nf(l2Total)} L2) |`,
  `| MCP skills indexed (L1) | ${nf(totalIndexed)} |`,
  `| L2 deep-scanned tarballs (29 rules) | ${nf(L2.scanned)} / ${nf(L2.targets)} (${pct}%) |`,
  `| Batch certificates (weekly) | ${nf(certsSummary.total_certified || 0)} · ${nf(certsSummary.total_failed || 0)} failed |`,
  `| Sentinel risk buckets | low ${certsSummary.by_risk?.low ?? 0} · medium ${nf(certsSummary.by_risk?.medium ?? 0)} · high ${certsSummary.by_risk?.high ?? 0} · critical ${certsSummary.by_risk?.critical ?? 0} |`,
  `| Quarantined decisions (public ledger) | ${nf(quarantinedTotal)} |`,
  '| MCP tools | 9 remote endpoint (/api/mcp) · 15 npm package |',
  `| npm packages | marketnow-mcp v${mcpVer}, marketnow-install-stack v${npmVers['marketnow-install-stack'] || '1.2.1'}, agent-trust-card v${npmVers['agent-trust-card'] || '1.4.1'} |`,
  '| CA algorithm | Ed25519 (RFC 8032) |',
].join('\n');
const readmePatched = readFileSync(join(REPO, 'README.md'), 'utf8')
  .replace(/\| Metric \| Value \|\n\|[-|]+\|\n(?:\|.*\n)+(?=\n### What Sentinel caught)/, statsTable + '\n')
  .replace(/\([\d,]+ MCP skills/g, `(${nf(totalIndexed)} MCP skills`)
  .replace(/[\d,]+ (?:skills quarantined for:|quarantine decisions published \(public ledger\) for:)/,
    `${nf(quarantinedTotal)} quarantine decisions published (public ledger) for:`)
  .replace(/## MCP Server v[\d.]+ — Agent Contract/, `## MCP Server v${mcpVer} — Agent Contract`)
  .replace(/marketnow-mcp v[\d.]+/g, `marketnow-mcp v${mcpVer}`)
  .replace(/marketnow-mcp@[\d.]+/g, `marketnow-mcp@${mcpVer}`);

// ── Escritura / comparación ─────────────────────────────────────────────────
const targets = [
  { path: 'public/api/audit-report.json', text: JSON.stringify(auditReport, null, 2) + '\n' },
  { path: 'public/api/skills_stats.json', text: JSON.stringify(skillsStats, null, 2) + '\n' },
  { path: 'lib/stats-base.json', text: JSON.stringify(statsBase, null, 2) + '\n', semantic: true },
  { path: 'public/api/agent.json', text: JSON.stringify(agent, null, 2) + '\n', semantic: true },
  { path: 'public/api/sentinel-roadmap.json', text: JSON.stringify(roadmap, null, 2) + '\n', semantic: true },
  { path: 'src/utils/liveStats.js', text: lsPatched },
  // M-01b: superficies estáticas de evidencia + README (números vivos)
  { path: 'public/api/certification.json', text: JSON.stringify(certification, null, 2) + '\n', semantic: true },
  { path: 'public/security/sentinel-v3.0.html', text: sentHtml },
  { path: 'public/security/evidence.html', text: evidHtml },
  { path: 'public/api/owasp.json', text: owaspText },
  { path: '../README.md', text: readmePatched },
];

const drift = [];
for (const t of targets) {
  const disk = readFileSync(join(ROOT, t.path), 'utf8');
  const same = t.semantic
    ? JSON.stringify(JSON.parse(disk)) === JSON.stringify(JSON.parse(t.text))
    : disk === t.text;
  if (!same) drift.push(t.path);
  if (!CHECK) {
    if (!same || !existsSync(join(ROOT, t.path))) writeFileSync(join(ROOT, t.path), t.text);
    console.log(`[sync] ${same ? 'ok (ya vigente)' : 'escrito'}: ${t.path}`);
  } else {
    console.log(`[check] ${same ? '✓' : '✗ DRIFT'}: ${t.path}`);
  }
}

console.log('─'.repeat(72));
console.log(`revisión L2: ${revision} | catálogo: ${nf(totalIndexed)} | batch: ${nf(certsSummary.total_certified || 0)} | L2: ${nf(L2.scanned || 0)}/${nf(L2.targets || 0)} (${L2.completion ?? 0}%) | checks: ${nf(checksTotal)}`);

if (CHECK) {
  if (drift.length) {
    console.error(`\n✗ M-01 GATE FALLÓ — superficies de transparencia divergentes de sus fuentes:\n  ${drift.join('\n  ')}\n\nCorre: node aep-marketplace/scripts/audit-report-sync.mjs  y commitea el resultado junto con las fuentes.`);
    process.exit(1);
  }
  console.log('\n✓ M-01 gate: todas las superficies de transparencia coinciden con sus fuentes.');
} else if (drift.length) {
  console.log(`\n✓ reconciliado ${drift.length} superficie(s) que divergían.`);
}
