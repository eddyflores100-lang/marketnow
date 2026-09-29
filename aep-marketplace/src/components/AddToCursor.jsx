import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

// ─────────────────────────────────────────────────────────────────────────────
// Instalación 1-click de Cursor · INSTALLER v3
//
// Lanza el protocolo DIRECTO que Cursor registra en el SO:
//   cursor://anysphere.cursor-deeplink/mcp/install?name=<enc>&config=<enc JSON>
// (idéntico al mecanismo interno de cursor.com/install-mcp, pero SIN su página
// intermedia — esa página ejecuta window.close() a los 1.5s, lo que mataba el
// prompt del protocolo y devolvía al usuario al sitio "sin que Cursor abriera").
//
// v3 añade feedback determinista en cada paso:
//   · clic → estado "Opening Cursor…" inmediato
//   · detección de éxito: si el tab pierde visibilidad ≲2s, el SO enfocó Cursor
//   · detección de fallo (móvil / webview / protocolo no registrado / prompt
//     bloqueado): a los ~2.2s se despliega el fallback manual automáticamente
//   · TRY AGAIN re-dispara el protocolo; COPY mcp.json siempre disponible
//   · marcador "INSTALLER v3" visible en el header (permite saber de un vistazo
//     si el navegador corre el bundle nuevo o uno cacheado)
//   · SIN enlaces a cursor.com (nada de pestañas que se abren y se cierran solas)
// ─────────────────────────────────────────────────────────────────────────────

const MCP_NAME = 'MarketNow';
const MCP_SERVER = { url: 'https://marketnow.site/api/mcp' };

const CURSOR_DEEPLINK =
  'cursor://anysphere.cursor-deeplink/mcp/install' +
  '?name=' + encodeURIComponent(MCP_NAME) +
  '&config=' + encodeURIComponent(JSON.stringify(MCP_SERVER));

const MCP_URL = MCP_SERVER.url;

const MCP_JSON = `{
  "mcpServers": {
    "MarketNow": {
      "url": "https://marketnow.site/api/mcp"
    }
  }
}`;

export default function AddToCursor() {
  const [copied, setCopied] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  // idle → launching → opened | stalled
  const [phase, setPhase] = useState('idle');

  const isTouch =
    typeof window !== 'undefined' &&
    !!window.matchMedia &&
    window.matchMedia('(pointer: coarse)').matches;

  // Detección del resultado del lanzamiento: si la pestaña pierde visibilidad
  // poco después del clic, el SO enfocó la app (Cursor). Si a los ~2.2s sigue
  // visible, el protocolo no lanzó → mostrar fallbacks automáticamente.
  useEffect(() => {
    if (phase !== 'launching') return undefined;
    let opened = false;
    const markOpened = () => {
      if (opened) return;
      opened = true;
      setPhase('opened');
    };
    const onVis = () => {
      if (document.visibilityState === 'hidden') markOpened();
    };
    window.addEventListener('pagehide', markOpened);
    window.addEventListener('blur', markOpened);
    document.addEventListener('visibilitychange', onVis);
    const timer = setTimeout(() => {
      if (!opened) {
        setPhase('stalled');
        setManualOpen(true);
      }
    }, 2200);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('pagehide', markOpened);
      window.removeEventListener('blur', markOpened);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [phase]);

  const copyConfig = async () => {
    try {
      await navigator.clipboard.writeText(MCP_JSON);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard bloqueado — el JSON desplegable es el fallback */
    }
  };

  const retry = () => {
    setPhase('launching');
    try {
      window.location.href = CURSOR_DEEPLINK;
    } catch {
      setPhase('stalled');
      setManualOpen(true);
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
            REGISTRY v1.15.0 · INSTALLER v3
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          {/* 1-click: dispara el protocolo cursor:// directamente. El usuario
              permanece en esta página; Cursor abre vía prompt del navegador. */}
          <a
            href={CURSOR_DEEPLINK}
            onClick={() => { setPhase('launching'); setManualOpen(false); }}
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
            onClick={() => setManualOpen(o => !o)}
            className="px-4 py-3 border border-white/10 text-zinc-300 font-medium rounded-lg hover:bg-white/5 transition-all duration-300 cursor-pointer"
            aria-expanded={manualOpen}
          >
            {manualOpen ? 'HIDE STEPS' : 'HOW TO INSTALL'}
          </button>
        </div>

        {/* Estado del lanzamiento — feedback determinista en cada paso. */}
        {phase === 'launching' && (
          <div className="mt-3 flex items-center gap-2 text-xs text-[#00F299]">
            <span className="inline-block w-2 h-2 rounded-full bg-[#00F299] animate-pulse" />
            Opening Cursor… if the browser asks, choose “Open Cursor”.
          </div>
        )}

        {phase === 'opened' && (
          <div className="mt-3 text-xs text-[#00F299]">
            ✓ Cursor is opening — confirm the server inside Cursor (Settings → MCP).
          </div>
        )}

        {phase === 'stalled' && (
          <div className="mt-3 p-3 rounded-lg bg-amber-500/5 border border-amber-500/20 text-xs text-amber-200/90 leading-relaxed">
            <div className="font-semibold mb-1">Cursor didn't open automatically.</div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <button
                onClick={retry}
                className="text-[#00F299] font-bold underline decoration-dotted underline-offset-2 cursor-pointer"
              >
                TRY AGAIN
              </button>
              <button
                onClick={copyConfig}
                className="text-[#00F299] font-bold underline decoration-dotted underline-offset-2 cursor-pointer"
              >
                {copied ? 'COPIED ✓' : 'COPY mcp.json'}
              </button>
              <span className="text-amber-200/60">
                {isTouch
                  ? 'You look to be on a phone — run this from the desktop browser where Cursor is installed, or copy the config and paste it there.'
                  : 'Allow the “Open Cursor” prompt if it appears, or install manually below (30 seconds).'}
              </span>
            </div>
          </div>
        )}

        <p className="mt-3 text-xs text-zinc-500 leading-relaxed">
          Remote streamable-http · no auth required · works with Cursor, Claude Desktop,
          Cline, VS Code, Windsurf and any MCP client. 15 tools: search 68k+ servers,
          verify agent credentials, check scam domains, translate 9 formats.
        </p>

        {manualOpen && (
          <div className="mt-4 text-left">
            <div className="text-[10px] text-zinc-500 font-mono mb-2 uppercase tracking-wider">
              Manual install — 2 ways, no deep link needed
            </div>
            <ol className="text-xs text-zinc-400 leading-relaxed list-decimal list-inside space-y-2">
              <li>
                In Cursor: <span className="text-white">Settings → MCP → “+ Add new MCP Server”</span>
                {' '}→ type <span className="text-white">MarketNow</span> and paste the URL:
                <div className="mt-1 p-2 rounded-lg bg-black/80 border border-white/5 text-[#00F299] font-mono overflow-x-auto">
                  {MCP_URL}
                </div>
              </li>
              <li>
                Or edit the config file directly —
                {' '}<span className="text-white">~/.cursor/mcp.json</span> (Cursor),
                {' '}<span className="text-white">claude_desktop_config.json</span> (Claude Desktop),
                {' '}<span className="text-white">.mcp.json</span> (VS Code, Cline, Windsurf):
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
