import * as React from "react";
import Sidebar from "../Sidebar";
import Topbar from "../Topbar";
import useViewportHeight from "../../hooks/useViewportHeight";

type ResponsiveShellProps = {
  children: React.ReactNode;
  /** Classe extra para o <main> (padding, etc.) */
  mainClassName?: string;
  /** Mostrar/ocultar Topbar do shell (default: true) */
  showTopbar?: boolean;
  /** Rota/slug ativo para navegação (quem chama informa) */
  active?: string; // será repassado ao Sidebar
  /** Handler de seleção do menu lateral */
  onSelect?: (key: string) => void;
};

export default function ResponsiveShell({
  children,
  mainClassName = "pt-24 px-4 sm:px-6 lg:px-8",
  showTopbar = true,
  active,
  onSelect,
}: ResponsiveShellProps) {
  useViewportHeight();

  const [open, setOpen] = React.useState(false);
  const panelRef = React.useRef<HTMLDivElement | null>(null);
  const prevOverflowRef = React.useRef<string>("");

  const noopSelect = React.useCallback((_k: any) => {}, []);

  // Fecha o drawer após selecionar no mobile + repassa seleção
  const handleSelectMobile = React.useCallback(
    (key: any) => {
      try {
        (onSelect as any)?.(key);
      } finally {
        setOpen(false);
      }
    },
    [onSelect]
  );

  // Bloqueia o scroll do body enquanto o drawer estiver aberto
  React.useEffect(() => {
    if (!open) return;
    prevOverflowRef.current = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflowRef.current;
    };
  }, [open]);

  // Fecha com ESC somente quando aberto
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Foco no painel ao abrir (acessibilidade)
  React.useEffect(() => {
    if (open) panelRef.current?.focus();
  }, [open]);

  return (
    <div className="min-h-[calc(var(--vh,1vh)*100)] bg-slate-950 text-slate-100">
      {/* ===== Sidebar desktop (fixa) ===== */}
      <div className="hidden md:block fixed top-0 left-0 h-full w-72 z-40">
        {/* Cast p/ alinhar com NavKey do Sidebar (se for um union) */}
        <Sidebar active={active as any} onSelect={(onSelect as any) ?? noopSelect} />
      </div>

      {/* ===== Área principal, deslocada pela sidebar no desktop ===== */}
      <div className="md:ml-72 flex min-h-[calc(var(--vh,1vh)*100)] flex-col">
        {/* Topbar fixa (desktop + mobile) */}
        {showTopbar && (
          <div className="sticky top-0 z-30">
            {/* Topbar não recebe active/onSelect aqui */}
            <Topbar />
          </div>
        )}

        {/* Botão hambúrguer apenas no mobile (< md) */}
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="md:hidden fixed top-3 left-3 z-40 inline-flex items-center justify-center rounded-lg bg-white/10 border border-white/20 px-2.5 py-2 backdrop-blur hover:bg-white/15 focus:outline-none focus:ring-2 focus:ring-emerald-400/40"
          aria-label="Abrir menu"
          aria-expanded={open}
          aria-controls="mobile-drawer"
        >
          <svg viewBox="0 0 24 24" role="img" aria-hidden="true" className="h-5 w-5">
            <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>

        {/* Conteúdo rolável */}
        <main className={`flex-1 ${mainClassName}`}>{children}</main>
      </div>

      {/* ===== Drawer mobile (sidebar off-canvas) ===== */}
      {/* Backdrop (z-40) */}
      <div
        className={`md:hidden fixed inset-0 z-40 transition-opacity duration-200 ${
          open ? "opacity-100 pointer-events-auto bg-black/60" : "opacity-0 pointer-events-none"
        }`}
        onClick={() => setOpen(false)}
        aria-hidden="true"
      />

      {/* Panel (z-50) */}
      <aside
        id="mobile-drawer"
        ref={panelRef}
        className={`md:hidden fixed inset-y-0 left-0 z-50 w-72 ring-1 ring-white/10 bg-slate-900 transform transition-transform duration-200 ${
          open ? "translate-x-0" : "-translate-x-full"
        } outline-none`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="drawer-title"
        tabIndex={-1}
      >
        {/* Cabeçalho do drawer (botão fechar) */}
        <div className="h-14 flex items-center justify-between px-3 border-b border-white/10">
          <span id="drawer-title" className="text-sm font-medium text-slate-300 truncate">
            Menu
          </span>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="inline-flex items-center justify-center rounded-lg bg-white/10 border border-white/20 px-2 py-1.5 hover:bg-white/15 focus:outline-none focus:ring-2 focus:ring-emerald-400/40"
            aria-label="Fechar menu"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Conteúdo da sidebar */}
        <div className="h-[calc(100%-3.5rem)] overflow-y-auto">
          {/* No mobile, usa handler que fecha o drawer após a seleção */}
          <Sidebar active={active as any} onSelect={handleSelectMobile} />
        </div>
      </aside>
    </div>
  );
}
