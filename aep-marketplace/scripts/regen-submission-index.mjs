#!/usr/bin/env node
/**
 * MarketNow — Submission Index Regenerator (M-09 crash/recovery)
 * ==============================================================
 *
 * The public submission queue (alicelabs-llc/marketnow-submissions) stores
 * each record as submissions/{yyyy}/{id}.json (atomic, durable) plus an
 * index.json (read-modify-write). If an index write loses a race (GitHub
 * 409) or the index is corrupted/deleted, the QUEUE LISTING degrades even
 * though every record is still durable in the repo tree.
 *
 * This script rebuilds submissions/index.json FROM THE TREE:
 *   1. List every record path via the git Trees API (recursive).
 *   2. Fetch each record (raw, parallel batches) for index fields.
 *   3. Sort by submitted_at, keep the last 499 (same cap as submit-core).
 *   4. PUT the rebuilt index with the current blob sha (conflict-safe).
 *
 * Non-destructive: only submissions/index.json is written.
 *
 * Usage:
 *   MN_SUBMIT_TOKEN=ghp_xxx node scripts/regen-submission-index.mjs [--dry-run]
 *
 * Wired to .github/workflows/submissions-index-repair.yml (manual dispatch).
 */
import { readFileSync } from 'node:fs';

const SUBMIT_REPO = process.env.MN_SUBMIT_REPO || 'alicelabs-llc/marketnow-submissions';
const GH_API = 'https://api.github.com';
const GH_RAW = 'https://raw.githubusercontent.com';
const TOKEN = process.env.MN_SUBMIT_TOKEN;
const DRY_RUN = process.argv.includes('--dry-run');
const MAX_ENTRIES = 499; // same cap as submit-core.mjs
const FETCH_BATCH = 10;

if (!TOKEN) {
  console.error('✗ MN_SUBMIT_TOKEN is not set — cannot write the rebuilt index.');
  console.error('  Read-only listing is still attempted below (records are public).');
}

const authHeaders = TOKEN
  ? { Authorization: `Bearer ${TOKEN}`, Accept: 'application/vnd.github+json', 'User-Agent': 'marketnow-regen' }
  : { Accept: 'application/vnd.github+json', 'User-Agent': 'marketnow-regen' };

async function ghJson(url, extra = {}) {
  const res = await fetch(url, { headers: { ...authHeaders, ...extra }, signal: AbortSignal.timeout(20000) });
  return { ok: res.ok, status: res.status, json: await res.json().catch(() => ({})) };
}

// ─── 1. List every record in the tree ────────────────────────────────────────
console.log(`Listing submissions tree of ${SUBMIT_REPO}...`);
const tree = await ghJson(`${GH_API}/repos/${SUBMIT_REPO}/git/trees/main?recursive=1`);
if (!tree.ok) {
  console.error(`✗ Trees API failed: ${tree.status} ${(tree.json && tree.json.message) || ''}`);
  process.exit(1);
}
const paths = (tree.json.tree || [])
  .filter(n => n.type === 'blob' && /^submissions\/.+\.json$/.test(n.path) && !n.path.endsWith('index.json'))
  .map(n => n.path)
  .sort();
console.log(`Found ${paths.length} durable submission record(s) in the tree.`);

if (paths.length === 0) {
  console.log('Nothing to index. Exiting.');
  process.exit(0);
}

// ─── 2. Fetch records in parallel batches ────────────────────────────────────
console.log(`Fetching records (batches of ${FETCH_BATCH})...`);
const entries = [];
let failed = 0;
for (let i = 0; i < paths.length; i += FETCH_BATCH) {
  const batch = paths.slice(i, i + FETCH_BATCH);
  const settled = await Promise.allSettled(batch.map(async (p) => {
    const res = await fetch(`${GH_RAW}/${SUBMIT_REPO}/main/${p}?v=${Date.now()}`,
      { signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error(`raw ${res.status}`);
    return { path: p, record: await res.json() };
  }));
  for (const s of settled) {
    if (s.status === 'fulfilled') {
      const { path, record } = s.value;
      entries.push({
        id: record.id || path.split('/').pop().replace(/\.json$/, ''),
        name: record.skill?.name || record.name || 'unknown',
        version: record.skill?.version || record.version || null,
        author: record.skill?.author || record.author || null,
        verdict: record.verdict || null,
        status: record.status || null,
        trust: record.sentinel?.trust_score_100 ?? record.trust ?? null,
        submitted_at: record.submitted_at || null,
        from: record.submitted_from || null,
        eligible: record.merge?.eligible ?? record.eligible ?? null,
        path,
      });
    } else {
      failed += 1;
    }
  }
  process.stdout.write(`  ${Math.min(i + FETCH_BATCH, paths.length)}/${paths.length} fetched\r`);
}
console.log(`\nFetched ${entries.length} record(s); ${failed} failed (kept only durable fields if partially missing).`);

// ─── 3. Sort + cap ───────────────────────────────────────────────────────────
entries.sort((a, b) => String(a.submitted_at || '').localeCompare(String(b.submitted_at || '')));
const kept = entries.slice(-MAX_ENTRIES);
console.log(`Index will contain the ${kept.length} most recent entr(y/ies) (cap ${MAX_ENTRIES}).`);

const index = {
  updated_at: new Date().toISOString(),
  regenerated_by: 'scripts/regen-submission-index.mjs (M-09 recovery)',
  regenerated_from_tree_count: entries.length,
  entries: kept,
};

// ─── 4. Write (conflict-safe PUT with current sha) ───────────────────────────
if (DRY_RUN) {
  console.log('\n[DRY RUN] Would write submissions/index.json:');
  console.log(JSON.stringify({ ...index, entries: index.entries.slice(0, 3) }, null, 2).slice(0, 1200) + '\n...');
  process.exit(0);
}
if (!TOKEN) {
  console.error('\n✗ No MN_SUBMIT_TOKEN — cannot write. Re-run with the token to repair.');
  process.exit(1);
}

const current = await ghJson(`${GH_API}/repos/${SUBMIT_REPO}/contents/submissions/index.json`);
const sha = current.ok ? current.json.sha : null;
const putRes = await fetch(`${GH_API}/repos/${SUBMIT_REPO}/contents/submissions/index.json`, {
  method: 'PUT',
  headers: { ...authHeaders, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    message: `index: regenerated from tree (${kept.length} entries, ${entries.length} total) — M-09 recovery`,
    content: Buffer.from(JSON.stringify(index, null, 1)).toString('base64'),
    branch: 'main',
    ...(sha ? { sha } : {}),
  }),
  signal: AbortSignal.timeout(20000),
});
const putJson = await putRes.json().catch(() => ({}));
if (putRes.ok) {
  console.log(`\n✅ Index rebuilt and committed: ${(putJson.commit || {}).sha || '(commit sha unknown)'}`);
  console.log(`   Listing endpoint /api/submissions now serves ${kept.length} entries.`);
} else {
  console.error(`\n✗ Index PUT failed: ${putRes.status} ${putJson.message || ''}`);
  process.exit(1);
}
