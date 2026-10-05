# MCP010 corpus — tools/list capture over open endpoints

Evidence base for [mcp-guard #101](https://github.com/yunaremaia/mcp-guard/issues/101):
sizing the false-positive rate of a state-change-semantics-under-read-verb-name rule
before anyone tunes the keyword set.

## Capture

- Source: the 1749 credential-less (`auth_state=open`) endpoints of the public
  MarketNow catalog, captured live on 2026-10-05 with `initialize` -> `tools/list`
  (JSON-RPC over streamable HTTP; hard per-stage deadlines; SSE bodies read as event
  frames, never buffered blindly).
- Outcomes: {"auth-required": 11, "ok": 1656, "sse-transport": 25, "not-found": 11, "rpc-error": 10, "init-failed": 36}
- Servers that served a tools array: **1656**; total tools captured:
  **16015**; unique (endpoint, tool-name) pairs: 16015.
- Failures are recorded with their failure mode (`auth-required`, `init-failed`,
  `sse-transport`, `not-found`, `rpc-error`) because the denominators are part of the
  false-positive rate.

## Positive set (keyword co-occurrence candidates — NOT verdicts)

A tool is a *candidate* when its name starts with a read verb
(`get/list/read/search/query/find/fetch/view/lookup/show/retrieve/describe/inspect/check/browse/scan/monitor/watch/observe/peek/select`) followed by `_`, `-`, a digit, an
uppercase letter, or end-of-name, and its description contains tier keywords:

| tier | keyword set (summarized) | tools |
|---|---|---:|
| A_destructive | ['delete', 'drop', 'remove', 'truncate', 'purge', 'wipe', 'erase', 'destroy', 'kill', 'shutdown', 'terminate', 'uninstall', 'deactivate', 'revoke', 'reset', 'clear']... | 55 |
| A_exec | exec/execute/shell/subprocess/spawn/bash/powershell/os.system/"runs a command" | 42 |
| B_protocol | uppercase POST/PUT/DELETE/PATCH as HTTP verbs | 24 |
| C_write | ['update', 'insert', 'create', 'write', 'modify', 'upsert', 'patch', 'add', 'append', 'save', 'push', 'commit', 'alter', 'upload', 'publish', 'send']... | 254 |

Full per-endpoint receipts with matched keywords: `positives.json`.

Known false-positive classes already visible in the candidates (this is the point of
the corpus — size them, don't guess them): noun usage (`vertical drop`, `prosecution,
execution, and filing deadlines`), proper nouns (`California POST` police database),
sibling-verb usage notes (`name it in a subsequent delete call`). The
`get_recent_transactions` / `POST /transactions/search` must-not-fire case is **not** in
this corpus (0 occurrences in corpus and frames — it is an L1 catalog example; see
Amendments). The `get_*_coinbase_pay_link` family was proposed as a genuine candidate and
**rejected by the audit** with quotes from its own descriptions (read-only disclaimers;
the purchase happens elsewhere). The one genuine positive found by the audit:
`check_in_attendee`.

## Comma gap (the #101 reproduction population) — UNSIZED

Descriptions where a read-verb lead is followed by a comma and a state-change verb
within the same sentence. **The 36/10 figure is withdrawn** (see Amendments): the
definition is not reimplementable as stated and the analyzer's boundary implementation
was lost. The audit's reconstruction gives 63 candidates / 56 read-named; the operative
number is 4 of 127 would-fire driven by a comma. Illustrative examples remain in
`summary.json`.

## Case-sensitivity (fnmatch POSIX) — PROVENANCE CORRECTED

Names whose casing sails past a case-sensitive deny pattern. The 939 tool names and
69,098 server names are the **L1 catalog** populations, not this corpus capture — the
write-up mixed provenance. On this corpus the defensible count is **2 mixed-case**. Note:
`DeleteSubgraph` matches `delete_*` in *neither* case (the underscore); the bypass only
matters under broader prefix families (`delete*`, `run*`). The hole in
`DenyPolicy.is_tool_denied` is real; its size was measured on the wrong population.

## Files

- `corpus.jsonl` — one line per endpoint: `skill_id`, `catalog_name`, `endpoint`,
  `captured_at`, `init_http`, `init_ok`, `protocol_version`, `server_info`,
  `list_http`, `outcome`, `tool_count`, `tools` (name + description, descriptions
  truncated at 2,000 chars), `response_sha256`.
- `frames/<skill_id>.json` — raw `tools/list` response bodies (also tarred+gzipped).
- `positives.json` — candidate receipts.
- `summary.json` — all counts, definitions, keyword sets, examples.
- `corpus.jsonl.gz`, `frames.tar.gz` — compressed mirrors.

## Verify

- `corpus.jsonl` sha256: `5877a249da294430a93322d8ec34dce49391329b0baf5a2195c487d2ac7e9217`
- Each corpus line carries `response_sha256` = sha256 of the raw response body saved
  in `frames/`. Re-probe any endpoint yourself: JSON-RPC `initialize`, then
  `tools/list` (Accept: `application/json, text/event-stream`), and compare.
- Capture client: `mcp010-corpus-capture/1.0` with a descriptive User-Agent; one
  `initialize` + one `tools/list` + one `notifications/initialized` per endpoint,
  concurrency 50, hard deadlines. No `tools/call` was ever issued.

## Amendments — 2026-10-05

After publication, yunaremaia audited the artifact end to end
([audit comment](https://github.com/yunaremaia/mcp-guard/issues/101#issuecomment-5988172143)).
Integrity: all green (sha256 exact, 1,656/1,656 frame hashes, positives provenance,
4/4 live re-probe). Three write-up claims did not survive verification and are corrected
above and in `summary.json` (amendments block):

1. `get_recent_transactions` / `POST /transactions/search` — **not present** in this
   corpus (0 hits in corpus and frames); it is an L1 catalog example.
2. Comma gap 36/10 — **withdrawn**; population unsized (definition not reimplementable,
   analyzer lost). Audit reconstruction: 63/56; operative: 4 of 127 would-fire.
3. fnmatch 4/939 tools, 2/198 server names — **catalog populations**, presented as
   corpus numbers in error; on this corpus the count is 2 mixed-case.

Resolved in the same pass (audit side-notes): B_protocol 24-vs-27 reconciled (published
tier matched only uppercase POST/PUT; the 4-verb count is 27 — filter artifact, now
pinned), and the "lowercased descriptions" note (capture is verbatim; 11/11 reachable
serving endpoints re-probed byte-identical with casing preserved; lowercase text enters
at mcp-guard's matcher, which lowers descriptions in `_detect_destructive`/`_detect_write`).

The data files are unchanged: `corpus.jsonl` sha256
`5877a249da294430a93322d8ec34dce49391329b0baf5a2195c487d2ac7e9217`, `positives.json`
and `frames/` untouched.

Produced by MarketNow (marketnow.site). Evidence artifact; not a certification.
