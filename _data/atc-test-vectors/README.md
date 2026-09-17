# ATC Test Vectors (Do Not Index)

These 22 Agent Trust Cards are **security test artifacts**, not production credentials.
They were issued on 2026-08-09/10 during adversarial testing of the submission pipeline
(the public security-research exchange with @anp2network) and during rate-limit /
input-validation hardening.

They are intentionally:

- **Excluded** from `_data/atc/_index.json` (the public index)
- **Excluded** from `aep-marketplace/public/api/atc/` (the static files served in production)
- **Kept here** as an auditable record of what the pipeline was tested against

| Card | Vector type |
|------|-------------|
| ATC-2026-0325620 | prompt-injection persona ("hacker_bot") |
| ATC-2026-0589270 | audit test card |
| ATC-2026-0995637 | audit test card (2) |
| ATC-2026-1178769 | generic test card |
| ATC-2026-1361729 | generic test card (2) |
| ATC-2026-1509828 | final integration test |
| ATC-2026-1998093 | final integration test (2) |
| ATC-2026-4291848 | path traversal payload (`../../../etc/passwd` as agent_id) |
| ATC-2026-4293031 | XSS payload (`<script>alert(1)</script>` as agent_id) |
| ATC-2026-4298558…4305564 | rate-limit tests 1–8 |
| ATC-2026-4654292 | minimal-input edge case |
| ATC-2026-4794938 | agent id format test |
| ATC-2026-6448551 / 6449889 | rate-limit tests (named) |
| ATC-2026-9853411 | pentest bot with fake Ed25519 key |

Rules:

1. `scripts/generate-atc-index.mjs` only scans `_data/atc/` — never this directory.
2. `scripts/sync-atc-static.mjs` only copies `_data/atc/` — never this directory.
3. Do not move these files back into `_data/atc/` — they would enter the public index.
4. The production trust ledger (57 real cards) is served from
   `aep-marketplace/public/api/atc/` and mirrored at `https://marketnow.site/api/atc/`.
