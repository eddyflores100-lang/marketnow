/* Extracted from mcps.html inline <script> for strict CSP (M-07). */

const $ = (id) => document.getElementById(id);
const state = { tier: '', q: '', sort: 'trust', risk: '', page: 1, loading: false };

// stats
fetch('/api/certification?summary=1').then(r => r.json()).then(d => {
  $('n-total').textContent = (d.catalog?.total_all || 0).toLocaleString();
  $('n-core').textContent = (d.catalog?.core_certified || 0).toLocaleString();
  $('n-community').textContent = (d.catalog?.community_indexed || 0).toLocaleString();
  $('n-scanned').textContent = (d.deep_scan?.scanned || 0).toLocaleString();
}).catch(() => {});

// tabs
document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => {
  document.querySelectorAll('.tab').forEach(x => x.classList.remove('on'));
  t.classList.add('on');
  state.tier = t.dataset.tier; state.page = 1;
  $('list').innerHTML = '';
  load();
}));

let deb;
$('q').addEventListener('input', e => {
  clearTimeout(deb);
  deb = setTimeout(() => { state.q = e.target.value.trim(); state.page = 1; $('list').innerHTML = ''; load(); }, 320);
});
$('sort').addEventListener('change', e => { state.sort = e.target.value; state.page = 1; $('list').innerHTML = ''; load(); });
$('risk').addEventListener('change', e => { state.risk = e.target.value; state.page = 1; $('list').innerHTML = ''; load(); });
$('more').addEventListener('click', () => { state.page++; load(); });

function esc(s) { return String(s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function riskChip(r) { return `<span class="chip ${esc(r || 'yellow')}">${esc(r || 'yellow')}</span>`; }

async function load() {
  if (state.loading) return; state.loading = true;
  $('more').style.display = 'none';
  try {
    if (state.tier === 'aggregate') {
      const u = new URL('/api/community', location.origin);
      u.searchParams.set('page', state.page); u.searchParams.set('limit', 24);
      if (state.q) u.searchParams.set('q', state.q);
      const d = await (await fetch(u)).json();
      if (d.entries.length) {
        $('list').insertAdjacentHTML('beforeend', d.entries.map(e => `
          <div class="card"><div class="row1"><span class="name">${esc(e.name)}</span><span class="chip tier">tracker</span><span class="chip src">glama-directory</span></div>
          <div class="meta"><a href="${esc(e.repo_url)}" rel="nofollow noopener">GitHub: ${esc(e.owner)}/${esc(e.name)}</a></div></div>`).join(''));
      } else if (state.page === 1) {
        $('list').innerHTML = '<div class="empty">No tracked servers match this search.</div>';
      }
      $('more').style.display = d.has_next ? 'block' : 'none';
    } else {
      const u = new URL('/api/skills', location.origin);
      u.searchParams.set('page', state.page); u.searchParams.set('limit', 24);
      u.searchParams.set('sort', state.sort);
      if (state.q) u.searchParams.set('q', state.q);
      if (state.risk) u.searchParams.set('risk', state.risk);
      if (state.tier) u.searchParams.set('tier', state.tier);
      const d = await (await fetch(u)).json();
      if (d.skills.length) {
        $('list').insertAdjacentHTML('beforeend', d.skills.map(s => {
          const src = typeof s.source === 'object' ? (s.source?.type || 'index') : (s.source || 'index');
          const trust = Number.isFinite(s.trust_score_100)
            ? `<span class="trust ${s.trust_score_100 < 60 ? 'low' : ''}" title="evidence-based trust">T ${s.trust_score_100}</span>` : '';
          const tier = s.tier === 'community' ? '<span class="chip tier">community</span>' : '';
          const dl = s.npm_downloads_wk ? `<span>${Number(s.npm_downloads_wk).toLocaleString()} dl/wk</span>` : '';
          const st = s.source?.stars ? `<span>${Number(s.source.stars).toLocaleString()} stars</span>` : '';
          const uc = s.source?.use_count ? `<span>${Number(s.source.use_count).toLocaleString()} uses</span>` : '';
          const page = s.slug ? `<a href="/s/${encodeURIComponent(s.slug)}">details →</a>` : '';
          return `<div class="card">
            <div class="row1"><span class="name">${esc(s.name)}</span>${trust}${riskChip(s.risk_level)}<span class="chip src">${esc(src)}</span>${tier}</div>
            <div class="desc">${esc((s.description || '').slice(0, 160))}</div>
            <div class="meta"><code>${esc(s.install || '')}</code></div>
            <div class="meta">${dl}${st}${uc}<span>v${esc(s.version || '?')}</span>${page}</div>
          </div>`;
        }).join(''));
      } else if (state.page === 1) {
        $('list').innerHTML = '<div class="empty">No results. Try another search or clear filters.</div>';
      }
      $('more').style.display = d.has_next ? 'block' : 'none';
    }
  } catch (e) {
    $('list').insertAdjacentHTML('beforeend', '<div class="empty">Error loading — retry.</div>');
  }
  state.loading = false;
}
load();

