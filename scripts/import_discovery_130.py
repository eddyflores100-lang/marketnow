#!/usr/bin/env python3
# ⚠️ SENTINEL PROPRIETARY — Copyright (c) 2026 AliceLabs LLC. All Rights Reserved.
"""
Task 130 — "publica todo": import the discovery queue (1,893 pending-review
candidates from auto-discover + external-discovery) into the live catalog and
sync the whole count constellation.

Design (documented in auto-discover-mcp.mjs / external-discover-mcp.mjs):
  import = deliberate dev flow →
    1. skills-lite.json   +1,888 entries (compact, UTF-8, canonical 19-field schema)
    2. free-skills.json   regenerated (free filter formula of api/skills.js)
    3. search-index.json  regenerated (fixes stale 9,248 snapshot)
    4. catalog-names.txt  regenerated (sorted unique names)
    5. catalog-meta.json  tiers + sources + total_all
    6. lib/stats-base.json discovery.*
    7. certification.json regenerated (C1-C10 recomputed in full + distributions)
    8. text surfaces: agent.json (x2), mcp.json, mcp-marketplace.json,
       server-card.json, ai-plugin.json, index.html, api/skills.js, audit-gate.mjs
    9. sitemap-skills-b3.xml +1,888 /s/{slug} URLs (all pages published)
   10. queue entries marked status=imported

After this script: node aep-marketplace/scripts/audit-report-sync.mjs
(reconciles audit-report, skills_stats, stats-base.security, agent.metrics,
sentinel-roadmap, liveStats, README table, evidence/sentinel html, owasp)
then audit-gate.mjs.
"""
import json
import re
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

REPO = Path('/home/z/my-project/mn-marketnow')
AE = REPO / 'aep-marketplace'
TODAY = '2026-10-02'
NOW_ISO = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%S.') + f'{datetime.now(timezone.utc).microsecond // 1000:03d}Z'

report = []


def log(msg):
    print(msg)
    report.append(msg)


# ── load ────────────────────────────────────────────────────────────────────
skills = json.loads((AE / 'public/api/skills-lite.json').read_text())
queue = json.loads((REPO / '_data/discovery_queue.json').read_text())
cm = json.loads((AE / 'public/api/catalog-meta.json').read_text())
sb = json.loads((AE / 'lib/stats-base.json').read_text())
cert_old = json.loads((AE / 'public/api/certification.json').read_text())
scans = json.loads((AE / 'public/api/certification-scans.json').read_text())

old_total = len(skills)
old_tracked = cm['total_all']

# ── C4 repair (12 Smithery-era http:// provenance URLs) ─────────────────────
# Verified live 2026-10-02: 2 resolved via GitHub redirect (API 200),
# 10 upgraded to https with live 200 (browser UA).
C4_REPAIRS = {
    'mn-sm-00022': ('https://github.com/hamid-vakilzadeh/AIRA-SemanticScholar', 'github redirect (API 200)'),
    'mn-sm2-00008': ('https://www.talnexis.com', 'https upgrade verified 200'),
    'mn-sm2-00405': ('https://telemost.io', 'https upgrade verified 200'),
    'mn-sm2-00835': ('https://dadada.com/', 'https upgrade verified 200'),
    'mn-sm2-01996': ('https://tubepull.com', 'https upgrade verified 200 (UA)'),
    'mn-sm2-02170': ('https://mcp.openagenda.com', 'https upgrade verified 200'),
    'mn-sm2-02831': ('https://haldir.xyz', 'https upgrade verified 200'),
    'mn-sm2-03477': ('https://youtubetranscript.dev/', 'https upgrade verified 200'),
    'mn-sm2-04091': ('https://github.com/aeriis-kr/opendata-mcp', 'github redirect (API 200)'),
    'mn-sm2-04206': ('https://ai.emercoin.com', 'https upgrade verified 200'),
    'mn-sm2-04498': ('https://codeqr.io', 'https upgrade verified 200'),
    'mn-sm2-05397': ('https://profound.fate-craft.com/tools', 'https upgrade verified 200'),
}
repaired = 0
for s in skills:
    if s['id'] in C4_REPAIRS:
        newurl, why = C4_REPAIRS[s['id']]
        s['source'] = {**s.get('source', {}), 'url': newurl,
                       'note': (str(s.get('source', {}).get('note') or '') + f' [C4 repair 2026-10-02: {why}]').strip()}
        repaired += 1
log(f'[c4-repair] {repaired} provenance URLs repaired (http→https / github redirect)')

ids = {s['id'] for s in skills}
slugs = {s['slug'] for s in skills}
log(f'[load] catalog={old_total}  tracked={old_tracked}  queue={len(queue["entries"])}')

# ── risk + trust heuristics ─────────────────────────────────────────────────
RISK_RED = re.compile(r'\b(npx|uvx|pnpm|bunx|yarn|pip|pipx|npm\s+i|npm\s+install|deno\s+run|bun\s+x)\b', re.I)
RISK_YELLOW = re.compile(r'(git\s+clone|cargo\s|go\s+install|docker|https?://|curl|wget|git\s+)', re.I)


def classify_risk(install):
    i = install or ''
    if RISK_RED.search(i):
        return 'red'
    if RISK_YELLOW.search(i):
        return 'yellow'
    return 'yellow'


def trust_of(sk):
    """Source-evidence heuristic (mirrors the catalog's documented model:
    trust_score_100 = source evidence heuristic, bounded [30,88] for
    auto-scanned entries — human-reviewed entries can exceed it)."""
    src = sk.get('source') or {}
    t = 40  # indexed + L1-certified + provenance URL on file
    stars = src.get('stars') or 0
    if stars >= 5000:
        t += 18
    elif stars >= 500:
        t += 14
    elif stars >= 50:
        t += 10
    elif stars >= 10:
        t += 6
    elif stars >= 1:
        t += 3
    if sk.get('license'):
        t += 4
    if src.get('language'):
        t += 2
    if len(sk.get('description') or '') >= 80:
        t += 2
    db = sk.get('discovered_by')
    nsrc = len(db) if isinstance(db, (list, tuple)) else 1
    if nsrc >= 2:
        t += 6  # cross-validated in 2+ external directories
    if src.get('verified') is True:
        t += 3  # registry-verified listing (smithery verified flag)
    if src.get('type') == 'npm-registry':
        t += 3  # registry version verified during discovery
    lp = str(src.get('last_push') or '')
    if lp >= '2026-04-01':
        t += 3  # active repo (< ~6 months)
    return max(30, min(88, t))


# ── build new entries ───────────────────────────────────────────────────────
pending = [e for e in queue['entries'] if e.get('status') == 'pending-review']
new_entries = []
id_suffixes = {}
slug_suffixes = {}
for e in pending:
    sk = e['skill']
    sid = str(sk.get('id') or '').strip()
    sslug = str(sk.get('slug') or '').strip()
    if not sid or not sslug:
        continue
    base_id, base_slug = sid, sslug
    n = 1
    while sid in ids:
        n += 1
        sid = f'{base_id}-{n}'
    if n > 1:
        id_suffixes[base_id] = n
    n = 1
    while sslug in slugs:
        n += 1
        sslug = f'{base_slug}-{n}'
    if n > 1:
        slug_suffixes[base_slug] = n
    ids.add(sid)
    slugs.add(sslug)
    entry = {
        'id': sid,
        'name': sk.get('name') or sslug,
        'slug': sslug,
        'description': (sk.get('description') or '')[:300],
        'category': sk.get('category') or 'Developer Tools',
        'price': 0,
        'free': True,
        'payment': 'free',
        'sentinel_score': sk.get('sentinel_score', 7),
        'review_status': 'auto-scanned',
        'risk_level': classify_risk(sk.get('install')),
        'install': sk.get('install') or '',
        'author': (sk.get('author') or 'unknown').strip() or 'unknown',
        'version': sk.get('version') or '1.0.0',
        'tags': [str(t) for t in (sk.get('tags') or [])][:10],
        'source': sk.get('source') or {},
        'indexed_at': TODAY,
        'tier': 'core',
        'trust_score_100': trust_of(sk),
    }
    new_entries.append(entry)

skills.extend(new_entries)
new_total = len(skills)
n_new = len(new_entries)
log(f'[import] +{n_new} entries → catalog={new_total} (ids suffixed: {len(id_suffixes)}, slugs suffixed: {len(slug_suffixes)})')

# ── derived: free-skills / search-index / catalog-names ─────────────────────
free_filter = lambda s: s.get('is_free') is True or s.get('free') is True or (s.get('price') == 0 and not s.get('payment'))
free_list = [
    {'i': s['id'], 'n': s['name'], 's': s['slug'], 'c': s.get('category') or '',
     'd': (s.get('description') or '')[:200], 'ss': s.get('sentinel_score', 0),
     'r': s.get('risk_level') or 'unknown', 't': s.get('install') or ''}
    for s in skills if free_filter(s)
]
search_index = [
    {'i': s['id'], 'n': s['name'], 's': s['slug'], 'c': s.get('category') or '',
     'd': (s.get('description') or '')[:200], 'ss': s.get('sentinel_score', 0),
     'r': s.get('risk_level') or 'unknown', 't': [str(t) for t in (s.get('tags') or [])][:5]}
    for s in skills
]
names = sorted({s['name'] for s in skills if s.get('name')})

dump = lambda obj: json.dumps(obj, ensure_ascii=False, separators=(',', ':'))
(AE / 'public/api/skills-lite.json').write_text(dump(skills), encoding='utf-8')
(AE / 'public/api/free-skills.json').write_text(dump(free_list), encoding='utf-8')
(AE / 'public/api/search-index.json').write_text(dump(search_index), encoding='utf-8')
(AE / 'public/api/catalog-names.txt').write_text('\n'.join(names) + '\n', encoding='utf-8')
log(f'[derived] free-skills={len(free_list)}  search-index={len(search_index)}  catalog-names={len(names)}')

# ── categories (same key transform as api/skills.js) ─────────────────────────
cats = {}
for s in skills:
    k = re.sub(r'[\s/]+', '-', str(s.get('category') or 'uncategorized').lower().strip())
    cats[k] = cats.get(k, 0) + 1
cats_sorted = dict(sorted(cats.items(), key=lambda kv: -kv[1]))

# ── catalog-meta ─────────────────────────────────────────────────────────────
src_delta = Counter(e['source'].get('type') or 'unknown' for e in new_entries)
cm['sources']['github'] = cm['sources'].get('github', 0) + src_delta.get('github', 0)
cm['sources']['npm-registry'] = cm['sources'].get('npm-registry', 0) + src_delta.get('npm-registry', 0)
cm['sources']['smithery'] = cm['sources'].get('smithery', 0) + src_delta.get('smithery', 0)
cm['core_certified'] = cm['core_certified'] + n_new
cm['total_all'] = cm['total_all'] + n_new
cm['generated_at'] = TODAY
new_tracked = cm['total_all']
(AE / 'public/api/catalog-meta.json').write_text(json.dumps(cm, indent=2) + '\n', encoding='utf-8')
log(f'[catalog-meta] total_all={new_tracked}  core={cm["core_certified"]}  community={cm["community_indexed"]}  aggregate={cm["aggregate_tracked"]}  sources+= {dict(src_delta)}')

# ── stats-base (discovery only; security.* lo reconcilia audit-report-sync) ──
d = sb['discovery']
d['total_mcp_servers'] = new_total
d['total_tracked_all_sources'] = new_tracked
d['core_certified'] = cm['core_certified']
d['community_indexed'] = cm['community_indexed']
d['aggregate_tracked'] = cm['aggregate_tracked']
d['free'] = len(free_list)
d['free_to_install'] = new_total
d['paid'] = new_total - len(free_list)
d['categories'] = cats_sorted
sb['generated_at'] = TODAY
sb['security']['l1_index_certified'] = new_total  # audit-report-sync lo reafirma
(AE / 'lib/stats-base.json').write_text(json.dumps(sb, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
log(f'[stats-base] discovery synced (categories={len(cats_sorted)})')

# ── certification.json regen (C1-C10 recomputed) ────────────────────────────
REQUIRED = ('id', 'slug', 'name', 'description', 'category', 'install', 'author', 'source', 'price')

c1_fail = new_total - len({s['id'] for s in skills})
c2_fail = new_total - len({s['slug'] for s in skills})
c3_fail = sum(1 for s in skills if any(not str(s.get(f) or '').strip() and f not in ('price',) for f in REQUIRED[:-1]) or not isinstance(s.get('source'), (dict,)))
c4_examples = []
for s in skills:
    u = (s.get('source') or {}).get('url')
    if not u:
        c4_examples.append((s['id'], 'missing'))
    else:
        try:
            p = urlparse(str(u))
            if p.scheme != 'https' or not p.netloc:
                c4_examples.append((s['id'], 'not https+host'))
        except Exception:
            c4_examples.append((s['id'], 'unparseable'))
c4_fail = len(c4_examples)
c5_fail = sum(1 for s in skills if s.get('risk_level') not in ('red', 'yellow', 'green'))
c6_fail = sum(1 for s in skills if not isinstance(s.get('trust_score_100'), (int, float)) or not (0 <= s.get('trust_score_100', -1) <= 100))
c7_fail = sum(1 for s in skills if not isinstance(s.get('sentinel_score'), (int, float)) or not (0 <= s.get('sentinel_score', -1) <= 10))
c8_fail = sum(1 for s in skills if not re.match(r'^\d{4}-\d{2}-\d{2}', str(s.get('indexed_at') or '')))
c9_fail = sum(1 for s in skills if not str(s.get('install') or '').strip())
c10_fail = sum(1 for s in skills if (s.get('free') and s.get('price') != 0) or (s.get('price', 0) > 0 and not s.get('payment')))

fails = {'C1': c1_fail, 'C2': c2_fail, 'C3': c3_fail, 'C4': c4_fail, 'C5': c5_fail,
         'C6': c6_fail, 'C7': c7_fail, 'C8': c8_fail, 'C9': c9_fail, 'C10': c10_fail}
log(f'[cert] C1-C10 fails: {fails}')
if any(fails.values()):
    log(f'[cert] C4 examples (first 5): {c4_examples[:5]}')
    if c1_fail or c2_fail or c3_fail or c5_fail or c6_fail or c7_fail or c8_fail or c9_fail:
        log('[cert] ⚠ FAILS beyond C4 — ABORTING before write for manual review')
        sys.exit(2)

src_counter = Counter((s.get('source') or {}).get('type') or 'unknown' for s in skills)
risk_counter = Counter(s.get('risk_level') for s in skills)
checks = [
    ('C1', 'unique id across catalog'),
    ('C2', 'unique slug (badge + /s/ pages)'),
    ('C3', 'required fields present'),
    ('C4', 'provenance URL well-formed (https + real host); resolvability spot-checked by audit-gate'),
    ('C5', 'risk_level in model {red,yellow,green}'),
    ('C6', 'trust_score_100 within [0,100]'),
    ('C7', 'sentinel_score within [0,10]'),
    ('C8', 'indexed_at recorded (ISO date)'),
    ('C9', 'install command non-empty'),
    ('C10', 'price/free consistency (free⇒price 0; paid⇒payment model declared)'),
]
checks_json = []
for cid, desc in checks:
    f = fails[cid]
    entry = {'id': cid, 'desc': desc, 'total': new_total, 'pass': new_total - f, 'fail': f,
             'fail_rate': round(f / new_total, 6) if new_total else 0, 'examples': []}
    if cid == 'C4' and f:
        entry['examples'] = [{'id': i, 'reason': r} for i, r in c4_examples[:5]]
    checks_json.append(entry)

cert = {
    'schema': 'marketnow-certification/1.0',
    'generated_at': NOW_ISO,
    'supersedes_generated_at': cert_old['generated_at'],
    'level': 1,
    'level_name': 'index-certified',
    'catalog_total': new_total,
    'methodology': {
        'model': cert_old['methodology']['model'],
        'risk_model': cert_old['methodology']['risk_model'],
        'repair_passes': cert_old['methodology']['repair_passes'],
        'reproducibility': f'python3 scripts/import_discovery_130.py regen over the deployed catalog bundle (public/api/skills-lite.json, {new_total} entries — the same bundle the UI and /api/skills serve). Checks C1-C10 recomputed in full; distributions recomputed from data. C4 checks URL well-formedness (https + host); live resolvability is spot-checked by the audit-gate workflow. Report served at /api/certification',
        'import_2026_10_02': {
            'imported': n_new,
            'from': '_data/discovery_queue.json (auto-discover + external-discovery: mcpservers.org sitemaps + Smithery registry + npm search, L1.7 pre-filtered, 0 blocked)',
            'tier': 'core',
            'trust_heuristic': 'source-evidence: base 40 + stars bucket + license + language + description substance + cross-directory validation + registry verification + repo activity, bounded [30,88] for auto-scanned entries',
        },
    },
    'checks': checks_json,
    'index_certification': {
        'coverage': f'{10 * new_total}/{10 * new_total}',
        'all_checks_pass': all(v == 0 for v in fails.values()),
        'checks_passed': 10 - sum(1 for v in fails.values() if v),
        'checks_total': 10,
        'scope': f'L1 index certification only: 10 checks x {new_total} entries ({10 * new_total} checks). L2 Sentinel adds {29 * (scans.get("stats") or {}).get("scanned", 0)} rule checks (29 x {(scans.get("stats") or {}).get("scanned", 0)}) — see agent.json security_checks_breakdown.',
    },
    'distributions': {
        'sources': dict(src_counter.most_common()),
        'risk': dict(risk_counter),
        'free_vs_paid': {'free': len(free_list), 'paid': new_total - len(free_list)},
    },
    'repairs_applied': {
        **cert_old.get('repairs_applied', {}),
        'c4_provenance_urls_2026_10_02': {
            'fixed': repaired,
            'detail': {sid: url for sid, (url, _) in C4_REPAIRS.items()},
            'method': 'http→https upgrade verificado 200 en vivo (browser UA) + 2 resoluciones vía redirect de la GitHub API (AIRA-SemanticScholar, aeriis-kr/opendata-mcp)',
        },
        'import_external_discovery_2026_10_02': {
            'imported': n_new,
            'sources': dict(src_delta),
            'detail': 'Cola de discovery externo (mcpservers.org + Smithery + npm + auto-discover) importada al catálogo: tier core, risk reclasificado por mecánica de install, trust por heurística de evidencia documentada arriba. Ids/slugs sufijados en colisión.',
        },
    },
    'deep_scan': {
        'level': 2,
        'level_name': 'sentinel-scanned',
        'detail_url': '/api/certification-scans.json',
        'scanned': (scans.get('stats') or {}).get('scanned'),
        'clean': (scans.get('stats') or {}).get('clean'),
        'flagged_warning': (scans.get('stats') or {}).get('flagged_warning'),
        'flagged_error': (scans.get('stats') or {}).get('flagged_error'),
        'scan_errors': (scans.get('stats') or {}).get('scan_errors'),
        'weekly_download_volume_covered': (scans.get('stats') or {}).get('weekly_download_volume_covered'),
        'generated_at': scans.get('generated_at'),
    },
    'benchmark': cert_old.get('benchmark'),
    'layers_evidence': cert_old.get('layers_evidence', '/api/security'),
}
(AE / 'public/api/certification.json').write_text(json.dumps(cert, indent=2) + '\n', encoding='utf-8')
log(f'[cert] regenerated: catalog_total={new_total}  risk={dict(risk_counter)}')

# ── text surfaces: number constellation ─────────────────────────────────────
PAIRS = [
    ('686,170', '705,050'),
    ('686170', '705050'),
    ('768,849', '787,729'),
    ('768849', '787729'),
    ('68,388/68,388', '70,505/70,505'),
    ('68,617', '70,505'),
    ('68617', '70505'),
    ('132,966', '134,854'),
    ('132966', '134854'),
]
TEXT_FILES = [
    AE / 'public/api/agent.json',
    AE / 'public/.well-known/agent.json',
    AE / 'public/.well-known/mcp.json',
    AE / 'public/.well-known/mcp-marketplace.json',
    AE / 'public/.well-known/mcp/server-card.json',
    AE / 'public/.well-known/ai-plugin.json',
    AE / 'index.html',
]
for p in TEXT_FILES:
    t = p.read_text(encoding='utf-8')
    n = 0
    for old, new in PAIRS:
        n += t.count(old)
        t = t.replace(old, new)
    p.write_text(t, encoding='utf-8')
    log(f'[text] {p.relative_to(REPO)}: {n} replacements')

# api/skills.js — stale free_install prose (API response field)
p = AE / 'api/skills.js'
t = p.read_text(encoding='utf-8')
t2 = t.replace('every free skill (68,387 of 68,388) installs directly', f'every free skill ({len(free_list):,} of {new_total:,}) installs directly')
p.write_text(t2, encoding='utf-8')
log(f'[text] api/skills.js free_install: {"patched" if t != t2 else "no change"}')

# ── audit-gate.mjs: hard-coded expectations + cert-fresh regex (October bug) ─
p = AE / 'scripts/audit-gate.mjs'
t = p.read_text(encoding='utf-8')
t2 = t.replace('sbT === 132966', 'sbT === 134854')
t2 = t2.replace('mkT === 68617', 'mkT === 70505')
t2 = t2.replace('aipN === 68617', 'aipN === 70505')
t2 = t2.replace('mcp.marketplace_stats?.total_skills === 68617', 'mcp.marketplace_stats?.total_skills === 70505')
t2 = t2.replace("includes('(132,966 total tracked)')", "includes('(134,854 total tracked)')")
t2 = t2.replace('desc 132,966 · 68,617', 'desc 134,854 · 70,505')
t2 = t2.replace('132,966/68,617 consistentes', '134,854/70,505 consistentes')
# cert generated_at freshness: the old regex only accepted 2026-09-2x/3x or 2027+
# → every October regen would fail. Extend to 2026-10/11/12.
t2 = t2.replace('/^2026-09-(2[0-9]|30)|^202[7-9]-/g', '/^2026-(09-(2[0-9]|30)|1[0-2]-)|^202[7-9]-/g')
t2 = t2.replace('(^2026-09-(2[0-9]|30)|^202[7-9]-)', '(^2026-(09-(2[0-9]|30)|1[0-2]-)|^202[7-9]-)')
t2 = t2.replace('/^2026-09-(2[0-9]|30)|^202[7-9]-/', '/^2026-(09-(2[0-9]|30)|1[0-2]-)|^202[7-9]-/')
p.write_text(t2, encoding='utf-8')
log(f'[gate] audit-gate.mjs patched: {"OK" if t != t2 else "NO CHANGE (review!)"}')
if '132966' in t2.replace('134854', '') or '68617' in t2.replace('70505', ''):
    # leftover occurrences that are not part of other tokens — surface them
    for line in t2.splitlines():
        if '132966' in line or ('68617' in line and '705050' not in line):
            log('[gate] ⚠ leftover: ' + line.strip()[:120])

# ── sitemaps: publish all new pages (/s/{slug}) ─────────────────────────────
b3 = AE / 'public/sitemap-skills-b3.xml'
t = b3.read_text(encoding='utf-8')
urls = ''.join(
    f'<url><loc>https://www.marketnow.site/s/{s["slug"]}</loc><lastmod>{TODAY}</lastmod>'
    f'<changefreq>monthly</changefreq><priority>0.6</priority></url>\n'
    for s in new_entries
)
t = t.replace('</urlset>', urls + '</urlset>')
b3.write_text(t, encoding='utf-8')
idx = AE / 'public/sitemap-skills-index.xml'
t = idx.read_text(encoding='utf-8')
t = re.sub(r'<sitemap><loc>[^<]*sitemap-skills-b3\.xml</loc>(?:<lastmod>[^<]*</lastmod>)?</sitemap>',
           f'<sitemap><loc>https://www.marketnow.site/sitemap-skills-b3.xml</loc><lastmod>{TODAY}</lastmod></sitemap>', t)
idx.write_text(t, encoding='utf-8')
count_b3 = t and (b3.read_text(encoding='utf-8').count('<loc>'))
log(f'[sitemap] b3 URLs={count_b3} (+{n_new})  index lastmod updated')

# ── queue: mark imported ────────────────────────────────────────────────────
for e in queue['entries']:
    if e.get('status') == 'pending-review':
        e['status'] = 'imported'
        e['imported_at'] = NOW_ISO
        e['imported_into'] = e['skill']['id']
queue['stats'] = {**queue.get('stats', {}), 'imported': n_new, 'imported_at': NOW_ISO,
                  'note_import': 'Task 130: cola consumida por scripts/import_discovery_130.py — catálogo 68,617→' + str(new_total)}
(REPO / '_data/discovery_queue.json').write_text(json.dumps(queue, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
log(f'[queue] {n_new} entries marked imported')

# ── summary ─────────────────────────────────────────────────────────────────
top_authors = Counter(s['author'] for s in new_entries).most_common(10)
log('')
log('=' * 64)
log(f'IMPORT COMPLETE  {old_total:,} → {new_total:,} (+{n_new:,})')
log(f'  tracked:       {old_tracked:,} → {new_tracked:,}')
log(f'  free:          {len(free_list):,}   paid: {new_total - len(free_list):,}')
log(f'  risk:          {dict(risk_counter)}')
log(f'  new /s/ pages: {n_new:,} published to sitemap-skills-b3.xml')
log(f'  top authors:   {top_authors[:5]}')
log('=' * 64)
(Path('/home/z/my-project/scripts/import_discovery_130.report.txt')).write_text('\n'.join(report) + '\n')
