# MarketNow — Authorization Boundary Map (M-3)

> Status of every mutating (state-changing) surface reachable in PRODUCTION,
> plus the dormant commerce code that will go live later. Written to close the
> GPT audit item M-03 ("authorization boundary audit: submit / purchase /
> mandate / revocation / admin — IDOR + privilege escalation").
>
> Last verified against production: 2026-09-28 via
> `aep-marketplace/scripts/external-verification.mjs` (section D) — runnable
> by anyone, no tokens.

## 1. Deployed mutation surfaces (live today)

| Surface | Mutation? | Authorization model | Verified by |
|---|---|---|---|
| `POST /api/submit` | YES — writes a submission record to `alicelabs-llc/marketnow-submissions` (audit trail; catalog merge is a separate human-reviewed step) | **Public by design** (community submissions). Controls: 100 KB payload cap, strict schema gate (400/422 with typed reasons), live claims verification (repo_url and install package are probed — false claims rejected), L1.5 secret scan (post-M-05: `sk_live_`/`sk_test_`/`rk_live_`/`glpat-`/npm_/PyPI/JWT patterns), durable rate limit 8/h per submitter hash + anti-flood 25/10 min. `dry_run: true` never persists. Storage token `MN_SUBMIT_TOKEN` is server-side only and never appears in responses. | external-verification D2/D3; mcp-adversarial suite (31 tests) |
| `POST /api/mcp` → `marketnow_submit_skill` | YES — same write path (`lib/submit-core.mjs`) | Same as above (shared core). JSON-RPC envelope strictly validated (2.0 only, single+batch, no unknown fields accepted). | mcp-adversarial suite weekly |
| `POST /api/audit-skill` | NO — read/compute only (runs L1.5/L1.6 in-memory, fetches L2 results) | Public read; rate limited. | mcp-adversarial suite |
| All other `/api/*` | NO — read-only JSON/SVG | Public read; CORS allowlist (H1 fix), rate limits, WAF headers. | audit-gate + external-verification |

**IDOR exposure in production: zero user-owned resources.** There are no
per-user records, sessions, or admin endpoints deployed — the only mutable
store (submissions queue) is intentionally public-append with validation, and
nothing in it grants privileges. An attacker cannot escalate because there is
nothing to escalate INTO: catalog promotion is a gated CI/human step
(`promote-submissions.yml`), not an API call.

## 2. Dormant commerce code (implemented, NOT deployed)

The commerce handlers exist in the repo but are **rewritten at the edge** to a
typed honest stub (`vercel.json` → `/api/skills?_mode=commerce` →
`{"status":"planned","gate":"C1",...}`). They cannot be reached in production
today. When C1 opens, these are the boundaries to re-audit:

| Dormant handler | Boundary as implemented | Notes |
|---|---|---|
| `api/mandates.js` POST `revoke` | **EIP-191 wallet signature** required, recovered signer must equal `mandate.owner` (403 `invalid_signature` otherwise). Message: `marketnow-revoke:{id}`. | Owner-only revocation — no IDOR by construction. |
| `api/mandates.js` POST `spend` | **Internal-only**: requires `_internal === true && _secret === INTERNAL_SECRET`; fail-closed when the env var is unset (L4 fix). | Shared secret over the same public endpoint — acceptable for server-to-server on Vercel (no VPC), but when C1 opens consider moving spend behind a non-public route or signed internal request. |
| `api/agent-purchase.js` | **On-chain USDC verification** via Base RPC (`eth_getTransactionReceipt`): amount, recipient, and wallet are verified before any spend is recorded; `txHash` dedup store (GitHub-persisted) blocks replay (C2 fix). | Replay + double-issue defense already implemented. |
| `api/stripe-webhook.js` | **Stripe signature verification** (`constructEvent` with `STRIPE_WEBHOOK_SECRET`); 400 when `stripe-signature` header is missing (H4 fix). | Standard webhook authn. |

## 3. Secrets & privilege inventory

- **Server-side only** (never in client bundles): `MN_SUBMIT_TOKEN`,
  `SENTINEL_CERT_SECRET`, `INTERNAL_SECRET`, `STRIPE_SECRET_KEY`,
  `STRIPE_WEBHOOK_SECRET`, GitHub/Vercel tokens.
- The publishable Stripe key in `src/utils/stripe.js` is public by definition.
- `SENTINEL_CERT_SECRET` has NO fallback (the old default is public in git
  history — fail-loud in both `audit-skill.js` and `audit-all-skills.mjs`).
- Admin actions (catalog promotion, quarantines, index repair) are all
  **GitHub Actions workflows with `permissions:` blocks and repo-scoped
  secrets** — not HTTP endpoints, so no admin surface exists to attack
  remotely.

## 4. Re-audit triggers

Run section D of the external verification script after ANY of these events:
1. The C1 commerce rewrite is removed (mandates/purchase/webhook go live).
2. A new POST endpoint is added under `api/`.
3. The submissions storage repo or token changes.
