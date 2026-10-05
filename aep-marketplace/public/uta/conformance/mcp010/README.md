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
sibling-verb usage notes (`name it in a subsequent delete call`), and read-implemented-
via-POST (`get_recent_transactions` / `POST /transactions/search` — the #101 must-not-fire
case). Genuine candidates are also present, e.g. `get_*_coinbase_pay_link` tools that
create payment checkout sessions under a `get_` name.

## Comma gap (the #101 reproduction population)

Descriptions where a read-verb lead is followed by a comma and a state-change verb
within the same sentence (no `. ; : ! ?` between them): **36 tools**,
of which 10 have read-verb names. Examples in `summary.json`.

## Case-sensitivity (fnmatch POSIX)

Tool names whose lowercase form matches a deny pattern like `delete_*`/`drop_*` but
whose actual casing sails past POSIX `fnmatch`: **4/939**
tools (e.g. DeleteSubgraph, RunSchemaCheck, DeleteGraph, RunSubgraphCheck), and 2/198
server names (e.g. AlterLab-Academic-Skills, Send247-Delivery-MCP-Server). The hole is real; the
observed prevalence in this corpus is under 1%.

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

Produced by MarketNow (marketnow.site). Evidence artifact; not a certification.
