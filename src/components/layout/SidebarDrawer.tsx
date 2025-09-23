import * as React from "react";

type SidebarDrawerProps = {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  /** Largura do painel (ex.: "w-72"). Default: w-72 */
  widthClassName?: string;
  /** Título visível no topo do drawer (mobile) */
  title?: string;
};

/**
 * Drawer lateral para mobile.
 * - Bloqueia scroll do body quando aberto
 * - Fecha no ESC e no clique do backdrop
 * - Acessível com role="dialog" e aria-modal
 */
export default function SidebarDrawer({
  open,
  onClose,
  children,
  widthClassName = "w-72",
  title = "Menu",
}: SidebarDrawerProps) {
  const panelRef = React.useRef<HTMLDivElement | null>(null);

  // Bloqueia scroll do body enquanto aberto
  React.useEffect(() => {
    if (open) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = prev;
      };
    }
  }, [open]);

  // Fecha no ESC
  React.useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  // Foca o painel ao abrir (melhora navegação por teclado)
  React.useEffect(() => {
    if (open && panelRef.current) {
      panelRef.current.focus();
    }
  }, [open]);

  return (
    <div
      aria-hidden={!open}
      className={`md:hidden fixed inset-0 z-50 ${open ? "pointer-events-auto" : "pointer-events-none"}`}
    >
      {/* Backdrop */}
      <div
        onClick={onClose}
        className={`absolute inset-0 bg-black/50 transition-opacity ${open ? "opacity-100" : "opacity-0"}`}
      />

      {/* Painel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="drawer-title"
        tabIndex={-1}
        ref={panelRef}
        className={`absolute top-0 left-0 h-full ${widthClassName} bg-slate-900/95 backdrop-blur ring-1 ring-white/10
          transition-transform duration-200 ease-out
          ${open ? "translate-x-0" : "-translate-x-full"}
          outline-none`}
      >
        {/* Header */}
        <div className="h-16 flex items-center justify-between px-4 border-b border-white/10">
          <h2 id="drawer-title" className="text-sm font-semibold text-slate-200 truncate">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="inline-flex items-center justify-center rounded-lg bg-white/10 border border-white/20 px-2.5 py-2 hover:bg-white/15 focus:outline-none focus:ring-2 focus:ring-emerald-400/40"
          >
            {/* ícone X */}
            <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Conteúdo da sidebar */}
        <div className="h-[calc(100%-4rem)] overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
