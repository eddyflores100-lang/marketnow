/* Extracted from submit.html inline <script> for strict CSP (M-07). */

(function () {
  var $ = function (id) { return document.getElementById(id); };
  function build() {
    var pkg = {
      name: $('name').value.trim(),
      version: $('version').value.trim() || '1.0.0',
      description: $('description').value.trim(),
      author: $('author').value.trim()
    };
    var opt = { runtime: $('runtime').value, homepage: $('homepage').value.trim(),
                repo_url: $('repo_url').value.trim(), install: $('install').value.trim() };
    for (var k in opt) if (opt[k]) pkg[k] = opt[k];
    var tu = $('testurl').value.trim();
    if (tu) { pkg.test = { url: tu }; pkg.tags = ['mcp', 'remote']; }
    var m = $('pmodel').value;
    if (m) {
      var pr = { model: m };
      var pp = $('pprice').value.trim(), pc = $('pcurrency').value.trim(), pd = $('pdetails').value.trim();
      if (pp !== '') { if (/^\d+(\.\d+)?$/.test(pp)) pr.price = parseFloat(pp); else pr.price = pp; }
      if (pc) pr.currency = pc;
      if (pd) pr.details = pd;
      pkg.pricing = pr;
    }
    return pkg;
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function render(status, j) {
    var box = $('result'); box.className = 'show';
    var acc = j && (j.accepted === true || j.verdict === 'accepted');
    var v = $('verdict');
    var kind = acc ? 'green' : 'red';
    var label = (j && j.verdict) ? String(j.verdict).toUpperCase() : ('HTTP ' + status);
    v.innerHTML = '<span class="badge ' + kind + '">' + esc(label) + '</span> ' +
      (acc ? '— stored in the public queue, pending L2 review' : '— fix the reasons below and resubmit');
    var meta = [];
    if (j && j.id) meta.push('id: <code>' + esc(j.id) + '</code>');
    if (j && j.trust_score_100 != null) meta.push('trust: <strong>' + esc(j.trust_score_100) + '/100</strong>');
    if (j && j.pricing) {
      var pp = j.pricing; var ptxt = [pp.model, (pp.price !== null && pp.price !== undefined) ? pp.price : '', pp.currency || ''].filter(Boolean).join(' · ');
      meta.push('pricing: <span class="badge green">' + esc(ptxt) + '</span>');
    }
    if (j && j.status) meta.push(esc(j.status));
    if (j && j.storage && j.storage.url) meta.push('audit: <a href="' + esc(j.storage.url) + '" target="_blank" rel="noopener">public queue record</a>');
    $('rmeta').innerHTML = meta.join(' · ');
    var rs = (j && j.reasons) || [];
    $('rreasons').innerHTML = rs.map(function (r) {
      var sev = r.severity || 'info';
      var col = sev === 'critical' || sev === 'high' ? 'red' : (sev === 'medium' ? 'yellow' : 'green');
      return '<li><span class="badge ' + col + '">' + esc(sev.toUpperCase()) + '</span> <strong>' + esc(r.check) + '</strong>' +
        (r.field ? ' (' + esc(r.field) + ')' : '') + ' — ' + esc(r.reason) + '</li>';
    }).join('');
    $('rjson').textContent = JSON.stringify(j, null, 2);
    box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
  function send(dry) {
    var pkg = build();
    var errs = [];
    if (!pkg.name || pkg.name.length < 2) errs.push('name (2+ chars)');
    if (!pkg.description || pkg.description.length < 10) errs.push('description (10+ chars)');
    if (!pkg.author) errs.push('author');
    if (errs.length) {
      $('result').className = 'show';
      $('verdict').innerHTML = '<span class="badge red">MISSING FIELDS</span>';
      $('rmeta').innerHTML = ''; $('rreasons').innerHTML = '<li>' + errs.map(esc).join(' · ') + '</li>';
      $('rjson').textContent = '';
      return;
    }
    var b = $('bsubmit'), d = $('bdry');
    b.disabled = d.disabled = true;
    fetch(dry ? '/api/submit?dry_run=1' : '/api/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(pkg)
    }).then(function (r) { return r.json().then(function (j) { return { s: r.status, j: j }; }); })
      .then(function (o) { render(o.s, o.j); })
      .catch(function (e) {
        $('result').className = 'show';
        $('verdict').innerHTML = '<span class="badge red">NETWORK ERROR</span>';
        $('rjson').textContent = String(e);
      })
      .finally(function () { b.disabled = d.disabled = false; });
  }
  $('bsubmit').addEventListener('click', function () { send(false); });
  $('bdry').addEventListener('click', function () { send(true); });
})();

