import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

// ─────────────────────────────────────────────────────────────────────────────
// Instalación 1-click de Cursor · INSTALLER v5 — PROTOCOLO DIRECTO
//
// Clic → el navegador lanza DIRECTO el protocolo que Cursor registra en el SO:
//   cursor://anysphere.cursor-deeplink/mcp/install?name=<enc>&config=<enc JSON>
// (mecanismo idéntico al que ejecuta la página de cursor.com — extraído de su
// propio JS — pero SIN página intermedia: la navegación a protocolos externos
// no cambia la URL, el usuario se queda en marketnow.site).
//
// El SO pedirá permiso UNA vez ("¿Abrir Cursor?"): regla ineludible para
// cualquier app de escritorio (Zoom, Telegram, VS Code — todos pasan por ahí).
// Tras aceptar, Cursor abre solo con el diálogo de instalación de MarketNow.
//
// UX: botón + COPY. Sin páginas, sin manual, sin estados ruidosos.
// Única ayuda: una línea discreta a los 8s SOLO si no hubo señal de apertura.
// ─────────────────────────────────────────────────────────────────────────────

const MCP_NAME = 'MarketNow';
const MCP_SERVER = { url: 'https://marketnow.site/api/mcp' };

const CURSOR_DEEPLINK =
  'cursor://anysphere.cursor-deeplink/mcp/install' +
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
  const [status, setStatus] = useState('idle'); // idle → opening → opened
  const [hint, setHint] = useState(false);

  // Éxito ≈ la pestaña pierde el foco: el diálogo "Open Cursor?" (o el propio
  // Cursor ya en primer plano) tomaron el foco del SO. Heurística estándar de
  // los botones "open in app". La ayuda a los 8s se cancela sola con el éxito.
  useEffect(() => {
    if (status !== 'opening') return undefined;
    const focusLost = () => setStatus('opened');
    const onVisibility = () => { if (document.hidden) focusLost(); };
    window.addEventListener('blur', focusLost);
    document.addEventListener('visibilitychange', onVisibility);
    const hintTimer = setTimeout(() => setHint(true), 8000);
    return () => {
      window.removeEventListener('blur', focusLost);
      document.removeEventListener('visibilitychange', onVisibility);
      clearTimeout(hintTimer);
    };
  }, [status]);

  const copyConfig = async () => {
    try {
      await navigator.clipboard.writeText(MCP_JSON);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard bloqueado — irrelevante para el flujo 1-click */
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
            REGISTRY v1.15.0 · INSTALLER v5
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          {/* href = protocolo cursor:// DIRECTO. La navegación externa no mueve
              la página: queda el prompt nativo del navegador y Cursor abre. */}
          <a
            href={CURSOR_DEEPLINK}
            onClick={() => { setStatus('opening'); setHint(false); }}
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

        {status === 'opening' && (
          <p className="mt-3 text-xs text-zinc-400 leading-relaxed">
            Opening Cursor… your browser may ask once — choose{' '}
            <span className="text-white">Open Cursor</span>.
          </p>
        )}
        {status === 'opened' && (
          <p className="mt-3 text-xs text-[#00F299] leading-relaxed">
            Cursor is opening — accept the MarketNow install prompt inside Cursor.
          </p>
        )}
        {hint && status !== 'opened' && (
          <p className="mt-2 text-[11px] text-zinc-500 leading-relaxed">
            Cursor didn&apos;t open? Click the button again, or open this page in your
            desktop browser (Chrome / Edge / Firefox) — in-app webviews block app links.
          </p>
        )}
      </div>
    </motion.div>
  );
}
