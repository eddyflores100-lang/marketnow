#!/usr/bin/env node
/**
 * M-07 helper — extract inline <script> bodies from static HTML pages in
 * public/ into sibling .js files so the site-wide CSP can enforce
 * script-src 'self' (no 'unsafe-inline') for executable scripts.
 *
 * Non-executable blocks (type="application/ld+json", type="application/json",
 * data templates) are left untouched — CSP does not govern data blocks.
 *
 * Idempotent: re-running on an already-extracted page is a no-op.
 */
const fs = require('fs');
const path = require('path');

const PUBLIC = path.join(__dirname, '..', 'public');
const FILES = [
  '404.html', 'demo.html', 'mcps.html', 'playground.html',
  'releases.html', 'scam-checker.html', 'submit.html', 'translate.html',
];

let extracted = 0;
for (const name of FILES) {
  const file = path.join(PUBLIC, name);
  if (!fs.existsSync(file)) continue;
  let html = fs.readFileSync(file, 'utf8');
  const base = name.replace(/\.html$/, '');
  let n = 0;
  // Only bare executable <script> blocks (no attributes, no type= data block)
  html = html.replace(/<script>([\s\S]*?)<\/script>/g, (full, body) => {
    const trimmed = body.trim();
    if (!trimmed) return full; // empty marker script — leave as-is
    n += 1;
    const jsName = n === 1 ? `${base}.js` : `${base}-${n}.js`;
    fs.writeFileSync(path.join(PUBLIC, jsName),
      `/* Extracted from ${name} inline <script> for strict CSP (M-07). */\n${body}\n`);
    extracted += 1;
    console.log(`  ${name} -> public/${jsName} (${body.split('\n').length} lines)`);
    return `<script src="${jsName}"></script>`;
  });
  if (n > 0) fs.writeFileSync(file, html);
}

console.log(`\nExtracted ${extracted} inline script block(s).`);

// Verify: no bare executable <script> remains in the processed files
let leftovers = 0;
for (const name of FILES) {
  const file = path.join(PUBLIC, name);
  if (!fs.existsSync(file)) continue;
  const html = fs.readFileSync(file, 'utf8');
  const m = html.match(/<script>[\s\S]*?<\/script>/g) || [];
  for (const block of m) {
    if (block.replace(/<\/?script>/g, '').trim()) leftovers += 1;
  }
}
console.log(leftovers === 0 ? '✓ No non-empty inline <script> blocks remain.' : `✗ ${leftovers} leftover inline block(s)!`);
process.exit(leftovers === 0 ? 0 : 1);
