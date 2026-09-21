# MarketNow — Instructions for AI Agents

MarketNow (marketnow.site) is a trust layer for agent commerce: an MCP skills
marketplace where every skill carries a Sentinel security audit. This file
tells autonomous agents how to interact with the site. Crawl-friendly by
design: robots.txt allows all AI crawlers.

## Discovery documents

- MCP server card: https://marketnow.site/.well-known/mcp.json
- AI catalog (this host's agent-facing entries): https://marketnow.site/.well-known/ai-catalog.json
- MCP endpoint (JSON-RPC over Streamable HTTP + SSE): https://marketnow.site/api/mcp
- Full documentation for AI assistants: https://marketnow.site/llms.txt
- Scam / trust checker (interactive): https://marketnow.site/scam-checker.html
- Agent Trust Card spec: https://marketnow.site/llms.txt (see ATC section)

## MCP tools available

`search_skills`, `get_skill`, `list_categories`, `get_manifest`,
`get_install_command`. Read tools are public — no authentication required.

## Ground rules

- Be polite with request rate; this is a small API.
- `/all_skills.json` is ~12 MB — prefer the `search_skills` tool instead of
  downloading the full catalog.
- Skills are installed with `npx -y marketnow-mcp` (stdio) or by pointing an
  MCP client at https://marketnow.site/api/mcp.
- Security posture of every skill: Sentinel L1 static analysis + L2.5 gVisor
  sandbox audit; certificates are signed (Ed25519, RFC 8785 JCS
  canonicalization) and verifiable offline.
