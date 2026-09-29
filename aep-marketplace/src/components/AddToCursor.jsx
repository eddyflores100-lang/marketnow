import { useState } from 'react';
import { motion } from 'framer-motion';

// ─────────────────────────────────────────────────────────────────────────────
// Instalación 1-click de Cursor · INSTALLER v4
//
// Clic → abre la página oficial de instalación de Cursor (cursor.com/install-mcp)
// en la MISMA pestaña. Esa página dispara el protocolo cursor:// por sí sola y
// Cursor se abre automáticamente (el navegador pide permiso una vez, como con
// cualquier enlace de Zoom/Telegram — ningún sitio web puede saltarse ese paso).
//
// MISMA pestaña = sin rebote: la página de cursor solo puede auto-cerrarse
// (window.close) cuando fue abierta como pestaña nueva por script; navegando
// en la misma pestaña se queda visible mostrando "Launched Cursor".
//
// Panel mínimo: botón + COPY. Nada más.
// ─────────────────────────────────────────────────────────────────────────────

const MCP_JSON = `{
  "mcpServers": {
    "MarketNow": {
      "url": "https://marketnow.site/api/mcp"
    }
  }
}`;

const CURSOR_INSTALL_URL =
  'https://cursor.com/install-mcp?name=MarketNow&config=' +
  encodeURIComponent(JSON.stringify({ url: 'https://marketnow.site/api/mcp' }));

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
            REGISTRY v1.15.0 · INSTALLER v4
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          {/* 1 click → página oficial de instalación de Cursor (misma pestaña).
              Cursor se abre automáticamente tras permitirlo en el navegador. */}
          <a
            href={CURSOR_INSTALL_URL}
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
        </div>

        <p className="mt-3 text-xs text-zinc-500 leading-relaxed">
          One click → Cursor opens. Remote streamable-http · no auth · also Claude
          Desktop, Cline, VS Code, Windsurf.{' '}
          <button
            onClick={() => setOpen(o => !o)}
            className="text-zinc-400 underline decoration-dotted underline-offset-2 cursor-pointer"
          >
            {open ? 'hide manual steps' : 'manual steps'}
          </button>
        </p>

        {open && (
          <div className="mt-3 text-left">
            <div className="text-[10px] text-zinc-500 font-mono mb-2 uppercase tracking-wider">
              Manual — no deep link needed
            </div>
            <ol className="text-xs text-zinc-400 leading-relaxed list-decimal list-inside space-y-2">
              <li>
                Cursor: <span className="text-white">Settings → MCP → “+ Add new MCP Server”</span>
                {' '}→ name <span className="text-white">MarketNow</span>, URL:
                <div className="mt-1 p-2 rounded-lg bg-black/80 border border-white/5 text-[#00F299] font-mono overflow-x-auto">
                  https://marketnow.site/api/mcp
                </div>
              </li>
              <li>
                Or <span className="text-white">~/.cursor/mcp.json</span> /
                {' '}<span className="text-white">claude_desktop_config.json</span> /
                {' '}<span className="text-white">.mcp.json</span>:
                <pre className="mt-1 p-3 rounded-lg bg-black/80 border border-white/5 text-[#00F299] text-xs font-mono overflow-x-auto">
{MCP_JSON}
                </pre>
              </li>
            </ol>
          </div>
        )}
      </div>
    </motion.div>
  );
}
