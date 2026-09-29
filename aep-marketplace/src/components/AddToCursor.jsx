import { useState } from 'react';
import { motion } from 'framer-motion';

// Deep-link 1-click de Cursor (verificado en vivo 2026-09-30):
// requiere params name + config (JSON urlencoded) — NO name + url.
const CURSOR_INSTALL_URL =
  'https://cursor.com/install-mcp?name=MarketNow&config=' +
  encodeURIComponent(JSON.stringify({ url: 'https://marketnow.site/api/mcp' }));

const MCP_JSON = `{
  "mcpServers": {
    "MarketNow": {
      "url": "https://marketnow.site/api/mcp"
    }
  }
}`;

export default function AddToCursor() {
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(false);

  const copyConfig = async () => {
    try {
      await navigator.clipboard.writeText(MCP_JSON);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard bloqueado — el JSON desplegable es el fallback */
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.6 }}
      className="mt-8 max-w-2xl mx-auto"
    >
      <div className="p-5 rounded-xl bg-black/60 border border-[#00F299]/15">
        <div className="flex items-center justify-between mb-3">
          <div className="text-[10px] text-zinc-500 font-mono uppercase tracking-wider">
            Use MarketNow inside your agent
          </div>
          <div className="text-[10px] text-[#00F299]/60 font-mono tracking-wider">
            OFFICIAL MCP REGISTRY · v1.15.0
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <a
            href={CURSOR_INSTALL_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 px-6 py-3 bg-[#00F299] text-black font-bold rounded-lg hover:bg-[#00F299]/90 hover:scale-[1.02] active:scale-[0.98] transition-all duration-300 shadow-lg shadow-[#00F299]/20"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12 2L14.4 8.8H21.6L15.8 13.1L18.2 20L12 15.8L5.8 20L8.2 13.1L2.4 8.8H9.6L12 2Z" />
            </svg>
            ADD TO CURSOR — 1 CLICK
          </a>
          <button
            onClick={copyConfig}
            className="px-6 py-3 border border-[#00F299]/30 bg-[#00F299]/10 text-[#00F299] font-bold rounded-lg hover:bg-[#00F299]/20 hover:scale-[1.02] active:scale-[0.98] transition-all duration-300 cursor-pointer"
          >
            {copied ? 'COPIED ✓' : 'COPY mcp.json'}
          </button>
          <button
            onClick={() => setOpen(o => !o)}
            className="px-4 py-3 border border-white/10 text-zinc-300 font-medium rounded-lg hover:bg-white/5 transition-all duration-300 cursor-pointer"
            aria-expanded={open}
          >
            {open ? 'HIDE CONFIG' : 'OTHER AGENTS'}
          </button>
        </div>

        <p className="mt-3 text-xs text-zinc-500 leading-relaxed">
          Remote streamable-http · no auth required · works with Cursor, Claude Desktop,
          Cline, VS Code, Windsurf and any MCP client. 15 tools: search 68k+ servers,
          verify agent credentials, check scam domains, translate 9 formats.
        </p>

        {open && (
          <div className="mt-4 text-left">
            <div className="text-[10px] text-zinc-500 font-mono mb-2 uppercase tracking-wider">
              Manual config — ~/.cursor/mcp.json · claude_desktop_config.json · .mcp.json
            </div>
            <pre className="p-3 rounded-lg bg-black/80 border border-white/5 text-[#00F299] text-xs font-mono overflow-x-auto">
{MCP_JSON}
            </pre>
          </div>
        )}
      </div>
    </motion.div>
  );
}
