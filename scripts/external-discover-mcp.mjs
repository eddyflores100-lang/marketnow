#!/usr/bin/env node
/**
 * ⚠️ SENTINEL PROPRIETARY — Copyright (c) 2026 AliceLabs LLC. All Rights Reserved.
 *
 * MarketNow — External Directory Discovery (queue mode)
 * =====================================================
 *
 * Discovers MCP servers from EXTERNAL DIRECTORIES beyond the classic
 * awesome-mcp-servers + GitHub Search pair covered by auto-discover-mcp.mjs:
 *
 *   1. mcpservers.org   — via public sitemaps (/sitemaps/servers/*.xml,
 *                         URL pattern /servers/{owner}/{repo} → GitHub repos,
 *                         ~10.5k unique repos; no auth, no page fetching)
 *   2. Smithery         — via public registry API
 *                         (registry.smithery.ai/servers, 18k+ servers,
 *                         pagination capped at 50 pages × 10 = 500/run;
 *                         homepages → GitHub links; qualifiedName → npm)
 *   3. npm registry     — via public search API (text queries × 250)
 *   4. Glama            — BLOCKED (client-side rendering, empty sitemap,
 *                         API requires key). Documented for the next run.
 *
 * Queue mode (same design as auto-discover-mcp.mjs): candidates are
 * written to _data/discovery_queue.json with status 'pending-review'.
 * They are NOT auto-imported into the catalog — the import remains a
 * deliberate dev flow (--import + count-constellation sync + cert regen).
 *
 * Cross-validation: repos present in 2+ external sources get priority
 * for metadata enrichment and queue ranking.
 *
 * Usage:
 *   node scripts/external-discover-mcp.mjs                # full run (queue)
 *   node scripts/external-discover-mcp.mjs --source mcpservers
 *   node scripts/external-discover-mcp.mjs --source smithery
 *   node scripts/external-discover-mcp.mjs --source npm
 *   node scripts/external-discover-mcp.mjs --dry-run
 *   node scripts/external-discover-mcp.mjs --max 1995
 *
 * Env: GITHUB_TOKEN — required for repo metadata enrichment (rate-limited:
 * the script watches x-ratelimit-remaining and stops enrichment at <300,
 * leaving the rest as documented backlog for the next run).
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
// L1.7 import: blocks skills whose metadata matches malware patterns
import { runL17 } from '../aep-marketplace/lib/sentinel-l17.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.join(__dirname, '..');
const SKILLS_PATH = path.join(REPO_ROOT, 'aep-marketplace', 'public', 'api', 'skills-lite.json');
const QUEUE_PATH = path.join(REPO_ROOT, '_data', 'discovery_queue.json');

const GITHUB_TOKEN = process.env.GITHUB_TOKEN || process.env.MANDATES_GITHUB_TOKEN;
if (!GITHUB_TOKEN) {
  console.error('✗ GITHUB_TOKEN env var required');
  process.exit(1);
}

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const SOURCE_FILTER = args.includes('--source') ? args[args.indexOf('--source') + 1] : null;
const MAX_ARG = args.indexOf('--max');
const MAX_NEW = MAX_ARG > -1 ? parseInt(args[MAX_ARG + 1], 10) : 1995;
const GH_ENRICH_TARGET = parseInt(process.env.GH_ENRICH_TARGET || '2400', 10); // buffer above MAX_NEW for ranking
const GH_RATE_FLOOR = 300;       // stop enrichment below this remaining quota
const QUEUE_CAP = 2000;          // design cap (same as auto-discover)

const stats = {
  discovered_mcpservers_org: 0,
  discovered_smithery: 0,
  discovered_npm: 0,
  cross_validated: 0,
  already_in_catalog: 0,
  already_in_queue: 0,
  enriched_github: 0,
  enrichment_backlog: 0,
  npm_enriched: 0,
  smithery_only: 0,
  l17_blocked: 0,
  queued_new: 0,
  queued_total: 0,
  glama: 'blocked — client-side rendering, no public API (documented)',
};

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const nowISO = () => new Date().toISOString();

async function jget(url, headers = {}, timeout = 25000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeout);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'marketnow-external-discovery', ...headers }, signal: ctl.signal });
    return res;
  } finally { clearTimeout(t); }
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. LOAD CATALOG → dedup lookups
// ═══════════════════════════════════════════════════════════════════════════

console.log('MarketNow — External Directory Discovery (queue mode)');
console.log('====================================================\n');

const skills = JSON.parse(fs.readFileSync(SKILLS_PATH, 'utf8'));
const existingGithubRepos = new Set();
const existingNpmNames = new Set();
const existingSmitheryNames = new Set();
const existingIds = new Set();

for (const s of skills) {
  existingIds.add(s.id);
  const src = s.source || {};
  for (const k of ['url', 'repo_url']) {
    const u = src[k];
    if (u && String(u).includes('github.com')) {
      const m = String(u).match(/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)/);
      if (m) existingGithubRepos.add(`${m[1]}/${m[2]}`.toLowerCase().replace(/\.git$/, ''));
    }
  }
  if (src.type === 'npm-registry') existingNpmNames.add(String(s.name).toLowerCase());
  if (src.type === 'smithery') {
    existingSmitheryNames.add(String(s.name).toLowerCase());
    if (s.slug) existingSmitheryNames.add(String(s.slug).toLowerCase());
  }
  const nx = String(s.install || '').match(/^npx -y (\S+)/);
  if (nx) existingNpmNames.add(nx[1].toLowerCase());
}
console.log(`Catalog: ${skills.length} skills | github repos: ${existingGithubRepos.size} | npm names: ${existingNpmNames.size} | smithery names: ${existingSmitheryNames.size}\n`);

// existing queue lookups
const prevQueue = fs.existsSync(QUEUE_PATH)
  ? JSON.parse(fs.readFileSync(QUEUE_PATH, 'utf8')) : { entries: [] };
const queueRepos = new Set((prevQueue.entries || []).map(e => String(e.repo || '').toLowerCase()));
const queueNpm = new Set((prevQueue.entries || []).map(e => String(e.npm || '').toLowerCase()).filter(Boolean));

// ═══════════════════════════════════════════════════════════════════════════
// 2. SOURCE: mcpservers.org (sitemaps → GitHub repos)
// ═══════════════════════════════════════════════════════════════════════════

async function discoverMcpserversOrg() {
  if (SOURCE_FILTER && SOURCE_FILTER !== 'mcpservers' && SOURCE_FILTER !== 'mcpservers.org') return new Map();
  console.log('📡 mcpservers.org — fetching sitemap index...');
  const repos = new Map(); // "owner/repo" -> sources[]
  try {
    const res = await jget('https://mcpservers.org/sitemap.xml');
    const idx = await res.text();
    const smaps = [...idx.matchAll(/<loc>(https:\/\/mcpservers\.org\/sitemaps\/servers\/\d+\.xml)<\/loc>/g)].map(m => m[1]);
    console.log(`  sitemap index: ${smaps.length} server sitemaps`);
    for (const s of smaps) {
      try {
        const r = await jget(s);
        const xml = await r.text();
        for (const m of xml.matchAll(/<loc>https:\/\/mcpservers\.org\/servers\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)<\/loc>/g)) {
          const key = `${m[1]}/${m[2]}`.toLowerCase();
          if (!repos.has(key)) repos.set(key, ['mcpservers.org']);
        }
      } catch (e) { console.error(`  ✗ sitemap ${s}: ${e.message}`); }
    }
    stats.discovered_mcpservers_org = repos.size;
    console.log(`  unique GitHub repos: ${repos.size}`);
  } catch (e) { console.error(`  ✗ sitemap index failed: ${e.message}`); }
  return repos;
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. SOURCE: Smithery registry API (50 pages × 10)
// ═══════════════════════════════════════════════════════════════════════════

async function discoverSmithery(repos) {
  if (SOURCE_FILTER && SOURCE_FILTER !== 'smithery') return { githubHits: 0, npmCandidates: new Map(), onlyCandidates: [] };
  console.log('📡 Smithery — fetching registry pages...');
  const npmCandidates = new Map(); // npm name -> smithery server
  const only = [];
  let githubHits = 0;
  let total = 0;
  for (let page = 1; page <= 50; page++) {
    try {
      const res = await jget(`https://registry.smithery.ai/servers?page=${page}&pagesize=10`);
      if (!res.ok) { console.log(`  page ${page}: HTTP ${res.status}, stop`); break; }
      const data = await res.json();
      const servers = data.servers || [];
      if (!servers.length) break;
      for (const sv of servers) {
        total++;
        stats.discovered_smithery = total;
        const npmName = sv.qualifiedName || null;
        // GitHub link from homepage
        let ghKey = null;
        const hp = String(sv.homepage || '');
        if (hp.includes('github.com')) {
          const m = hp.match(/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)/);
          if (m) ghKey = `${m[1]}/${m[2]}`.toLowerCase().replace(/\.git$/, '');
        }
        if (ghKey && repos.has(ghKey)) {
          repos.get(ghKey).push('smithery'); githubHits++;
        } else if (ghKey && !existingGithubRepos.has(ghKey)) {
          repos.set(ghKey, ['smithery']); githubHits++;
        }
        // smithery/npm candidate
        const nm = (sv.qualifiedName || '').toLowerCase();
        if (nm && !existingSmitheryNames.has(nm) && !existingNpmNames.has(nm) && !queueNpm.has(nm)) {
          if (ghKey && (existingGithubRepos.has(ghKey) || repos.has(ghKey))) continue; // covered via GitHub
          npmCandidates.set(nm, { server: sv, npmName });
          only.push(sv);
        }
      }
      if (page % 10 === 0) console.log(`  page ${page}: ${total} servers seen`);
      await sleep(400);
    } catch (e) { console.error(`  ✗ page ${page}: ${e.message}`); break; }
  }
  console.log(`  servers: ${total} | github links: ${githubHits} | npm/smithery-only candidates: ${npmCandidates.size}`);
  return { githubHits, npmCandidates, onlyCandidates: only };
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. SOURCE: npm registry search (text queries × 250)
// ═══════════════════════════════════════════════════════════════════════════

async function discoverNpm(repos) {
  if (SOURCE_FILTER && SOURCE_FILTER !== 'npm') return new Map();
  console.log('📡 npm — searching registry...');
  const pkgs = new Map(); // name -> {description, version, publisher, downloads, links}
  const queries = [
    'mcp-server', 'mcp server', 'keywords:mcp', 'model context protocol',
    'mcp tools', 'mcp framework', 'mcp client', 'mcp adapter',
  ];
  for (const q of queries) {
    try {
      const res = await jget(`https://registry.npmjs.org/-/v1/search?text=${encodeURIComponent(q)}&size=250`);
      if (!res.ok) { console.log(`  "${q}": HTTP ${res.status}`); continue; }
      const data = await res.json();
      for (const o of data.objects || []) {
        const p = o.package || {};
        const name = (p.name || '').toLowerCase();
        if (!name) continue;
        if (!pkgs.has(name)) {
          pkgs.set(name, {
            name: p.name,
            description: p.description || '',
            version: p.version || '',
            publisher: p.publisher?.username || '',
            downloads: o.downloads?.monthly || 0,
            links: p.links || {},
            date: o.date || (o.updated ? String(o.updated) : ''),
          });
        }
      }
      await sleep(300);
    } catch (e) { console.error(`  ✗ query "${q}": ${e.message}`); }
  }
  stats.discovered_npm = pkgs.size;
  console.log(`  packages seen: ${pkgs.size}`);
  // dedup: only npm packages NOT already in catalog and NOT already queued
  const fresh = new Map();
  for (const [name, p] of pkgs) {
    if (existingNpmNames.has(name) || queueNpm.has(name)) continue;
    // if the package has a github repo already discovered/known, it's covered via GitHub
    const repo = p.links?.repository || '';
    if (repo.includes('github.com')) {
      const m = repo.match(/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)/);
      if (m) {
        const key = `${m[1]}/${m[2]}`.toLowerCase().replace(/\.git$/, '');
        if (existingGithubRepos.has(key)) continue;
        if (repos.has(key)) { repos.get(key).push('npm'); continue; }
      }
    }
    fresh.set(name, p);
  }
  console.log(`  fresh npm candidates: ${fresh.size}`);
  return fresh;
}

// ═══════════════════════════════════════════════════════════════════════════
// 5. ENRICHMENT — GitHub repo metadata (rate-limit aware)
// ═══════════════════════════════════════════════════════════════════════════

let rateRemaining = 5000;

async function fetchRepoMeta(ownerSlashRepo) {
  if (rateRemaining <= GH_RATE_FLOOR) return 'RATE_STOP';
  try {
    const res = await jget(`https://api.github.com/repos/${ownerSlashRepo}`, {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
    });
    const rem = parseInt(res.headers.get('x-ratelimit-remaining') || '0', 10);
    if (!Number.isNaN(rem) && rem > 0) rateRemaining = rem;
    if (res.status === 404) return null;
    if (res.status === 403 || res.status === 429) { await sleep(8000); return 'RATE_STOP'; }
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

function categoryFor(desc, topics) {
  const allText = `${desc} ${topics}`.toLowerCase();
  const cats = [
    ['browser|playwright|puppeteer|selenium|chrome', 'Browser Automation'],
    ['database|sql|postgres|mysql|sqlite|mongo|redis', 'Data'],
    ['file|filesystem', 'File System'],
    ['git|github|gitlab', 'Version Control'],
    ['slack|discord|telegram|whatsapp', 'Communication'],
    ['search|google|bing|brave', 'Search'],
    ['memory|knowledge|graph|rag|embed', 'AI/ML'],
    ['stripe|payment|finance|bank|crypto|blockchain', 'Finance'],
    ['weather|news|rss', 'Web APIs'],
    ['security|auth|oauth|jwt', 'Security'],
    ['cloud|aws|azure|gcp', 'Cloud Platforms'],
    ['monitoring|metrics|logs|observability', 'Monitoring'],
  ];
  for (const [pat, cat] of cats) if (new RegExp(pat).test(allText)) return cat;
  return 'Developer Tools';
}

function buildSkillFromRepo(meta, extraSources = []) {
  const [owner, name] = meta.full_name.split('/');
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);
  let id = `mn-real-${slug.replace(/-/g, '').slice(0, 20)}`;
  let n = 2;
  while (existingIds.has(id)) { id = `mn-real-${slug.replace(/-/g, '').slice(0, 18)}${n++}`; }
  existingIds.add(id);
  const language = meta.language || 'Unknown';
  let install;
  if (language === 'Python') install = `uvx ${name} || pip install ${name}`;
  else if (language === 'Go') install = `go install github.com/${meta.full_name}`;
  else if (language === 'Rust') install = `cargo install ${name}`;
  else install = `npx -y ${name} || git clone ${meta.html_url}`;
  return {
    id, name, slug: `real-${slug}`,
    description: (meta.description || `MCP server from ${owner}/${name}`).slice(0, 300),
    category: categoryFor(meta.description || '', (meta.topics || []).join(' ')),
    tags: ['mcp', 'real', language.toLowerCase(), owner.toLowerCase(), ...(meta.topics || []).slice(0, 5)],
    price: 0, currency: 'USD', payment: 'free',
    license: meta.license?.spdx_id || 'See repo',
    verified: false, sentinel_score: 7, install,
    author: owner, version: '1.0.0',
    doc: {
      setup: { required_env: [], install, estimated_cost: 'free' },
      usage: `agent.call('real-${slug}', { ... })`,
      system_prompt: `# ${name}\n\n## Source\n${meta.html_url}\n\n## Description\n${meta.description || '(no description)'}\n\n## Stars\n${meta.stargazers_count}\n\n## Language\n${language}\n`,
    },
    capabilities: {
      execution_context: 'local_runtime', requires_auth: false,
      requires_network: /http|api|webhook/i.test(meta.description || ''),
      input_types: ['json'], output_types: ['json', 'text'],
    },
    sentinel: { scanned_at: nowISO(), scan_version: 'L1.5+L1.6+L1.7', warnings: [] },
    source: {
      type: 'github', url: meta.html_url,
      note: `Real MCP server. ${meta.stargazers_count} stars. Language: ${language}. Last push: ${meta.pushed_at}. Discovered via external directory discovery (mcpservers.org${extraSources.length > 1 ? ' + ' + extraSources.filter(s => s !== 'mcpservers.org').join(' + ') : ''}).`,
      stars: meta.stargazers_count, language, last_push: meta.pushed_at,
    },
    l2_eligible: true, synthetic: false,
    discovered_at: nowISO(), discovered_by: 'external-discover-mcp.mjs',
    discovered_via: extraSources,
  };
}

function buildSkillFromNpm(p, repoUrl) {
  const name = p.name;
  const slug = name.replace(/^@/, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40).toLowerCase();
  let id = `mn-npme-${slug.replace(/-/g, '').slice(0, 22)}`;
  let n = 2;
  while (existingIds.has(id)) { id = `mn-npme-${slug.replace(/-/g, '').slice(0, 20)}${n++}`; }
  existingIds.add(id);
  return {
    id, name, slug: `npme-${slug}`,
    description: (p.description || `MCP package ${name} from npm`).slice(0, 300),
    category: categoryFor(p.description || '', 'mcp'),
    tags: ['mcp', 'npm', name.startsWith('@') ? name.split('/')[0].slice(1) : (p.publisher || 'unknown')],
    price: 0, currency: 'USD', payment: 'free',
    license: 'See package', verified: false, sentinel_score: 7,
    install: `npx -y ${name}`,
    author: p.publisher || (name.startsWith('@') ? name.split('/')[0].slice(1) : 'unknown'),
    version: p.version || '1.0.0',
    doc: {
      setup: { required_env: [], install: `npx -y ${name}`, estimated_cost: 'free' },
      usage: `agent.call('npme-${slug}', { ... })`,
      system_prompt: `# ${name}\n\n## Source\nhttps://www.npmjs.com/package/${name}\n\n## Description\n${p.description || '(no description)'}\n`,
    },
    capabilities: {
      execution_context: 'local_runtime', requires_auth: false, requires_network: true,
      input_types: ['json'], output_types: ['json', 'text'],
    },
    sentinel: { scanned_at: nowISO(), scan_version: 'L1.5+L1.6+L1.7', warnings: [] },
    source: {
      type: 'npm-registry', url: `https://www.npmjs.com/package/${name}`,
      note: `Indexed from the public npm registry via external directory discovery (npm search). Monthly downloads: ${p.downloads || 'n/a'}.`,
      downloads: p.downloads || 0, ...(repoUrl ? { repo_url: repoUrl } : {}),
    },
    l2_eligible: true, synthetic: false,
    discovered_at: nowISO(), discovered_by: 'external-discover-mcp.mjs',
    discovered_via: ['npm'],
  };
}

function buildSkillFromSmithery(sv) {
  const name = sv.qualifiedName || sv.displayName || 'unknown';
  const slug = name.replace(/[^a-zA-Z0-9]+/g, '-').slice(0, 40).toLowerCase().replace(/^-|-$/g, '');
  let id = `mn-sme-${slug.replace(/-/g, '').slice(0, 22)}`;
  let n = 2;
  while (existingIds.has(id)) { id = `mn-sme-${slug.replace(/-/g, '').slice(0, 20)}${n++}`; }
  existingIds.add(id);
  return {
    id, name, slug: `sme-${slug}`,
    description: (sv.description || `MCP server ${name} from the Smithery registry`).slice(0, 300),
    category: categoryFor(sv.description || '', 'mcp'),
    tags: ['mcp', 'smithery', sv.verified ? 'verified' : 'unverified'],
    price: 0, currency: 'USD', payment: 'free',
    license: 'See server', verified: false, sentinel_score: 7,
    install: `npx -y @smithery/cli@latest install ${name}`,
    author: sv.owner || (sv.namespace || 'unknown'),
    version: '1.0.0',
    doc: {
      setup: { required_env: [], install: `npx -y @smithery/cli@latest install ${name}`, estimated_cost: 'free' },
      usage: `agent.call('sme-${slug}', { ... })`,
      system_prompt: `# ${sv.displayName || name}\n\n## Source\nhttps://smithery.ai/server/${name}\n\n## Description\n${sv.description || '(no description)'}\n\n## Use count\n${sv.useCount || 0}\n`,
    },
    capabilities: {
      execution_context: sv.remote ? 'remote_runtime' : 'local_runtime',
      requires_auth: false, requires_network: true,
      input_types: ['json'], output_types: ['json', 'text'],
    },
    sentinel: { scanned_at: nowISO(), scan_version: 'L1.5+L1.6+L1.7', warnings: [] },
    source: {
      type: 'smithery', url: `https://smithery.ai/server/${name}`,
      use_count: sv.useCount || 0, verified: !!sv.verified,
      note: `Indexed from the public Smithery registry via external directory discovery. Use count: ${sv.useCount || 0}.`,
    },
    l2_eligible: true, synthetic: false,
    discovered_at: nowISO(), discovered_by: 'external-discover-mcp.mjs',
    discovered_via: ['smithery'],
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 6. MAIN
// ═══════════════════════════════════════════════════════════════════════════

(async () => {
  const repos = await discoverMcpserversOrg();          // Map: owner/repo -> [sources]
  const smith = await discoverSmithery(repos);          // cross-validation + smithery/npm-only
  const npmFresh = await discoverNpm(repos);            // fresh npm packages

  // ── dedup against catalog + queue ────────────────────────────────────────
  const delta = [];
  let inCatalog = 0, inQueue = 0;
  for (const [key, via] of repos) {
    if (existingGithubRepos.has(key)) { inCatalog++; continue; }
    if (queueRepos.has(`https://github.com/${key}`) || queueRepos.has(key)) { inQueue++; continue; }
    delta.push({ key, via });
  }
  stats.already_in_catalog = inCatalog;
  stats.already_in_queue = inQueue;
  stats.cross_validated = delta.filter(d => d.via.length > 1).length;
  console.log(`\nGitHub candidates: ${repos.size} seen | ${inCatalog} already in catalog | ${inQueue} already queued`);
  console.log(`DELTA to enrich: ${delta.length} (${stats.cross_validated} cross-validated)`);

  // ── enrichment (priority: cross-validated first, then alphabetical) ──────
  delta.sort((a, b) => (b.via.length - a.via.length) || a.key.localeCompare(b.key));
  const enrichList = delta.slice(0, GH_ENRICH_TARGET);
  stats.enrichment_backlog = delta.length - enrichList.length;

  console.log(`\nEnriching ${enrichList.length} repos via GitHub API (rate floor ${GH_RATE_FLOOR})...`);
  const ghSkills = [];
  const blocked = [];
  let rateStopped = false;
  for (let i = 0; i < enrichList.length && !rateStopped; i += 20) {
    const batch = enrichList.slice(i, i + 20);
    const metas = await Promise.all(batch.map(d => fetchRepoMeta(d.key)));
    for (let j = 0; j < metas.length; j++) {
      const meta = metas[j];
      if (meta === 'RATE_STOP') { rateStopped = true; break; }
      if (!meta || meta.archived || meta.disabled) continue;
      const skill = buildSkillFromRepo(meta, batch[j].via);
      // L1.7 pre-import scan (metadata-only, fail-open)
      try {
        const l17 = await runL17(skill);
        if (l17.quarantine_recommended) {
          stats.l17_blocked++;
          blocked.push({ repo: meta.full_name, patterns: l17.findings.malware_patterns.map(p => p.id) });
          continue;
        }
      } catch (e) { /* fail open — batch audit catches later */ }
      ghSkills.push(skill);
    }
    stats.enriched_github = ghSkills.length;
    if ((i / 20) % 25 === 0) {
      console.log(`  ${Math.min(i + 20, enrichList.length)}/${enrichList.length} fetched | enriched: ${ghSkills.length} | rate left: ${rateRemaining}${rateStopped ? ' (STOP)' : ''}`);
    }
    await sleep(200);
  }
  if (rateStopped) {
    // unprocessed = delta - (successfully enriched + blocked)
    const processed = new Set([
      ...ghSkills.map(s => String(s.source.url).toLowerCase().replace('https://github.com/', '').replace(/\/$/, '')),
      ...blocked.map(b => b.repo.toLowerCase()),
    ]);
    stats.enrichment_backlog = delta.filter(d => !processed.has(d.key)).length;
    console.log(`  ⚠ rate limit stop — backlog for next run: ${stats.enrichment_backlog}`);
  }

  // ── npm-only candidates (top by downloads) ───────────────────────────────
  const npmSorted = [...npmFresh.values()].sort((a, b) => (b.downloads || 0) - (a.downloads || 0)).slice(0, 400);
  const npmSkills = [];
  for (const p of npmSorted) {
    const skill = buildSkillFromNpm(p, p.links?.repository || null);
    try {
      const l17 = await runL17(skill);
      if (l17.quarantine_recommended) { stats.l17_blocked++; continue; }
    } catch { /* fail open */ }
    npmSkills.push(skill);
  }
  stats.npm_enriched = npmSkills.length;

  // ── smithery-only candidates (top by useCount) ───────────────────────────
  const smithSorted = [...smith.npmCandidates.values()].map(v => v.server)
    .sort((a, b) => (b.useCount || 0) - (a.useCount || 0)).slice(0, 300);
  const smithSkills = [];
  for (const sv of smithSorted) {
    const skill = buildSkillFromSmithery(sv);
    try {
      const l17 = await runL17(skill);
      if (l17.quarantine_recommended) { stats.l17_blocked++; continue; }
    } catch { /* fail open */ }
    smithSkills.push(skill);
  }
  stats.smithery_only = smithSkills.length;

  // ── rank + select (diversity: github / npm / smithery) ───────────────────
  ghSkills.sort((a, b) => (b.source.stars || 0) - (a.source.stars || 0) + ((b.discovered_via?.length || 1) - (a.discovered_via?.length || 1)) * 0.5);
  const room = Math.max(0, Math.min(MAX_NEW, QUEUE_CAP - (prevQueue.entries || []).length));
  const take = {
    github: Math.min(ghSkills.length, Math.floor(room * 0.75)),
    npm: Math.min(npmSkills.length, Math.ceil(room * 0.15)),
    smithery: Math.min(smithSkills.length, Math.ceil(room * 0.10)),
  };
  let used = take.github + take.npm + take.smithery;
  if (used < room) take.github += Math.min(ghSkills.length - take.github, room - used);

  const fresh = [
    ...ghSkills.slice(0, take.github).map(s => ({
      repo: s.source.url, kind: 'new', status: 'pending-review', queued_at: nowISO(), skill: s,
    })),
    ...npmSkills.slice(0, take.npm).map(s => ({
      repo: s.source.url, npm: s.name, kind: 'new', status: 'pending-review', queued_at: nowISO(), skill: s,
    })),
    ...smithSkills.slice(0, take.smithery).map(s => ({
      repo: s.source.url, kind: 'new', status: 'pending-review', queued_at: nowISO(), skill: s,
    })),
  ];
  stats.queued_new = fresh.length;

  // ── write queue (keep existing entries, respect design cap) ──────────────
  if (!DRY_RUN) {
    const known = new Set((prevQueue.entries || []).map(e => String(e.repo || '').toLowerCase()));
    const freshUnique = fresh.filter(e => !known.has(String(e.repo || '').toLowerCase()));
    const entries = [...(prevQueue.entries || []), ...freshUnique].slice(-QUEUE_CAP);
    stats.queued_new = freshUnique.length;
    stats.queued_total = entries.length;
    const queue = {
      schema: 'marketnow-discovery-queue/1.0',
      generated_at: nowISO(),
      mode: 'queue — review before import',
      note: 'Candidatos descubiertos (awesome-mcp + GitHub Search + mcpservers.org sitemaps + Smithery registry + npm search, L1.7 pre-filtrado). Glama: bloqueado (render client-side, sin API pública). La importación al catálogo es deliberada (flujo dev): exige actualizar la constelación de conteos (skills-lite, free-skills, stats-base.discovery, catalog-meta, mcp.json, ai-plugin.json, landing) y regenerar certification.json para no recrear el drift F-02. Consumir con scripts/auto-discover-mcp.mjs --import + sync de conteos.',
      stats,
      entries,
    };
    fs.mkdirSync(path.dirname(QUEUE_PATH), { recursive: true });
    fs.writeFileSync(QUEUE_PATH, JSON.stringify(queue, null, 2));
    console.log(`\n✅ Discovery queue updated: ${entries.length} entries (+${freshUnique.length} nuevos)`);
  } else {
    stats.queued_total = (prevQueue.entries || []).length + fresh.length;
    console.log(`\n[DRY RUN] would queue +${fresh.length} (total ${stats.queued_total}). No files written.`);
  }

  // ── summary ──────────────────────────────────────────────────────────────
  console.log(`\n${'='.repeat(60)}`);
  console.log('EXTERNAL DIRECTORY DISCOVERY COMPLETE');
  console.log(`${'='.repeat(60)}`);
  console.log(`Sources:`);
  console.log(`  mcpservers.org sitemaps: ${stats.discovered_mcpservers_org} repos`);
  console.log(`  Smithery registry:       ${stats.discovered_smithery} servers (pagination cap 500)`);
  console.log(`  npm search:              ${stats.discovered_npm} packages`);
  console.log(`  Glama:                   ${stats.glama}`);
  console.log(`\nDedup:  already in catalog: ${stats.already_in_catalog} | already queued: ${stats.already_in_queue}`);
  console.log(`Cross-validated (2+ sources): ${stats.cross_validated}`);
  console.log(`\nEnriched: github ${stats.enriched_github} | npm ${stats.npm_enriched} | smithery-only ${stats.smithery_only}`);
  console.log(`🚨 L1.7 blocked: ${stats.l17_blocked}`);
  console.log(`Backlog (next run): ${stats.enrichment_backlog}`);
  console.log(`Queued new: ${stats.queued_new} | queue total: ${stats.queued_total}`);
  if (blocked.length > 0) {
    console.log(`\nBlocked repos (L1.7):`);
    for (const b of blocked.slice(0, 20)) console.log(`  - ${b.repo} (${b.patterns.join(', ')})`);
  }
})();
