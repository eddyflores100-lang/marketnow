# MarketNow — Independent Verification Guide (M-10)

MarketNow's public trust claims are **machine-checkable by anyone**. This page
tells you how to verify them yourself, without credentials, without trusting
us, and without inspecting our private infrastructure.

## One-command verification

```bash
git clone https://github.com/eddyflores100-lang/marketnow.git
cd marketnow
node aep-marketplace/scripts/external-verification.mjs
```

The script talks ONLY to `https://www.marketnow.site` public surfaces (set
`MN_BASE_URL` to point it at a mirror). It exits 0 when every check passes and
writes `external-verification-report.json` with the full evidence.

## What gets verified (and where each claim lives)

| Claim | Public surface | Check |
|---|---|---|
| Catalog size (L1 index certification) | `/api/stats.json` vs `/api/audit-report.json` vs `/api/skills_stats.json` | A1b/A3 — three independent surfaces must agree |
| L2 deep-scan coverage is real and fresh | `/api/certification-scans.json` | A1/A4 — verdict partition must add up; revision ≤ 8 days old |
| Transparency report is not frozen | `/api/audit-report.json` | A2 — `is_current: true` and `l2_scans_revision` must equal the live scans revision |
| MCP protocol works per JSON-RPC 2.0 | `/api/mcp` | B1–B3 — initialize / tools/list / tools/call live |
| Malformed submissions are rejected | `/api/mcp` `marketnow_submit_skill` | B4 — structured rejection, no crash, no acceptance |
| CSP enforced on document root | `/` | C1 — HSTS + XFO + nosniff + `script-src 'self'` |
| CDN scripts are pinned + SRI-hashed | `/interactive-docs/` | C2 — exact version + `integrity="sha384-…"` on all three assets |
| APIs serve `default-src 'none'` | `/api/*` | C3 |
| Commerce mutations are NOT live | `/api/mandates` etc. | D1 — typed planned-stub, never a success mutation |
| Submit requires valid schema | `/api/submit` | D2/D3 — 400/422 typed rejections; dry-run never persists |

## Continuous verification

- **Weekly CI**: `.github/workflows/external-verification.yml` runs the same
  script every Sunday 05:30 UTC against production. Claim drift fails CI and
  uploads the evidence report as a 90-day artifact.
- **Adversarial MCP**: `.github/workflows/mcp-adversarial.yml` hits the live
  MCP endpoint with malformed/oversized/replay/concurrent JSON-RPC payloads
  weekly.
- **Transparency sync gate**: `audit-report-sync.mjs --check` fails CI if any
  public transparency surface diverges from its live source (M-01 closure).

## What we do NOT claim

- We do not claim a third-party penetration test (that is a paid external
  engagement; the controls above make the verifiable parts of our story
  reproducible by anyone in the meantime).
- We do not claim L2 deep-scans cover the whole catalog: ~2.7k of the top-npm
  subset are deep-scanned; the rest are L1 index-certified. Every UI badge
  states which level it represents (M-08 closure).
