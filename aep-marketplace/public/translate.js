/* Extracted from translate.html inline <script> for strict CSP (M-07). */

const T = (k, v) => window.ToolsI18n.t(k, v);
let lastMs = 0;
window.__onLangChange = function () { if (lastData) showResult(lastData, lastMs); };

const API = '/api/trust?action=translate';

const FORMATS = [
  { id: 'jwt', name: 'JWT', org: 'IETF · RFC 7519', sample: JSON.stringify({ iss: 'did:web:alice.example', sub: 'agent:bob', iat: 1735686000, exp: 1893456000, scope: 'read:files write:reports', trust_score: 7 }, null, 2) },
  { id: 'w3c-vc', name: 'W3C VC', org: 'W3C · VC Data Model 2.0', sample: JSON.stringify({ '@context': ['https://www.w3.org/2018/credentials/v1'], type: ['VerifiableCredential'], issuer: 'did:web:alice.example', issuanceDate: '2026-01-15T10:00:00Z', credentialSubject: { id: 'did:agent:bob', name: 'Research Agent', trust_score: 8, scope: 'read:files' }, proof: { type: 'Ed25519Signature2020', verificationMethod: 'did:web:alice.example#key-1', proofValue: 'z3vXm…' } }, null, 2) },
  { id: 'atc-v3', name: 'ATC v3', org: 'AliceLabs · Agent Trust Card', sample: JSON.stringify({ atc_version: '3.0.0', credential_id: 'ATC-2026-EXAMPLE', issuer: { did: 'did:marketnow:ca', name: 'MarketNow Sentinel CA', ca_key_id: 'mn-ca-003' }, subject: { agent_id: 'agent:research-01', agent_name: 'Research Agent', public_key: 'MCowBQYDK2VwAyEA…', key_algorithm: 'Ed25519' }, capabilities: { provides: ['read:files', 'write:reports'], requires: [], protocols: ['mcp'] }, lifecycle: { issued_at: '2026-01-15T10:00:00Z', expires_at: '2026-10-15T10:00:00Z', revoked: false }, assessment: { score: 8.5, confidence: 'high', methodology: 'Sentinel' }, signatures: [{ algorithm: 'Ed25519 (RFC 8032)', value: '5222d35118794134ef3891836b17359b032933d2bb1812b537b4d853160895a6eb8315fe6d9e27c1d6f0223fc14f5bed913ede4a473c42aa8b411b289aaac50f', domain: 'UTA-ATC-V3-CREDENTIAL', key_id: 'mn-ca-003', canonicalization: 'RFC_8785_JCS' }] }, null, 2) },
  { id: 'a2a-card', name: 'A2A Card', org: 'Google / AAIF · Linux Foundation', sample: JSON.stringify({ name: 'research-agent', version: '1.2.0', url: 'https://agents.example.com/research', capabilities: ['search', 'summarize', 'cite'], public_key: 'MCowBQYDK2VwAyEA…', issued_at: '2026-02-01T00:00:00Z', proof: { type: 'Ed25519Signature2020', verificationMethod: 'did:web:agents.example.com#key-1' } }, null, 2) },
  { id: 'mcp-card', name: 'MCP Card', org: 'Anthropic · MCP Registry', sample: JSON.stringify({ name: 'filesystem-server', version: '1.4.0', protocolVersion: '2025-06-18', transport: 'stdio', serverInfo: { name: 'filesystem-server', version: '1.4.0', description: 'Sandboxed filesystem access for agents' }, tools: [{ name: 'read_file' }, { name: 'list_dir' }], created_at: '2026-03-10T08:00:00Z' }, null, 2) },
  { id: 'eat-ai', name: 'EAT-AI', org: 'IETF · EAT/CWT draft', sample: JSON.stringify({ kid: 'eat-key-01', payload: { iss: 'did:web:factory.example', sub: 'ueid:agent-assembly-01', name: 'Assembly Agent', iat: 1767225600, exp: 1893456000, trust_score: 7, trust_level: 'high', capabilities: ['assemble:parts', 'report:status'], cnf: { jwk: { kty: 'EC', crv: 'P-256', x: 'UWJgyMWp9oKIGwN9EG8ayz_mYYp1lcQBI58rtpOs8CM', y: '516260c8c5a9f682881b037d106f1acb3fe6618a7595c4012' } } } }, null, 2) },
  { id: 'zta', name: 'ZTA', org: 'Anthropic · Zero-Trust Agent', sample: JSON.stringify({ zta_version: '1.0', agent_id: 'agent:code-reviewer', agent_name: 'Code Reviewer', identity: { public_key: 'MCowBQYDK2VwAyEAUWJgyMWp9oKIGwN9EG8ayz_mYYp1lcQBI58rtpOs8CM=', key_algorithm: 'Ed25519', did: 'did:web:lab.example' }, trust: { score: 9, confidence: 'high', evidence: [], assessor: 'Anthropic' }, capabilities: { provides: ['review:code', 'suggest:fixes'], requires: [] }, metadata: { issued_at: '2026-02-15T00:00:00Z', expires_at: '2026-12-31T00:00:00Z', revoked: false, version: '1.0' }, signature: { algorithm: 'Ed25519', signed_by: 'Anthropic' } }, null, 2) },
  { id: 'x509', name: 'X.509', org: 'ITU-T · traditional PKI', sample: '-----BEGIN CERTIFICATE-----\nMIIBfakeEXAMPLEcertificateFORthePLAYGROUNDonlyNOTrealAAA...\n-----END CERTIFICATE-----' },
];

let fromFmt = 'jwt', toFmt = 'w3c-vc', lastData = null;

function renderGrids() {
  document.getElementById('fromGrid').innerHTML = FORMATS.map(f =>
    `<button class="fmt ${f.id === fromFmt ? 'sel' : ''}" onclick="setFrom('${f.id}')"><div class="fname">${f.name}</div><div class="forg">${f.org}</div></button>`).join('');
  document.getElementById('toGrid').innerHTML = FORMATS.map(f =>
    `<button class="fmt ${f.id === toFmt ? 'sel' : ''}" onclick="setTo('${f.id}')"><div class="fname">${f.name}</div><div class="forg">${f.org}</div></button>`).join('');
}
function setFrom(id) { fromFmt = id; if (id === toFmt) { toFmt = FORMATS.find(f => f.id !== id).id; } renderGrids(); }
function setTo(id) { toFmt = id; if (id === fromFmt) { fromFmt = FORMATS.find(f => f.id !== id).id; } renderGrids(); }
function swapFormats() { const t = fromFmt; fromFmt = toFmt; toFmt = t; renderGrids(); }
function loadSample() {
  const f = FORMATS.find(x => x.id === fromFmt);
  document.getElementById('inputCredential').value = f.sample;
}

async function translateCredential() {
  const input = document.getElementById('inputCredential').value.trim();
  const errBox = document.getElementById('err');
  errBox.style.display = 'none';
  if (!input) { document.getElementById('inputCredential').focus(); errBox.style.display = 'block'; errBox.textContent = T('tl.pasteFirst'); return; }

  const btn = document.getElementById('translateBtn');
  btn.disabled = true; btn.textContent = T('tl.translating');
  document.getElementById('loading').classList.add('on');
  document.getElementById('output').classList.remove('show');

  const t0 = performance.now();
  try {
    let payload;
    try { payload = JSON.parse(input); } catch { payload = input; }

    const resp = await fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: fromFmt, to: toFmt, payload })
    });
    const data = await resp.json();
    document.getElementById('loading').classList.remove('on');
    lastMs = Math.round(performance.now() - t0); displayResult(data, lastMs);
  } catch (err) {
    document.getElementById('loading').classList.remove('on');
    errBox.style.display = 'block';
    errBox.textContent = T('tl.apiErr', { err: err.message });
  }
  btn.disabled = false; btn.textContent = T('tl.go');
}

function fmtName(id) { const f = FORMATS.find(x => x.id === id); return f ? f.name : id; }

function displayResult(data, ms) {
  const out = document.getElementById('output');
  out.classList.add('show');
  lastData = data;

  const top = document.getElementById('resultTop');
  const summary = document.getElementById('summaryGrid');
  const actions = document.getElementById('outActions');

  if (data.error || !data.success) {
    top.className = 'result-top err';
    top.innerHTML = `<span class="rt-ico">⛔</span><div class="rt-main">
      <div class="route">${T('tl.fail')}</div>
      <div class="meta">${escapeHtml(data.error || T('tl.unknownError'))}</div></div>`;
    document.getElementById('preResult').textContent = JSON.stringify(data, null, 2);
    document.getElementById('preUts').textContent = '';
    document.getElementById('warnList').innerHTML = '<div class="nowarn">—</div>';
    document.getElementById('preRaw').textContent = JSON.stringify(data, null, 2);
    summary.style.display = 'none'; actions.style.display = 'none';
    showTab('result');
    return;
  }

  const warnings = data.warnings || [];
  top.className = 'result-top';
  top.innerHTML = `
    <span class="rt-ico">✅</span>
    <div class="rt-main">
      <div class="route"><span class="mono">${fmtName(data.from)}</span> → UTS v2 → <span class="mono">${fmtName(data.to)}</span></div>
      <div class="meta">${warnings.length === 1 ? T('tl.meta1', { ms: ms }) : T('tl.meta', { ms: ms, n: warnings.length })}</div>
    </div>
    <span class="lossless ${data.lossless ? 'yes' : 'no'}">${data.lossless ? T('tl.lossless') : (warnings.length === 1 ? T('tl.warningsBadge1') : T('tl.warningsBadge', { n: warnings.length }))}</span>`;

  document.getElementById('preResult').textContent = JSON.stringify(data.payload, null, 2);
  document.getElementById('preUts').textContent = JSON.stringify(stripRaw(data.uts), null, 2);
  document.getElementById('preRaw').textContent = JSON.stringify(data, null, 2);

  const wl = document.getElementById('warnList');
  if (!warnings.length) {
    wl.innerHTML = '<div class="nowarn">' + T('tl.noWarn') + '</div>';
  } else {
    wl.innerHTML = warnings.map(w => `<div class="witem"><span>⚠️</span><span>${escapeHtml(w)}</span></div>`).join('') +
      '<div class="witem info"><span>ℹ️</span><span>' + T('tl.sigNote') + '</span></div>';
  }

  // Summary chips
  const uts = data.uts || {};
  const chips = [
    [T('tl.chipSubject'), uts.subject?.id || uts.subject?.name || '—'],
    [T('tl.chipIssuer'), uts.trust?.assessor || '—'],
    [T('tl.chipScore'), uts.trust?.score !== undefined ? uts.trust?.score + ' / 10' : '—'],
    [T('tl.chipExpires'), uts.lifecycle?.expires_at || T('tl.notDeclared')],
    [T('tl.chipCaps'), (uts.capabilities?.provides || []).slice(0, 4).join(', ') || '—'],
  ];
  summary.style.display = 'grid';
  summary.innerHTML = chips.map(c => `<div class="sitem"><div class="k">${c[0]}</div><div class="v">${escapeHtml(String(c[1]))}</div></div>`).join('');
  actions.style.display = 'flex';
  showTab('result');
}

function stripRaw(uts) {
  if (!uts) return null;
  const copy = JSON.parse(JSON.stringify(uts));
  if (copy.format) delete copy.format.raw; // keep output readable
  return copy;
}

function showTab(name) {
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('on', t.dataset.tab === name));
  document.querySelectorAll('.tabpane').forEach(p => p.classList.toggle('on', p.id === 'pane-' + name));
}

function copyOutput() {
  const text = document.getElementById('preResult').textContent;
  navigator.clipboard.writeText(text).then(() => {
    const b = event.target; const old = b.textContent;
    b.textContent = T('c.copied'); b.classList.add('ok');
    setTimeout(() => { b.textContent = old; b.classList.remove('ok'); }, 1800);
  });
}
function downloadOutput() {
  if (!lastData) return;
  const blob = new Blob([JSON.stringify(lastData, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `uta-translation-${fromFmt}-to-${toFmt}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}
function sendToPlayground() {
  if (!lastData || !lastData.payload) return;
  try { localStorage.setItem('uta_playground_payload', JSON.stringify(lastData.payload)); } catch {}
  window.location.href = '/playground.html';
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = String(str ?? '');
  return div.innerHTML;
}

renderGrids();

