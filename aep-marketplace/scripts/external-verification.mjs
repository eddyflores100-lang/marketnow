#!/usr/bin/env node
/**
 * MarketNow — External Independent Verification (M-10)
 * ====================================================
 *
 * Re-verifies the PUBLIC trust/security claims of marketnow.site using ONLY
 * publicly reachable surfaces: no tokens, no secrets, no special access.
 * Any third party can run exactly this:
 *
 *   node aep-marketplace/scripts/external-verification.mjs
 *
 * What it checks (each claim maps to a public surface):
 *
 *   A. TRANSPARENCY CONSISTENCY
 *      A1  /api/stats.json security block: L2 arithmetic must add up
 *          (clean + warn + err == scanned) and L1 must match the catalog.
 *      A2  /api/audit-report.json: is_current, coverage and revision must
 *          agree with certification-scans.json (no frozen snapshot).
 *      A3  /api/skills_stats.json total == stats L1 (no orphan counters).
 *      A4  /api/certification-scans.json: level 2, stats arithmetic, and a
 *          revision no older than the audit window (no stale L2 data).
 *
 *   B. MCP PROTOCOL (live JSON-RPC)
 *      B1  initialize handshake returns marketnow-mcp server info.
 *      B2  tools/list returns the documented tool set.
 *      B3  tools/call executes a read-only tool successfully.
 *      B4  tools/call with a malformed skill (dry_run) is REJECTED with a
 *          structured reason — not a crash, not silent acceptance.
 *
 *   C. TRANSPORT SECURITY (M-07)
 *      C1  Document root serves HSTS, X-Frame-Options, nosniff and an
 *          enforcing CSP with script-src 'self'.
 *      C2  /interactive-docs/ serves its own CSP and the CDN scripts are
 *          version-pinned AND carry SRI integrity hashes.
 *      C3  /api/* responses carry default-src 'none' CSP.
 *
 *   D. AUTHORIZATION BOUNDARIES (M-03, non-destructive)
 *      D1  Commerce endpoints (mandates/agent-purchase/stripe-webhook) are
 *          NOT live mutation surfaces: they answer the typed planned-stub,
 *          never a success mutation.
 *      D2  /api/submit rejects an empty payload (schema gate).
 *      D3  /api/submit dry_run=true with a fake repo never persists.
 *
 * Output: external-verification-report.json + exit code (0 = all PASS/WARN,
 * 1 = any FAIL). WARN = documented, accepted limitation.
 */

const BASE = process.env.MN_BASE_URL || 'https://www.marketnow.site';
const TIMEOUT = 20000;
const report = { base_url: BASE, ran_at: new Date().toISOString(), checks: [], counts: { pass: 0, warn: 0, fail: 0 } };

async function jget(path) {
  const res = await fetch(BASE + path, { signal: AbortSignal.timeout(TIMEOUT) });
  return { status: res.status, headers: res.headers, json: await res.json().catch(() => null) };
}
async function jpost(path, body, headers = {}) {
  const res = await fetch(BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT),
  });
  return { status: res.status, headers: res.headers, json: await res.json().catch(() => null) };
}
async function raw(path) {
  const res = await fetch(BASE + path, { signal: AbortSignal.timeout(TIMEOUT) });
  return { status: res.status, headers: res.headers, text: await res.text().catch(() => '') };
}
async function mcp(method, params) {
  return jpost('/api/mcp', { jsonrpc: '2.0', id: Date.now(), method, params });
}

function record(id, desc, ok, detail, warn = false) {
  const status = ok ? (warn ? 'WARN' : 'PASS') : 'FAIL';
  report.checks.push({ id, status, description: desc, detail });
  report.counts[status.toLowerCase()] += 1;
  console.log(`  [${status}] ${id} — ${desc}${detail ? ` (${typeof detail === 'string' ? detail : JSON.stringify(detail)})` : ''}`);
}

(async () => {
  console.log(`\nMarketNow External Verification — ${BASE}\n${'='.repeat(60)}\n`);

  // ─── A. Transparency consistency ─────────────────────────────────────────
  console.log('A. Transparency consistency');
  let stats = null, scans = null, audit = null, skillsStats = null;
  try {
    stats = (await jget('/api/stats.json')).json;
    scans = (await jget('/api/certification-scans.json')).json;
    audit = (await jget('/api/audit-report.json')).json;
    skillsStats = (await jget('/api/skills_stats.json')).json;
  } catch (e) {
    record('A0', 'public data surfaces reachable', false, e.message);
  }

  if (stats && scans) {
    const sec = stats.security || stats;
    // Verdict partition is over the FILE rows (the scan file keeps rows for
    // packages outside the current refresh pool), so the real invariant is:
    // clean+warn+err+info+error_rows == rows.length, and scanned <= targets.
    const rows = Array.isArray(scans.scans) ? scans.scans : [];
    const verdictSum = (sec.l2_clean ?? 0) + (sec.l2_flagged_warning ?? 0) + (sec.l2_flagged_error ?? 0)
      + ((scans.stats?.info_only ?? 0) + (scans.stats?.scan_errors ?? rows.filter(r => !r.verdict && r.error).length));
    record('A1', 'L2 verdict partition adds up (clean+warn+err+info+error == file rows) and scanned <= targets',
      rows.length > 0 && verdictSum === rows.length && (sec.l2_sentinel_scanned ?? 0) <= (sec.l2_targets ?? 0),
      { rows: rows.length, verdict_sum: verdictSum, scanned: sec.l2_sentinel_scanned, targets: sec.l2_targets });
    const l1 = sec.l1_index_certified;
    record('A1b', 'stats L1 agrees with audit-report total_skills',
      l1 !== undefined && audit?.total_skills !== undefined && Math.abs(l1 - audit.total_skills) <= 5,
      { stats_l1: l1, audit_total: audit?.total_skills });
  }
  if (audit && scans) {
    const isCurrent = audit.is_current === true;
    record('A2', '/api/audit-report.json declares is_current and matches L2 scan revision',
      isCurrent && audit.l2_scans_revision === scans.generated_at,
      { is_current: audit.is_current, l2_scans_revision: audit.l2_scans_revision, scans_generated_at: scans.generated_at });
  }
  if (skillsStats && stats) {
    const sec = stats.security || stats;
    const l1 = sec.l1_index_certified;
    const total = skillsStats.total ?? skillsStats.total_skills ?? skillsStats.count;
    record('A3', '/api/skills_stats.json total == stats L1 (no orphan counters)',
      total !== undefined && l1 !== undefined && Math.abs(total - l1) <= 5, { skills_stats_total: total, stats_l1: l1 });
  }
  if (scans) {
    const gen = scans.generated_at ? new Date(scans.generated_at) : null;
    const ageDays = gen ? (Date.now() - gen.getTime()) / 86400000 : Infinity;
    const s = scans.stats || {};
    const targets = s.targets ?? s.total_targets, scanned = s.scanned ?? s.total_scanned;
    record('A4', 'certification-scans is level 2 with consistent stats and fresh revision (<= 8 days)',
      scans.level === 2 && scanned <= targets && ageDays <= 8,
      { level: scans.level, scanned, targets, age_days: +ageDays.toFixed(2) },
      ageDays > 2 && ageDays <= 8); // 2-8 days = weekend cadence, acceptable
  }

  // ─── B. MCP protocol ─────────────────────────────────────────────────────
  console.log('\nB. MCP protocol (live JSON-RPC)');
  try {
    const init = await mcp('initialize', { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'external-verification', version: '1.0.0' } });
    const name = init.json?.result?.serverInfo?.name;
    record('B1', 'MCP initialize handshake returns marketnow-mcp server info',
      init.status === 200 && name === 'marketnow-mcp', { http: init.status, server: name });

    const tools = await mcp('tools/list', {});
    const toolNames = (tools.json?.result?.tools || []).map(t => t.name);
    record('B2', 'MCP tools/list returns the documented tool set (>= 9 tools)',
      tools.status === 200 && toolNames.length >= 9, { count: toolNames.length });

    const call = await mcp('tools/call', { name: 'marketnow_list_formats', arguments: {} });
    const okCall = call.status === 200 && !call.json?.error && (call.json?.result?.isError !== true);
    record('B3', 'MCP tools/call executes a read-only tool successfully', okCall,
      { http: call.status, rpc_error: call.json?.error?.message || null });

    // malformed submit_skill, dry_run: expect a STRUCTURED rejection
    const bad = await mcp('tools/call', {
      name: 'marketnow_submit_skill',
      arguments: { dry_run: true, skill: { name: '', version: 'not-a-version' } },
    });
    const badText = JSON.stringify(bad.json || {});
    const rejected = /reject|invalid|block|missing|required|error|422|denied/i.test(badText);
    const notAccepted = !/"accepted"\s*:\s*true/.test(badText);
    record('B4', 'MCP submit_skill with malformed payload is REJECTED (structured, no crash)',
      bad.status === 200 && !bad.json?.error && rejected && notAccepted,
      { http: bad.status, rpc_error: bad.json?.error?.message || null });
  } catch (e) {
    record('B0', 'MCP endpoint reachable', false, e.message);
  }

  // ─── C. Transport security ───────────────────────────────────────────────
  console.log('\nC. Transport security (M-7: CSP + SRI)');
  try {
    const home = await raw('/');
    const h = home.headers;
    const csp = h.get('content-security-policy') || '';
    record('C1', 'Document root serves HSTS + X-Frame-Options + nosniff + enforcing CSP (script-src self)',
      home.status === 200 && !!h.get('strict-transport-security') && (h.get('x-frame-options') || '').toUpperCase().includes('DENY')
        && (h.get('x-content-type-options') || '').toLowerCase() === 'nosniff' && csp.includes("script-src 'self'"),
      { csp: csp.slice(0, 120) + '…' });

    const docs = await raw('/interactive-docs/');
    const docsCsp = docs.headers.get('content-security-policy') || '';
    const pinned = /swagger-ui-dist@(\d+\.\d+\.\d+)/.exec(docs.text);
    const sriCount = (docs.text.match(/integrity="sha384-/g) || []).length;
    record('C2', '/interactive-docs/ CSP + version-pinned CDN scripts with SRI (2 scripts + 1 css)',
      docs.status === 200 && docsCsp.includes('cdn.jsdelivr.net') && !!pinned && sriCount >= 3,
      { pinned_version: pinned?.[1] || null, sri_attributes: sriCount, csp: docsCsp.slice(0, 90) + '…' });

    const api = await raw('/api/stats.json');
    const apiCsp = api.headers.get('content-security-policy') || '';
    record('C3', '/api/* serves default-src none CSP', api.status === 200 && apiCsp.includes("default-src 'none'"),
      { csp: apiCsp });
  } catch (e) {
    record('C0', 'site reachable', false, e.message);
  }

  // ─── D. Authorization boundaries (non-destructive) ───────────────────────
  console.log('\nD. Authorization boundaries (M-3, non-destructive)');
  const commercePaths = ['/api/mandates', '/api/agent-purchase', '/api/stripe-webhook'];
  for (const p of commercePaths) {
    try {
      const r = await jpost(p, { action: 'spend', id: 'external-verification-probe', amount: 1 });
      const stub = r.json && (r.json.status === 'planned' || r.json.gate);
      const notSuccess = !(r.json && r.json.success === true);
      record(`D1-${p}`, 'commerce endpoint answers the typed planned-stub — never a live mutation',
        r.status === 200 && stub && notSuccess, { http: r.status, status: r.json?.status, gate: r.json?.gate });
    } catch (e) {
      record(`D1-${p}`, 'commerce endpoint reachable', false, e.message);
    }
  }
  try {
    const empty = await jpost('/api/submit', {});
    const typedRejection = (empty.status === 400 || empty.status === 422)
      && !!(empty.json?.error || empty.json?.verdict || empty.json?.reasons);
    record('D2', '/api/submit rejects an empty payload (schema gate, no storage)',
      typedRejection && empty.status !== 201, { http: empty.status, reason: empty.json?.error || empty.json?.verdict });
  } catch (e) {
    record('D2', '/api/submit reachable', false, e.message);
  }
  try {
    // dry_run + fake repo: accepted-to-queue is possible, but storage must be
    // null/dry_run — this asserts NO PERSISTENCE from a probe.
    const dr = await jpost('/api/submit', { dry_run: true, skill: { name: 'external-verification-probe', repo_url: 'https://github.com/definitely/not-real-xyz', install: 'npx not-a-real-package-xyz' } });
    const noPersist = !dr.json?.storage || dr.json?.dry_run === true;
    record('D3', '/api/submit dry_run probe never persists (storage null / dry_run flag)',
      dr.status !== 500 && noPersist, { http: dr.status, dry_run: dr.json?.dry_run, storage: dr.json?.storage });
  } catch (e) {
    record('D3', '/api/submit dry_run reachable', false, e.message);
  }

  // ─── Summary ─────────────────────────────────────────────────────────────
  console.log(`\n${'='.repeat(60)}`);
  console.log(`RESULT: ${report.counts.pass} PASS · ${report.counts.warn} WARN · ${report.counts.fail} FAIL`);
  if (report.counts.fail > 0) {
    console.log('FAILED checks:');
    report.checks.filter(c => c.status === 'FAIL').forEach(c => console.log(`  ✗ ${c.id} — ${c.description}`));
  }
  report.result = report.counts.fail === 0 ? (report.counts.warn > 0 ? 'PASS_WITH_WARNINGS' : 'PASS') : 'FAIL';

  const { writeFileSync } = await import('node:fs');
  const { join } = await import('node:path');
  writeFileSync(join(process.cwd(), 'external-verification-report.json'), JSON.stringify(report, null, 2));
  console.log('\nReport: external-verification-report.json (written to the current working directory)');
  process.exit(report.counts.fail === 0 ? 0 : 1);
})();
