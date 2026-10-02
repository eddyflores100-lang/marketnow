/**
 * MarketNow — Search API (lightweight, no fetch needed)
 * Uses a pre-built search index instead of fetching skills-lite.json at runtime.
 * 2026-10-02 (Task 130): the index is imported statically (like api/skills.js
 * imports skills-lite.json) — the old per-request self-fetch of
 * /api/search-index.json grew to 16MB with the 70,510-entry catalog and
 * risked the 8s timeout. Static import = zero network cost, warm per lambda.
 *
 * GET /api/search?q=<query>&category=<cat>&limit=<n>
 *
 * Strategy: Return search instructions + skill count if data too large.
 * For real search, use the client-side search in the SPA.
 * For agents, use skills-lite.json directly.
 */

import searchIndex from '../public/api/search-index.json' with { type: 'json' };

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default async function handler(req, res) {
  Object.entries(corsHeaders).forEach(([k, v]) => res.setHeader(k, v));

  const url = new URL(req.url, 'http://localhost');
  const q = (req.query?.q || url.searchParams.get('q') || '').toLowerCase().trim();
  const category = req.query?.category || url.searchParams.get('category') || '';
  const limit = Math.min(parseInt(req.query?.limit || url.searchParams.get('limit') || '20'), 50);

  // If no query, return help + stats
  if (!q && !category) {
    return res.status(200).json({
      ok: true,
      total_skills: Array.isArray(searchIndex) ? searchIndex.length : 0,
      hint: 'Use ?q=<search_term> or ?category=<category>',
      examples: [
        '/api/search?q=discord',
        '/api/search?q=database&category=Data',
        '/api/search?category=Security&limit=10',
      ],
      categories: ['AI/ML', 'Developer Tools', 'Data', 'Web/API', 'Communication', 
                    'Finance', 'Security', 'Media', 'Analytics', 'Productivity',
                    'Automation', 'Blockchain', 'IoT', 'Education', 'Search',
                    'DevOps'],
    });
  }

  // For actual search, use the pre-built search index
  // This is a lightweight index with just name, slug, category, description
  // Built by scripts/generate-search-index.mjs (regen 2026-10-02 over the full
  // 70,510-entry bundle — the 9,248 snapshot is gone)
  try {
    // Static import (see header) — no per-request fetch
    const skills = searchIndex;
      let results = skills.filter(s => {
        if (category && (s.c || '').toLowerCase() !== category.toLowerCase()) return false;
        if (q) {
          const text = `${s.n || ''} ${s.d || ''} ${s.s || ''} ${(s.t || []).join(' ')}`.toLowerCase();
          if (!text.includes(q)) return false;
        }
        return true;
      });

      // Score
      if (q) {
        results = results.map(s => {
          let score = 0;
          const name = (s.n || '').toLowerCase();
          if (name === q) score += 100;
          else if (name.startsWith(q)) score += 50;
          else if (name.includes(q)) score += 30;
          if ((s.d || '').toLowerCase().includes(q)) score += 10;
          score += (s.ss || 0);
          return { ...s, _score: score };
        }).sort((a, b) => b._score - a._score);
      }

      const total = results.length;
      results = results.slice(0, limit).map(({ _score, ...s }) => ({
        id: s.i,
        name: s.n,
        slug: s.s,
        category: s.c,
        description: (s.d || '').slice(0, 200),
        sentinel_score: s.ss || 0,
        risk_level: s.r || 'unknown',
      }));

      return res.status(200).json({
        query: q || '*',
        category: category || null,
        total,
        returned: results.length,
        limit,
        results,
      });
  } catch (err) {
    // Fall through to fallback
  }

  // Fallback: return search instructions
  res.status(200).json({
    ok: true,
    query: q || '*',
    total: 0,
    returned: 0,
    fallback: true,
    message: 'Server-side search index not available. Use client-side search.',
    alternative: {
      url: 'https://marketnow.site/api/skills-lite.json',
      instructions: 'Download skills-lite.json and filter client-side',
    },
  });
}
