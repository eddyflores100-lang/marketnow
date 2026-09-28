/* Extracted from scam-checker.html inline <script> for strict CSP (M-07). */

const T = (k, v) => window.ToolsI18n.t(k, v);
let lastMs = 0;
window.__onLangChange = function () { renderHistory(); if (lastData) displayResult(lastData, lastMs); };

const API = '/api/scam-check?domain=';
let lastData = null;

async function checkDomain() {
  const raw = document.getElementById('domainInput').value.trim();
  const errBox = document.getElementById('err');
  errBox.style.display = 'none';
  if (!raw) { document.getElementById('domainInput').focus(); return; }

  // limpieza client-side — mismas reglas que el servidor (protocolo/ruta/www fuera)
  const input = raw.replace(/^https?:\/\//i, '').replace(/^www\./i, '').split(/[/?#\s]/)[0].trim();
  if (!input || !input.includes('.')) {
    errBox.style.display = 'block';
    errBox.textContent = T('sc.err.invalid', { input: raw.slice(0, 60) });
    return;
  }

  const btn = document.getElementById('checkBtn');
  btn.disabled = true; btn.textContent = T('sc.checking');
  document.getElementById('scanning').classList.add('on');
  document.getElementById('result').classList.remove('show');
  document.getElementById('disclaimerBox').style.display = 'none';

  const started = performance.now();
  try {
    const resp = await fetch(API + encodeURIComponent(input));
    const data = await resp.json().catch(() => null);
    if (!resp.ok) {
      if (data && data.error === 'Invalid domain') {
        throw Object.assign(new Error('invalid'), { invalidInput: true });
      }
      throw new Error('API returned HTTP ' + resp.status);
    }
    const ms = Math.round(performance.now() - started); lastMs = ms;
    document.getElementById('scanning').classList.remove('on');
    displayResult(data, ms);
    saveHistory(input, data);
  } catch (err) {
    document.getElementById('scanning').classList.remove('on');
    errBox.style.display = 'block';
    errBox.textContent = err.invalidInput
      ? T('sc.err.invalid', { input: input.slice(0, 60) })
      : T('sc.apiErr', { err: err.message });
  }
  btn.disabled = false; btn.textContent = T('sc.check');
}

function loadExample(domain) {
  document.getElementById('domainInput').value = domain;
  checkDomain();
}

const DECISION_COLORS = { TRUSTED: 'var(--mint)', CAUTION: 'var(--amber)', SUSPICIOUS: 'var(--red)', UNKNOWN: 'var(--gray)' };
const ADVICE_KEYS = {
  TRUSTED: ['sc.adv.trusted.title', ['sc.adv.trusted.1', 'sc.adv.trusted.2']],
  CAUTION: ['sc.adv.caution.title', ['sc.adv.caution.1', 'sc.adv.caution.2', 'sc.adv.caution.3']],
  SUSPICIOUS: ['sc.adv.suspicious.title', ['sc.adv.suspicious.1', 'sc.adv.suspicious.2', 'sc.adv.suspicious.3']],
  UNKNOWN: ['sc.adv.unknown.title', ['sc.adv.unknown.1', 'sc.adv.unknown.2', 'sc.adv.unknown.3']],
};
function adviceFor(decision, firstParty) {
  if (firstParty) {
    return { title: T('sc.adv.firstparty.title'), items: [T('sc.adv.firstparty.1'), T('sc.adv.firstparty.2')] };
  }
  const [titleKey, itemKeys] = ADVICE_KEYS[decision] || ADVICE_KEYS.UNKNOWN;
  return { title: T(titleKey), items: itemKeys.map(k => T(k)) };
}

function displayResult(data, ms) {
  const div = document.getElementById('result');
  const color = DECISION_COLORS[data.decision] || 'var(--gray)';
  const risk = Math.max(0, Math.min(100, data.risk_score ?? 0));
  const arcLen = Math.PI * 60; // semicircle r=60 → ~188.5
  const offset = arcLen * (1 - risk / 100);
  const triggered = Object.entries(data.checks || {}).filter(([,c]) => c.triggered).length;
  const total = Object.keys(data.checks || {}).length;

  let html = `
    <div class="verdict">
      <div class="gauge">
        <svg width="150" height="88" viewBox="0 0 150 88">
          <defs>
            <linearGradient id="gaugeGrad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stop-color="#00F299"/><stop offset="55%" stop-color="#fbbf24"/><stop offset="100%" stop-color="#f87171"/>
            </linearGradient>
          </defs>
          <path class="track" d="M 15 78 A 60 60 0 0 1 135 78" fill="none" stroke-width="10"/>
          <path class="arc" id="gaugeArc" d="M 15 78 A 60 60 0 0 1 135 78" fill="none" stroke-width="10"
                stroke-dasharray="${arcLen}" stroke-dashoffset="${arcLen}"/>
        </svg>
        <div class="num">${risk}<small>risk / 100 · ${ms ?? '—'}ms</small></div>
      </div>
      <div class="verdict-info">
        <span class="badge b-${data.decision}">${data.decision}</span>
        <div class="domain">${T('sc.checked')} <strong>${escapeHtml(data.domain || '')}</strong> · ${triggered}/${total} ${T('sc.heur')}</div>
        <div class="when">${T('sc.analyzed', { time: new Date().toLocaleTimeString() })} · ${T('sc.engine')}</div>
      </div>
    </div>`;

  // Reasons — first-party banner (translated) takes precedence over the English server reason
  const srvReasons = (data.reasons || []).filter(r => !String(r).startsWith('First-party domain:'));
  if (data.first_party) {
    html += '<div class="reasons"><h3>' + T('sc.why') + '</h3><div class="reason ok"><span class="ico">🏠</span><span>' + T('sc.reason.firstparty', { d: escapeHtml(data.domain || '') }) + '</span></div></div>';
    if (srvReasons.length) {
      html += '<div class="reasons">' + srvReasons.map(r => '<div class="reason"><span class="ico">⚠️</span><span>' + escapeHtml(r) + '</span></div>').join('') + '</div>';
    }
  } else if (data.reasons && data.reasons.length) {
    html += '<div class="reasons"><h3>' + T('sc.why') + '</h3>';
    data.reasons.forEach(r => { html += '<div class="reason"><span class="ico">⚠️</span><span>' + escapeHtml(r) + '</span></div>'; });
    html += '</div>';
  } else if (data.decision === 'TRUSTED') {
    html += '<div class="reasons"><h3>' + T('sc.why') + '</h3><div class="reason ok"><span class="ico">✅</span><span>' + T('sc.reason.allowlist') + '</span></div></div>';
  } else {
    html += '<div class="reasons"><h3>' + T('sc.why') + '</h3><div class="reason neutral"><span class="ico">❓</span><span>' + T('sc.reason.none') + '</span></div></div>';
  }

  // Checks grid
  if (data.checks) {
    html += '<div class="checks"><h3>' + T('sc.allChecks') + '</h3><div class="checks-grid">';
    for (const [name, check] of Object.entries(data.checks)) {
      const cls = check.triggered ? 'triggered' : 'passed';
      const icon = check.triggered ? '⚠️' : '✅';
      const stTxt = check.triggered ? T('sc.status.triggered') : T('sc.status.clear');
      html += `
        <div class="chk ${cls}">
          <div class="hd">${icon} ${escapeHtml(name.replace(/_/g, ' '))}<span class="st">${stTxt}</span></div>
          <div class="dt">${escapeHtml(check.detail || '')}</div>
        </div>`;
    }
    html += '</div></div>';
  }

  // Advice
  const adv = adviceFor(data.decision, data.first_party);
  html += `<div class="advice"><h3>${T('sc.next')}</h3><div class="advice-box adv-${data.decision}">
    <strong>${adv.title}</strong><ul>${adv.items.map(i => '<li>' + i + '</li>').join('')}</ul>
  </div></div>`;

  // Actions
  html += `<div class="actions">
    <button class="abtn" onclick="copyReport()">${T('sc.copy')}</button>
    <a class="abtn" style="text-decoration:none" href="/playground.html">${T('sc.verifyInstead')}</a>
    <a class="abtn" style="text-decoration:none" href="/translate.html">${T('sc.translateInstead')}</a>
  </div>`;

  div.innerHTML = html;
  div.classList.add('show');
  lastData = data;

  // Animate gauge after paint
  requestAnimationFrame(() => {
    setTimeout(() => { document.getElementById('gaugeArc').style.strokeDashoffset = offset; }, 60);
  });

  // Disclaimer
  const d = document.getElementById('disclaimerBox');
  d.style.display = 'block';
  d.innerHTML = `<strong>${T('sc.disclaimer')}</strong> ${escapeHtml(data.honest_disclaimer || T('sc.disclaimerDefault'))}
    &nbsp;·&nbsp; <strong>${T('sc.spec')}</strong> <a href="${escapeHtml(data.spec || '#')}" target="_blank" rel="noopener" style="color:var(--cyan)">${T('sc.repo')}</a>`;
}

function copyReport() {
  if (!lastData) return;
  const text = JSON.stringify(lastData, null, 2);
  navigator.clipboard.writeText(text).then(() => {
    const b = event.target; const old = b.textContent;
    b.textContent = T('c.copied'); b.classList.add('ok');
    setTimeout(() => { b.textContent = old; b.classList.remove('ok'); }, 1800);
  });
}

/* ── History (localStorage) ── */
function saveHistory(domain, data) {
  try {
    const h = JSON.parse(localStorage.getItem('uta_scam_history') || '[]');
    const entry = { domain, decision: data.decision, risk: data.risk_score, at: Date.now() };
    const filtered = h.filter(e => e.domain !== domain);
    filtered.unshift(entry);
    localStorage.setItem('uta_scam_history', JSON.stringify(filtered.slice(0, 8)));
    renderHistory();
  } catch {}
}
function renderHistory() {
  try {
    const h = JSON.parse(localStorage.getItem('uta_scam_history') || '[]');
    const card = document.getElementById('historyCard');
    if (!h.length) { card.style.display = 'none'; return; }
    card.style.display = 'block';
    document.getElementById('historyRow').innerHTML = h.map(e =>
      `<span class="hitem" onclick="loadExample('${escapeHtml(e.domain)}')"><span class="mini" style="background:${DECISION_COLORS[e.decision] || 'var(--gray)'}"></span>${escapeHtml(e.domain)} · ${e.decision}</span>`
    ).join('');
  } catch {}
}
function clearHistory() { localStorage.removeItem('uta_scam_history'); renderHistory(); }
renderHistory();

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = String(str ?? '');
  return div.innerHTML;
}

