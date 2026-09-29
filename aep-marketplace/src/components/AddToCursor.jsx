import { useState } from 'react';
import { motion } from 'framer-motion';

// ─────────────────────────────────────────────────────────────────────────────
// Instalación 1-click de Cursor.
//
// El botón dispara el protocolo DIRECTO de Cursor (cursor://anysphere.cursor-deeplink),
// que es exactamente el mecanismo interno que usa la página cursor.com/install-mcp
// (window.location.href = "<scheme>://anysphere.cursor-deeplink/mcp/install?...").
// Ventajas de lanzarlo desde aquí, sin página intermedia:
//   · Cursor se abre de inmediato (el navegador muestra "¿Abrir Cursor?" una sola vez)
//   · el usuario NUNCA sale de marketnow.site (no hay pestaña que se abra y se cierre)
//   · sin muro de auth ni texto de "manual install" de por medio
// Fallbacks si el protocolo no está registrado (móvil, Cursor no instalado):
//   · "web installer" → cursor.com/install-mcp (página oficial, config visible)
//   · "manual config" → JSON mcp.json para cualquier cliente MCP
// ─────────────────────────────────────────────────────────────────────────────

const MCP_NAME = 'MarketNow';
const MCP_SERVER = { url: 'https://marketnow.site/api/mcp' };

// Deep-link directo al protocolo de Cursor (mismo formato que construye cursor.com):
// cursor://anysphere.cursor-deeplink/mcp/install?name=<enc>&config=<enc JSON>
const CURSOR_DEEPLINK =
  'cursor://anysphere.cursor-deeplink/mcp/install' +
  '?name=' + encodeURIComponent(MCP_NAME) +
  '&config=' + encodeURIComponent(JSON.stringify(MCP_SERVER));

// Fallback web oficial (muestra el JSON y reintenta el protocolo; auto-cierra su pestaña).
const CURSOR_WEB_INSTALL =
  'https://cursor.com/install-mcp' +
  '?name=' + encodeURIComponent(MCP_NAME) +
  '&config=' + encodeURIComponent(JSON.stringify(MCP_SERVER));

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
  const [launched, setLaunched] = useState(false);

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
          {/* 1-click: lanza el protocolo cursor:// directamente — Cursor se abre
              y el usuario se queda en esta página (sin pestañas intermedias). */}
          <a
            href={CURSOR_DEEPLINK}
            onClick={() => setLaunched(true)}
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
            {open ? 'HIDE CONFIG' : 'MANUAL CONFIG'}
          </button>
        </div>

        {/* Aparece justo tras el clic: confirmación + rutas de escape si el
            protocolo no lanzó (móvil / Cursor no instalado / prompt bloqueado). */}
        {launched && (
          <div className="mt-3 text-xs text-zinc-400 leading-relaxed">
            <span className="text-[#00F299] font-semibold">Opening Cursor…</span>{' '}
            If the browser asked, choose <em>“Open Cursor”</em>. Nothing happened?{' '}
            <a
              href={CURSOR_WEB_INSTALL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#00d1ff] underline decoration-dotted underline-offset-2"
            >
              open the web installer
            </a>{' '}
            or{' '}
            <button
              onClick={() => setOpen(true)}
              className="text-[#00d1ff] underline decoration-dotted underline-offset-2 cursor-pointer"
            >
              use the manual config
            </button>
            .
          </div>
        )}

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
            <div className="mt-2 text-[10px] text-zinc-600">
              No protocol handler?{' '}
              <a
                href={CURSOR_WEB_INSTALL}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#00d1ff]/80 underline decoration-dotted underline-offset-2"
              >
                Official web installer →
              </a>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}
