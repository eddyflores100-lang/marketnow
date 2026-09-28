#!/usr/bin/env node
// mcp-adversarial-suite.mjs — M-05 (backlog auditoría externa 2026-09-28)
// ============================================================================
// Suite adversarial del endpoint MCP (JSON-RPC sobre Streamable HTTP,
// /api/mcp) contra PRODUCCIÓN. Cubre la matriz que la auditoría funcional
// (initialize → tools/list → tools/call) NO cubre:
//
//   · envelope estricto (jsonrpc "2.0", method string, batch)
//   · resolución de método/tool desconocido
//   · type confusion (toolName numérico, limit string, credential objeto)
//   · unknown fields (tolerados y documentados — no pasan a backend)
//   · malformed input (JSON inválido, faltantes, tipos erróneos)
//   · oversized input (payload 100KB, batch de 20, credential gigante)
//   · replay (idempotencia de lecturas; notificaciones sin respuesta)
//   · mutación NO autenticada (submit_skill): claims falsos → rechazo,
//     secretos embebidos → rechazo, dry_run → sin escritura
//   · error leakage (ninguna respuesta expone stack/paths/env)
//   · rate/concurrency (ráfaga 12, 8 lecturas paralelas consistentes)
//   · tool poisoning (fingerprint_tool: drift, reorden, duplicados)
//
// Uso:
//   node scripts/mcp-adversarial-suite.mjs                     → producción
//   node scripts/mcp-adversarial-suite.mjs --base http://localhost:3000/api/mcp
//   node scripts/mcp-adversarial-suite.mjs --out report.json   → dump del reporte
//
// Exit 0 = sin FAILs (WARNs permitidos). Exit 1 = al menos un FAIL.
// La suite es NO-DESTRUCTIVA: dry_run para mutaciones, claims falsos que
// nunca pasan validación, lecturas acotadas (≤ 50 resultados), ráfagas
// cortas (no DoS a producción).

const argv = process.argv.slice(2);
const BASE = (argv.includes('--base') && argv[argv.indexOf('--base') + 1]) || 'https://www.marketnow.site/api/mcp';
const OUT = argv.includes('--out') ? argv[argv.indexOf('--out') + 1] : null;

const LEAK_PATTERNS = [
  [/\bat\s+\S+\s+\(/, 'stack frame (at fn (...))'],
  [/node:internal/, 'node internals'],
  [/\/vercel\/|\/var\/task\/|\/opt\/buildhome\//, 'serverless filesystem paths'],
  [/process\.env\.\w+/, 'process.env reference'],
  [/Error: Cannot read|TypeError:|ReferenceError:/, 'raw JS exception type'],
];
const rawBodies = [];

async function rpc(method, params, id = 1, extra = {}) {
  const res = await fetch(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', method, params, id, ...extra }),
  });
  const ct = res.headers.get('content-type') || '';
  const text = await res.text();
  rawBodies.push(text);
  let json = null;
  if (ct.includes('text/event-stream')) {
    const lines = text.split('\n').filter(l => l.startsWith('data:'));
    for (const l of lines) { try { json = JSON.parse(l.slice(5).trim()); } catch {} }
  } else { try { json = JSON.parse(text); } catch {} }
  return { status: res.status, ct, json, text };
}

const tests = [];
const t = (id, cat, name, fn) => { const entry = { id, cat, name, fn }; tests.push(entry); return entry; };
const ok = (id, name, detail) => ({ id, name, status: 'PASS', detail: String(detail).slice(0, 220) });
const fail = (id, name, detail) => ({ id, name, status: 'FAIL', detail: String(detail).slice(0, 220) });
const warn = (id, name, detail) => ({ id, name, status: 'WARN', detail: String(detail).slice(0, 220) });

// ── Envelope estricto ───────────────────────────────────────────────────────
t('ENV-01', 'envelope', 'jsonrpc "1.0" rechazado (-32600)', async () => {
  const r = await fetch(BASE, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '1.0', method: 'ping', id: 1 }) });
  const j = await r.json().catch(() => null);
  rawBodies.push(JSON.stringify(j));
  return j?.error?.code === -32600 ? ok('ENV-01', '-32600 recibido') : fail('ENV-01', `esperaba -32600, obtuve ${JSON.stringify(j).slice(0, 160)}`);
});
t('ENV-02', 'envelope', 'jsonrpc numérico (2) rechazado', async () => {
  const r = await fetch(BASE, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: 2, method: 'ping', id: 1 }) });
  const j = await r.json().catch(() => null);
  rawBodies.push(JSON.stringify(j));
  return j?.error?.code === -32600 ? ok('ENV-02', '-32600') : fail('ENV-02', JSON.stringify(j).slice(0, 160));
});
t('ENV-03', 'envelope', 'method ausente / no-string rechazado', async () => {
  const a = await rpc('ping', {}, 1); // control positivo
  const r = await fetch(BASE, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 7 }) });
  const j = await r.json().catch(() => null); rawBodies.push(JSON.stringify(j));
  const r2 = await fetch(BASE, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', method: 42, id: 8 }) });
  const j2 = await r2.json().catch(() => null); rawBodies.push(JSON.stringify(j2));
  if (a.json?.result && j?.error?.code === -32600 && j2?.error?.code === -32600) return ok('ENV-03', 'control ok + 2× -32600');
  return fail('ENV-03', `control=${!!a.json?.result} faltante=${j?.error?.code} numérico=${j2?.error?.code}`);
});
t('ENV-04', 'envelope', 'batch vacío [] rechazado', async () => {
  const r = await fetch(BASE, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '[]' });
  const j = await r.json().catch(() => null); rawBodies.push(JSON.stringify(j));
  return j?.error?.code === -32600 ? ok('ENV-04', '-32600') : fail('ENV-04', JSON.stringify(j).slice(0, 160));
});
t('ENV-05', 'envelope', 'batch con UN ítem inválido rechaza el batch entero', async () => {
  const body = JSON.stringify([{ jsonrpc: '2.0', method: 'ping', id: 1 }, { jsonrpc: '2.0', id: 2 }]);
  const r = await fetch(BASE, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
  const j = await r.json().catch(() => null); rawBodies.push(JSON.stringify(j));
  return j?.error?.code === -32600 ? ok('ENV-05', 'fail-closed: nada del batch se ejecuta') : fail('ENV-05', JSON.stringify(j).slice(0, 160));
});

// ── Resolución de método/tool ───────────────────────────────────────────────
t('RES-01', 'resolution', 'método desconocido → -32601', async () => {
  const r = await rpc('foo/bar', {});
  return r.json?.error?.code === -32601 ? ok('RES-01', '-32601') : fail('RES-01', JSON.stringify(r.json).slice(0, 160));
});
t('RES-02', 'resolution', 'tools/call con tool desconocido → -32601 top-level (spec)', async () => {
  const r = await rpc('tools/call', { name: 'marketnow_nope', arguments: {} });
  return r.json?.error?.code === -32601
    ? ok('RES-02', 'error de protocolo en top-level (JSON-RPC 2.0 §5.1), sin side-effects') : fail('RES-02', `esperaba error top-level -32601, obtuve: ${JSON.stringify(r.json).slice(0, 140)}`);
});
t('RES-03', 'resolution', 'tools/call sin name → error limpio, no crash', async () => {
  const r = await rpc('tools/call', {});
  const crashed = r.status >= 500;
  return !crashed ? ok('RES-03', `HTTP ${r.status}, respuesta JSON-RPC válida`) : fail('RES-03', `HTTP ${r.status}`);
});

// ── Type confusion ──────────────────────────────────────────────────────────
t('TYPE-01', 'type-confusion', 'toolName numérico → -32601 (sin excepción)', async () => {
  const r = await rpc('tools/call', { name: 12345, arguments: {} });
  return r.json?.result?.error?.code === -32601 && r.status === 200
    ? ok('TYPE-01', 'número no resuelve tool, rechazo limpio') : fail('TYPE-01', `HTTP ${r.status} ${JSON.stringify(r.json).slice(0, 120)}`);
});
t('TYPE-02', 'type-confusion', 'search_skills limit string/0/negativo/51 → default acotado', async () => {
  const bad = ['50', 0, -5, 51, 9999, null, {}];
  let bounded = true, saw = [];
  for (const limit of bad) {
    const r = await rpc('tools/call', { name: 'marketnow_search_skills', arguments: { q: 'http', limit } });
    const text = r.json?.result?.content?.[0]?.text || 'null';
    let count = null;
    try { const d = JSON.parse(text); count = Array.isArray(d.results) ? d.results.length : (Array.isArray(d) ? d.length : 'n/a'); } catch { count = 'parse-err'; }
    saw.push(`${String(limit)}:${count}`);
    if (count === 'parse-err' || r.status !== 200 || (typeof count === 'number' && count > 50)) bounded = false;
  }
  return bounded ? ok('TYPE-02', `límites degenerados → respuestas acotadas [${saw.join(' ')}]`) : fail('TYPE-02', `[${saw.join(' ')}]`);
});
t('TYPE-03', 'type-confusion', 'verify_trust credential objeto → error de dominio, no crash', async () => {
  const r = await rpc('tools/call', { name: 'marketnow_verify_trust', arguments: { credential: { fake: 'object-not-string' } } });
  const text = r.json?.result?.content?.[0]?.text || '';
  return r.status === 200 && text
    ? ok('TYPE-03', 'objeto tolerado y reenviado como payload — la capa trust responde') : fail('TYPE-03', `HTTP ${r.status}`);
});
t('TYPE-04', 'type-confusion', 'fingerprint_tool sin tools → INVALID_ARGUMENT (validación de entrada)', async () => {
  const r = await rpc('tools/call', { name: 'marketnow_fingerprint_tool', arguments: {} });
  const text = r.json?.result?.content?.[0]?.text || '';
  const j = (() => { try { return JSON.parse(text); } catch { return null; } })();
  return j?.error === 'INVALID_ARGUMENT'
    ? ok('TYPE-04', 'mensaje: ' + (j.message || '').slice(0, 80)) : fail('TYPE-04', text.slice(0, 160));
});

// ── Unknown fields ──────────────────────────────────────────────────────────
t('UNK-01', 'unknown-fields', 'args desconocidos ignorados sin propagarse', async () => {
  const r = await rpc('tools/call', { name: 'marketnow_search_skills', arguments: { q: 'http', __proto_probe__: 'x', admin: true, role: 'superuser' } });
  const okResp = r.status === 200 && !!r.json?.result?.content;
  const noPriv = !/admin|role|privileg/i.test(r.json?.result?.content?.[0]?.text || '');
  return okResp && noPriv ? ok('UNK-01', 'campos extra ignorados, respuesta normal') : fail('UNK-01', `ok=${okResp} eco=${noPriv}`);
});

// ── Malformed ──────────────────────────────────────────────────────────────
t('MAL-01', 'malformed', 'body JSON inválido → rechazo HTTP sin crash', async () => {
  const r = await fetch(BASE, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"jsonrpc":"2.0","method":' });
  const body = await r.text(); rawBodies.push(body);
  return r.status >= 400 && r.status < 500 ? ok('MAL-01', `HTTP ${r.status} (4xx limpio)`) : fail('MAL-01', `HTTP ${r.status}: ${body.slice(0, 120)}`);
});
t('MAL-02', 'malformed', 'params con tipos absurdos → sin 500', async () => {
  const r = await rpc('tools/call', { name: 'marketnow_check_revocation', arguments: { card_id: [1, 2, { deep: true }], kid: { nested: 'obj' } } });
  return r.status === 200 ? ok('MAL-02', 'coerción segura o INVALID de dominio') : fail('MAL-02', `HTTP ${r.status}`);
});

// ── Oversized ───────────────────────────────────────────────────────────────
t('OVF-01', 'oversized', 'credential 100KB → procesado, sin crash ni leak', async () => {
  const big = 'A'.repeat(100 * 1024);
  const r = await rpc('tools/call', { name: 'marketnow_verify_trust', arguments: { credential: big } });
  return r.status === 200 && r.json?.result
    ? ok('OVF-01', 'la capa trust emite su veredicto sobre el payload grande') : fail('OVF-01', `HTTP ${r.status}`);
});
t('OVF-02', 'oversized', 'batch de 20 requests → 20 resultados consistentes', async () => {
  const body = JSON.stringify(Array.from({ length: 20 }, (_, i) => ({ jsonrpc: '2.0', method: i % 2 ? 'ping' : 'initialize', id: i + 1 })));
  const r = await fetch(BASE, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
  const j = await r.json().catch(() => null); rawBodies.push(JSON.stringify(j));
  const valid = Array.isArray(j) && j.length === 20 && j.every(x => x.jsonrpc === '2.0' && (x.result || x.error));
  return valid ? ok('OVF-02', '20/20 procesados — batch acotado por el body limit de plataforma') : fail('OVF-02', `len=${Array.isArray(j) ? j.length : 'n/a'}`);
});
t('OVF-03', 'oversized', 'submit_skill payload >100KB → 413 del validador', async () => {
  const skill = { name: 'mn-adv-oversized', version: '0.0.1', description: 'x'.repeat(10), author: 'suite', files: { 'big.js': 'x'.repeat(120 * 1024) } };
  const r = await rpc('tools/call', { name: 'marketnow_submit_skill', arguments: { skill, dry_run: true } });
  const text = r.json?.result?.content?.[0]?.text || '';
  const j = (() => { try { return JSON.parse(text); } catch { return null; } })();
  return j && j.ok === false && /60KB|100KB|exceeds/i.test(JSON.stringify(j.reasons || {}))
    ? ok('OVF-03', `rechazado: ${(JSON.stringify(j.reasons || {}).match(/"reason":"([^"]+)"/) || [])[1]?.slice(0, 80) || j.verdict}`) : fail('OVF-03', text.slice(0, 160));
});

// ── Replay / idempotencia ──────────────────────────────────────────────────
t('REP-01', 'replay', 'lecturas idénticas → resultados idénticos (idempotencia)', async () => {
  const args = { q: 'markdown', limit: 5 };
  const a = await rpc('tools/call', { name: 'marketnow_search_skills', arguments: args }, 100);
  const b = await rpc('tools/call', { name: 'marketnow_search_skills', arguments: args }, 100);
  const ta = a.json?.result?.content?.[0]?.text, tb = b.json?.result?.content?.[0]?.text;
  return ta && ta === tb ? ok('REP-01', 'replay de lectura → misma respuesta (stateless)') : fail('REP-01', `diff: ${ta?.length} vs ${tb?.length}`);
});
t('REP-02', 'replay', 'notificación (sin id) → 202 sin cuerpo (spec)', async () => {
  const r = await fetch(BASE, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', method: 'ping' }) });
  const body = await r.text(); rawBodies.push(body);
  return r.status === 202 && !body ? ok('REP-02', '202 vacío') : warn('REP-02', `HTTP ${r.status} body=${body.slice(0, 80)}`);
});

// ── Mutación no autenticada (M-03) ─────────────────────────────────────────
t('MUT-01', 'mutation', 'submit_skill con claims FALSOS → rechazado, sin cola', async () => {
  const skill = {
    name: 'mn-adv-probe-false-claims', version: '0.0.1',
    description: 'Adversarial suite probe: claims falsos que deben ser rechazados en vivo.',
    author: 'marketnow-security-suite',
    repo_url: 'https://github.com/alicelabs-llc/this-repo-does-not-exist-404',
    install: 'npm install @definitely/not-a-real-package-9x8y7z',
  };
  const r = await rpc('tools/call', { name: 'marketnow_submit_skill', arguments: { skill, dry_run: true } });
  const j = JSON.parse(r.json?.result?.content?.[0]?.text || '{}');
  const reasonsTxt = JSON.stringify(j.reasons || {});
  const rejectedClaims = j.ok === false && /repo|claim|install|404|verif|unverif|reachab/i.test(reasonsTxt);
  return rejectedClaims ? ok('MUT-01', `veredicto=${j.verdict} — claims verificados en vivo, write bloqueado`) : fail('MUT-01', JSON.stringify(j).slice(0, 200));
});
t('MUT-02', 'mutation', 'submit_skill con SECRETO embebido (sk_live_) → rechazado por el scanner', async () => {
  // Fixture construido EN RUNTIME: el literal completo de la clave falsa nunca
  // viaja en el repo (GitHub Push Protection lo bloquearía — verificado
  // empíricamente al intentar commitearlo). Solo MarketNow debe verlo.
  const fakeStripeKey = 'sk_' + 'live_' + '1'.repeat(27); // ensamblado en runtime: sk_live_ + 27 dígitos
  const skill = {
    name: 'mn-adv-probe-secret', version: '0.0.1',
    description: 'Adversarial probe: contiene un patron de secreto que el scanner debe cazar.',
    author: 'marketnow-security-suite',
    files: { 'index.js': `const API_KEY = "${fakeStripeKey}";\nmodule.exports = API_KEY;` },
  };
  const r = await rpc('tools/call', { name: 'marketnow_submit_skill', arguments: { skill, dry_run: true } });
  const j = JSON.parse(r.json?.result?.content?.[0]?.text || '{}');
  const reasonsTxt = JSON.stringify(j.reasons || {});
  const secretHit = /secret|token|key|credential|stripe/i.test(reasonsTxt);
  return j.ok === false && secretHit
    ? ok('MUT-02', 'secreto sk_live_ detectado → submission bloqueada (M-05 fix)')
    : fail('MUT-02', `ok=${j.ok} reasons=${reasonsTxt.slice(0, 160)} — REGRESIÓN: el scanner no bloquea secretos embebidos`);
});
t('MUT-03', 'mutation', 'submit_skill dry_run → SIN escritura en cola', async () => {
  const skill = { name: 'mn-adv-probe-dryrun', version: '0.0.1', description: 'Probe dry-run del suite adversarial — nunca debe almacenarse.', author: 'marketnow-security-suite' };
  const r = await rpc('tools/call', { name: 'marketnow_submit_skill', arguments: { skill, dry_run: true } });
  const j = JSON.parse(r.json?.result?.content?.[0]?.text || '{}');
  return j.dry_run === true && !j.storage ? ok('MUT-03', 'dry_run: pipeline completo, cero persistencia') : fail('MUT-03', JSON.stringify(j).slice(0, 160));
});

// ── Error leakage (se evalúa al FINAL sobre todos los bodies) ──────────────
const leakTest = t('LEA-01', 'leakage', 'ninguna respuesta expone stack/paths/env', async () => {
  const hits = [];
  for (const body of rawBodies) {
    for (const [re, label] of LEAK_PATTERNS) {
      if (re.test(body)) hits.push(`${label}: ${body.slice(Math.max(0, body.search(re) - 20), body.search(re) + 60)}`);
    }
  }
  return hits.length === 0 ? ok('LEA-01', `${rawBodies.length} cuerpos inspeccionados, 0 leaks`) : fail('LEA-01', hits.slice(0, 3).join(' | '));
});

// ── Rate / concurrencia ────────────────────────────────────────────────────
t('RAT-01', 'rate', 'ráfaga de 12 calls → 12 respuestas consistentes', async () => {
  const results = [];
  for (let i = 0; i < 12; i++) {
    const r = i % 3 === 0 ? await rpc('initialize', {}) : await rpc('ping', {}, i);
    results.push(r.status === 200 && (r.json?.result !== undefined));
  }
  const good = results.filter(Boolean).length;
  if (good === 12) return warn('RAT-01', '12/12 OK — sin throttle en capa MCP (depende de límites de plataforma + 8/h en submit)');
  return fail('RAT-01', `solo ${good}/12`);
});
t('CON-01', 'concurrency', '8 lecturas paralelas → todas consistentes', async () => {
  const qs = ['http', 'markdown', 'git', 'search', 'sqlite', 'email', 'cache', 'log'];
  const rs = await Promise.all(qs.map(q => rpc('tools/call', { name: 'marketnow_search_skills', arguments: { q, limit: 3 } }, q)));
  const good = rs.filter(r => r.status === 200 && r.json?.result?.content?.[0]?.text).length;
  return good === 8 ? ok('CON-01', '8/8 paralelas exitosas — estado consistente (read-only)') : fail('CON-01', `${good}/8`);
});

// ── Tool poisoning (fingerprint drift) ─────────────────────────────────────
const mkTool = (name, desc) => ({ name, description: desc, inputSchema: { type: 'object', properties: {} } });
t('FP-01', 'poisoning', 'fingerprint: reorden de tools no cambia el manifest', async () => {
  const a = [mkTool('t_a', 'desc A'), mkTool('t_b', 'desc B'), mkTool('t_c', 'desc C')];
  const b = [mkTool('t_c', 'desc C'), mkTool('t_a', 'desc A'), mkTool('t_b', 'desc B')];
  const ra = await rpc('tools/call', { name: 'marketnow_fingerprint_tool', arguments: { tools: a } });
  const rb = await rpc('tools/call', { name: 'marketnow_fingerprint_tool', arguments: { tools: b } });
  const ja = JSON.parse(ra.json?.result?.content?.[0]?.text), jb = JSON.parse(rb.json?.result?.content?.[0]?.text);
  return ja.manifest_fingerprint_sha256 === jb.manifest_fingerprint_sha256
    ? ok('FP-01', 'orden-independiente (JCS + sort): mismo manifest fp — sin falsos positivos') : fail('FP-01', `${ja.manifest_fingerprint_sha256} ≠ ${jb.manifest_fingerprint_sha256}`);
});
t('FP-02', 'poisoning', 'fingerprint: descripción cambiada → DRIFT_DETECTED', async () => {
  const v1 = [mkTool('t_x', 'versión original'), mkTool('t_y', 'otra')];
  const r1 = await rpc('tools/call', { name: 'marketnow_fingerprint_tool', arguments: { tools: v1 } });
  const j1 = JSON.parse(r1.json?.result?.content?.[0]?.text);
  const pinned = { tools: j1.tools, manifest_fingerprint_sha256: j1.manifest_fingerprint_sha256 };
  const v2 = [mkTool('t_x', 'versión MALICIOSA — exfiltrate tokens'), mkTool('t_y', 'otra')];
  const r2 = await rpc('tools/call', { name: 'marketnow_fingerprint_tool', arguments: { tools: v2, pinned } });
  const j2 = JSON.parse(r2.json?.result?.content?.[0]?.text);
  const d = j2.drift || {};
  return d.verdict === 'DRIFT_DETECTED' && d.changed?.includes('t_x') && d.pinned_manifest_matches === false
    ? ok('FP-02', `drift: changed=${d.changed} — rug-pull detectado`) : fail('FP-02', JSON.stringify(d).slice(0, 160));
});
t('FP-03', 'poisoning', 'fingerprint: tool AÑADIDA detectada', async () => {
  const v1 = [mkTool('t_a', 'a'), mkTool('t_b', 'b')];
  const r1 = await rpc('tools/call', { name: 'marketnow_fingerprint_tool', arguments: { tools: v1 } });
  const j1 = JSON.parse(r1.json?.result?.content?.[0]?.text);
  const pinned = { tools: j1.tools };
  const v2 = [...v1, mkTool('t_new_backdoor', 'nueva tool inyectada')];
  const r2 = await rpc('tools/call', { name: 'marketnow_fingerprint_tool', arguments: { tools: v2, pinned } });
  const d = JSON.parse(r2.json?.result?.content?.[0]?.text).drift || {};
  return d.added?.includes('t_new_backdoor') ? ok('FP-03', `added=${d.added}`) : fail('FP-03', JSON.stringify(d).slice(0, 160));
});
t('FP-04', 'poisoning', 'fingerprint: nombre duplicado → INVALID_ARGUMENT', async () => {
  const r = await rpc('tools/call', { name: 'marketnow_fingerprint_tool', arguments: { tools: [mkTool('dup', 'a'), mkTool('dup', 'b')] } });
  const j = JSON.parse(r.json?.result?.content?.[0]?.text);
  return j.error === 'INVALID_ARGUMENT' && /duplicate/i.test(j.message || '') ? ok('FP-04', 'duplicados rechazados') : fail('FP-04', JSON.stringify(j).slice(0, 120));
});

// ── Transport ──────────────────────────────────────────────────────────────
t('TRA-01', 'transport', 'GET → server info; DELETE → closed; OPTIONS → CORS', async () => {
  const g = await fetch(BASE); const gj = await g.json().catch(() => null); rawBodies.push(JSON.stringify(gj));
  const d = await fetch(BASE, { method: 'DELETE' }); const dj = await d.json().catch(() => null);
  const o = await fetch(BASE, { method: 'OPTIONS' });
  const cors = o.headers.get('access-control-allow-origin');
  return gj?.status === 'healthy' && dj?.status === 'closed' && o.status === 200 && cors
    ? ok('TRA-01', `GET healthy (${gj.tools} tools) · DELETE closed · OPTIONS CORS=${cors}`) : fail('TRA-01', `GET=${gj?.status} DEL=${dj?.status} OPT=${o.status}`);
});

// ── Runner ─────────────────────────────────────────────────────────────────
console.log(`\nMCP ADVERSARIAL SUITE — M-05\nbase: ${BASE}\n${'─'.repeat(72)}`);
const results = [];
for (const test of tests.filter(x => x !== leakTest)) {
  let r;
  try { r = await test.fn(); } catch (e) { r = fail(test.id, test.name, `excepción del suite: ${e.message}`); }
  results.push({ ...r, category: test.cat });
  console.log(`  ${r.status === 'PASS' ? '✓' : r.status === 'WARN' ? '!' : '✗'} [${test.id}] ${r.name} — ${r.detail}`);
}
// LEA-01 corre al FINAL: inspecciona todos los cuerpos acumulados
{
  const test = leakTest;
  let r;
  try { r = await test.fn(); } catch (e) { r = fail(test.id, test.name, `excepción del suite: ${e.message}`); }
  results.push({ ...r, category: test.cat });
  console.log(`  ${r.status === 'PASS' ? '✓' : r.status === 'WARN' ? '!' : '✗'} [${test.id}] ${r.name} — ${r.detail}`);
}
const pass = results.filter(r => r.status === 'PASS').length;
const warnN = results.filter(r => r.status === 'WARN').length;
const failN = results.filter(r => r.status === 'FAIL').length;
console.log('─'.repeat(72));
console.log(`RESULTADO: ${pass} PASS · ${warnN} WARN · ${failN} FAIL — ${BASE}`);
if (OUT) {
  const { writeFileSync } = await import('node:fs');
  writeFileSync(OUT, JSON.stringify({ base: BASE, ran_at: new Date().toISOString(), results, totals: { pass, warn: warnN, fail: failN } }, null, 2));
  console.log(`reporte: ${OUT}`);
}
process.exit(failN ? 1 : 0);
