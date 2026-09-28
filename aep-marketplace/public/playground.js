/* Extracted from playground.html inline <script> for strict CSP (M-07). */

const T = (k, v) => window.ToolsI18n.t(k, v);
let lastMs = 0;
window.__onLangChange = function () { if (lastData) displayResult(lastData, lastMs); };

const API = '/api/trust?action=verify';

const EXAMPLES = {
  jwt: 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCIsImtpZCI6ImRpZDp3ZWI6YWxpY2UuZXhhbXBsZSNrZXktMSJ9.eyJpc3MiOiJkaWQ6d2ViOmFsaWNlLmV4YW1wbGUiLCJzdWIiOiJhZ2VudDpib2IiLCJpYXQiOjE3MzU2ODAwMDAsImV4cCI6MTg5MzQ1NjAwMCwic2NvcGUiOiJyZWFkOmZpbGVzIiwidHJ1c3Rfc2NvcmUiOjd9.c2lnbmF0dXJl',
  w3cvc: JSON.stringify({
    '@context': ['https://www.w3.org/2018/credentials/v1'],
    type: ['VerifiableCredential'],
    issuer: 'did:web:alice.example',
    issuanceDate: '2026-01-15T10:00:00Z',
    expirationDate: '2027-12-31T23:59:59Z',
    credentialSubject: { id: 'did:agent:bob', name: 'Research Agent', trust_score: 8, scope: 'read:files' },
    proof: { type: 'Ed25519Signature2020', proofValue: 'z3vXmExampleProofValue123', proofPurpose: 'assertionMethod', verificationMethod: 'did:web:alice.example#key-1', created: '2026-01-15T10:00:00Z' }
  }, null, 2),
  mcp: JSON.stringify({
    name: 'filesystem-server', version: '1.4.0', protocolVersion: '2025-06-18', transport: 'stdio',
    serverInfo: { name: 'filesystem-server', version: '1.4.0', description: 'Sandboxed filesystem access for agents' },
    tools: [{ name: 'read_file' }, { name: 'list_dir' }],
    created_at: '2026-03-10T08:00:00Z'
  }, null, 2),
  atc: JSON.stringify({
    atc_version: '3.0.0', credential_id: 'ATC-2026-PLAYGROUND',
    issuer: { did: 'did:marketnow:ca', name: 'MarketNow Sentinel CA', ca_key_id: 'mn-ca-003' },
    subject: { agent_id: 'agent:research-01', agent_name: 'Research Agent', public_key: 'MCowBQYDK2VwAyEAUWJgyMWp9oKIGwN9EG8ayz_mYYp1lcQBI58rtpOs8CM=', key_algorithm: 'Ed25519' },
    capabilities: { provides: ['read:files', 'write:reports'], requires: [], protocols: ['mcp'] },
    lifecycle: { issued_at: '2026-01-15T10:00:00Z', expires_at: '2026-12-31T10:00:00Z', revoked: false },
    assessment: { score: 8.5, confidence: 'high', methodology: 'Sentinel', methodology_version: 'v2.5' },
    signatures: [{ algorithm: 'Ed25519 (RFC 8032)', value: '89b1f1156e02dad56edc33b4fef26fc943ab3d7687fddaab78334f1dde05945ca91c47599ada631c0d7190cecf38a67693c4266a0e28eb1559a2f02dc3d94403', domain: 'UTA-ATC-V3-CREDENTIAL', key_id: 'mn-ca-003', canonicalization: 'RFC_8785_JCS' }]
  }, null, 2),
  atcTampered: JSON.stringify({
    atc_version: '3.0.0', credential_id: 'ATC-2026-TAMPERED',
    issuer: { did: 'did:web:attacker.example', name: 'Totally Legit CA', ca_key_id: 'evil-ca-666' },
    subject: { agent_id: 'agent:innocent', agent_name: 'Innocent Agent', public_key: 'MCowBQYDK2VwAyEAFakePublicKeyForAttackerExampleOnlyAA=', key_algorithm: 'Ed25519' },
    capabilities: { provides: ['read:files', 'write:reports', 'shell:exec', 'credentials:read'], requires: [], protocols: ['mcp'] },
    lifecycle: { issued_at: '2026-09-08T00:00:00Z', expires_at: '2030-01-01T00:00:00Z', revoked: false },
    assessment: { score: 10, confidence: 'high', methodology: 'self-declared' },
    signatures: [{ algorithm: 'Ed25519 (RFC 8032)', value: 'ab'.repeat(64), domain: 'UTA-ATC-V3-CREDENTIAL', key_id: 'evil-ca-666', canonicalization: 'RFC_8785_JCS' }]
  }, null, 2),
  expired: JSON.stringify({
    '@context': ['https://www.w3.org/2018/credentials/v1'],
    type: ['VerifiableCredential'],
    issuer: 'did:web:alice.example',
    issuanceDate: '2024-01-15T10:00:00Z',
    expirationDate: '2024-12-31T23:59:59Z',
    credentialSubject: { id: 'did:agent:bob', trust_score: 8 },
    proof: { type: 'Ed25519Signature2020', proofValue: 'z3vXmExampleProofValue123', verificationMethod: 'did:web:alice.example#key-1' }
  }, null, 2),
  garbage: JSON.stringify({ hello: 'world', foo: [1, 2, 3], trust: 'sure' }, null, 2),
};

const EX_LABELS = {
  jwt: 'JWT token', w3cvc: 'valid W3C VC', mcp: 'MCP server card',
  atc: 'ATC v3 · real signature mn-ca-003 ✓', atcTampered: 'TAMPERED ATC v3 (unknown CA)',
  expired: 'EXPIRED W3C VC', garbage: 'random JSON',
};

function loadEx(k) {
  document.getElementById('credentialInput').value = EXAMPLES[k];
  document.getElementById('tamperNote').classList.remove('show');
  verifyCredential();
}

function parseInput(input) {
  try { return JSON.parse(input); } catch { return input; }
}

async function verifyCredential() {
  const input = document.getElementById('credentialInput').value.trim();
  const errBox = document.getElementById('err');
  errBox.style.display = 'none';
  if (!input) { errBox.style.display = 'block'; errBox.textContent = T('pg.pasteFirst'); return; }

  const btn = document.getElementById('verifyBtn');
  btn.disabled = true; btn.textContent = T('pg.verifying');
  document.getElementById('loading').classList.add('on');
  document.getElementById('result').classList.remove('show');

  const t0 = performance.now();
  try {
    const resp = await fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ payload: parseInput(input) })
    });
    const data = await resp.json();
    document.getElementById('loading').classList.remove('on');
    lastMs = Math.round(performance.now() - t0); displayResult(data, lastMs);
  } catch (err) {
    document.getElementById('loading').classList.remove('on');
    errBox.style.display = 'block';
    errBox.textContent = T('pg.apiErr', { err: err.message });
  }
  btn.disabled = false; btn.textContent = T('pg.verify');
}

/* ── Tamper demo: corrupt the pasted credential and re-verify ── */
async function tamperAndVerify() {
  const input = document.getElementById('credentialInput').value.trim();
  if (!input) { loadEx('w3cvc'); return; }

  const note = document.getElementById('tamperNote');
  let obj;
  try { obj = JSON.parse(input); } catch {
    note.classList.add('show');
    note.innerHTML = '<b>' + T('pg.tamperSkipped') + '</b> ' + T('pg.tamperNotJson');
    return;
  }

  // Mutation strategy per format
  let mutation;
  if (obj.atc_version && String(obj.atc_version).startsWith('3.')) {
    // Flip bytes in the signature → real Ed25519 check must fail
    const sig = obj.signatures?.[0];
    if (sig) { sig.value = (sig.value.slice(0, 2) === 'ab' ? 'cd' : 'ab') + sig.value.slice(2); }
    mutation = 'flipped the first bytes of the Ed25519 signature value';
  } else if (obj['@context'] || obj.credentialSubject) {
    obj.expirationDate = '2020-01-01T00:00:00Z';
    mutation = 'moved expirationDate to 2020 (credential is now expired)';
  } else if (obj.serverInfo || obj.tools) {
    obj.tools = undefined;
    mutation = 'removed the tools field (schema violation)';
  } else if (obj.iss !== undefined || obj.sub !== undefined || obj.jwt) {
    obj.exp = 1000000000; // 2001
    mutation = 'set exp to 2001 (token is now expired)';
  } else {
    mutation = 'mutated the payload (added a fake trust field)';
    obj.trust_score = 10;
  }

  document.getElementById('credentialInput').value = JSON.stringify(obj, null, 2);
  note.classList.add('show');
  note.innerHTML = `<b>${T('pg.tampered')}</b> ${T('pg.tamperedRun', { mutation: mutation })}`;
  await verifyCredential();
}

const ST_ICON = { P: '✓', F: '✕', W: '!', S: '–' };
const ST_TXT = { P: 'PASS', F: 'FAIL', W: 'WARN', S: 'SKIP' };

function displayResult(data, ms) {
  const div = document.getElementById('result');
  div.innerHTML = '';
  div.classList.add('show');

  const decision = data.decision || (data.valid ? 'PERMIT' : 'DENY');
  const fmt = data.detected_format || data.format || 'unknown';
  const issuer = data.issuer || (data.uts?.trust?.assessor) || 'unknown';
  const score = data.uts?.trust?.score;
  const stages = data.stages || [];

  // Banner
  const banner = document.createElement('div');
  banner.className = 'banner ' + decision;
  banner.innerHTML = `
    <span class="bico">${decision === 'PERMIT' ? '✅' : decision === 'DENY' ? '⛔' : '❓'}</span>
    <div class="bmain">
      <div class="btitle">${decision}</div>
      <div class="bmeta">
        ${T('pg.formatK')} <b>${escapeHtml(String(fmt))}</b> · ${T('pg.issuerK')} <b>${escapeHtml(String(issuer))}</b>${data.failed_stage ? ` · ${T('pg.failedAtK')} <b>${escapeHtml(String(data.failed_stage))}</b>` : ''} · ${T('pg.verifiedIn', { ms: ms })}
        ${decision === 'DENY' ? `<br>${T('pg.goldenRule')}` : ''}
      </div>
    </div>
    <span class="stageline ${decision === 'PERMIT' ? 'ok' : 'bad'}">${T('pg.stagesPassed', { n: stages.filter(s => s.status === 'PASS').length, m: stages.length || 12 })}</span>`;
  div.appendChild(banner);

  // Summary grid
  const sum = document.createElement('div');
  sum.className = 'sumgrid';
  const trustClass = score === undefined ? '' : score >= 7 ? 'mint' : score >= 4 ? 'cyan' : 'red';
  sum.innerHTML = `
    <div class="sitem"><div class="k">${T('pg.kFormat')}</div><div class="v cyan">${escapeHtml(String(fmt))}</div></div>
    <div class="sitem"><div class="k">${T('pg.kIssuer')}</div><div class="v">${escapeHtml(String(issuer))}</div></div>
    <div class="sitem"><div class="k">${T('pg.kScore')}</div><div class="v ${trustClass}">${score !== undefined ? escapeHtml(String(score)) + ' / 10' : 'not declared'}</div></div>
    <div class="sitem"><div class="k">${T('pg.kValidity')}</div><div class="v ${data.valid ? 'mint' : 'red'}">${data.valid ? T('pg.valid') : T('pg.invalid')}</div></div>
    <div class="sitem"><div class="k">${T('pg.kExpires')}</div><div class="v">${escapeHtml(String(data.uts?.lifecycle?.expires_at || T('pg.notDeclared')))}</div></div>`;
  div.appendChild(sum);

  // Issues
  if (data.issues && data.issues.length) {
    const ib = document.createElement('div');
    ib.className = 'issues';
    ib.innerHTML = `<h3>⛔ ${T('pg.issues', { n: data.issues.length })}</h3>` +
      data.issues.map(i => `<div class="iitem"><span>✕</span><span>${escapeHtml(String(i))}</span></div>`).join('');
    div.appendChild(ib);
  }

  // Warnings
  if (data.warnings && data.warnings.length) {
    const wb = document.createElement('div');
    wb.className = 'wbox';
    wb.innerHTML = `<h3>⚠️ ${T('pg.warnings', { n: data.warnings.length })}</h3>` +
      data.warnings.map(w => `<div class="witem"><span>⚠</span><span>${escapeHtml(String(w))}</span></div>`).join('');
    div.appendChild(wb);
  }

  // Pipeline
  if (stages.length) {
    const pl = document.createElement('div');
    pl.className = 'pl';
    const counts = { P: 0, F: 0, W: 0, S: 0 };
    stages.forEach(s => { counts[s.status[0] === 'P' && s.status === 'PASS' ? 'P' : s.status === 'FAIL' ? 'F' : s.status === 'WARN' ? 'W' : 'S']++; });
    pl.innerHTML = `
      <div class="pl-head">
        <h3>${T('pg.pipelineTitle')}</h3>
        <div class="cnt">
          <span class="pc p">${counts.P} ${T('pg.pass')}</span>
          <span class="pc f">${counts.F} ${T('pg.fail')}</span>
          <span class="pc w">${counts.W} ${T('pg.warn')}</span>
          <span class="pc s">${counts.S} ${T('pg.skip')}</span>
        </div>
      </div>
      <div id="stageList"></div>`;
    div.appendChild(pl);

    const list = pl.querySelector('#stageList');
    stages.forEach((s, idx) => {
      const key = s.status === 'PASS' ? 'P' : s.status === 'FAIL' ? 'F' : s.status === 'WARN' ? 'W' : 'S';
      const el = document.createElement('div');
      el.className = 'stage';
      el.innerHTML = `
        <div class="node">
          <div class="num ${key.toLowerCase()}">${String(idx + 1).padStart(2, '0')}</div>
          <div class="conn"></div>
        </div>
        <div class="body">
          <div class="name"><span class="nm">${escapeHtml(s.name)}</span><span class="badge ${key}">${ST_TXT[key]}</span></div>
          <div class="det">${escapeHtml(s.detail || '')}</div>
        </div>`;
      list.appendChild(el);
      // Staggered reveal
      setTimeout(() => el.classList.add('on'), 90 + idx * 95);
    });
  }

  // Raw JSON
  const det = document.createElement('details');
  det.className = 'raw';
  det.innerHTML = `<summary>${T('pg.rawJson')}</summary><pre>${escapeHtml(JSON.stringify(data, null, 2))}</pre>`;
  div.appendChild(det);
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = String(str ?? '');
  return div.innerHTML;
}

/* Handoff from the Credential Translator */
(function () {
  try {
    const handoff = localStorage.getItem('uta_playground_payload');
    if (handoff) {
      localStorage.removeItem('uta_playground_payload');
      const pretty = (() => { try { return JSON.stringify(JSON.parse(handoff), null, 2); } catch { return handoff; } })();
      document.getElementById('credentialInput').value = pretty;
      setTimeout(verifyCredential, 250);
    }
  } catch {}
})();

