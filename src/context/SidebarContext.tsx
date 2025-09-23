import * as React from "react";

type SidebarContextType = {
  open: boolean;
  openSidebar: () => void;
  closeSidebar: () => void;
  toggleSidebar: () => void;
};

const SidebarContext = React.createContext<SidebarContextType | undefined>(undefined);

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);

  const openSidebar = React.useCallback(() => setOpen(true), []);
  const closeSidebar = React.useCallback(() => setOpen(false), []);
  const toggleSidebar = React.useCallback(() => setOpen((v) => !v), []);

  const value = React.useMemo(() => ({ open, openSidebar, closeSidebar, toggleSidebar }), [open, openSidebar, closeSidebar, toggleSidebar]);

  return <SidebarContext.Provider value={value}>{children}</SidebarContext.Provider>;
}

export function useSidebar() {
  const ctx = React.useContext(SidebarContext);
  if (!ctx) throw new Error("useSidebar must be used within <SidebarProvider>");
  return ctx;
}

/** Botão padrão (hamburger) que só aparece em telas < md */
export function SidebarToggleButton({
  className = "",
  label = "Menu",
}: {
  className?: string;
  label?: string;
}) {
  const { toggleSidebar } = useSidebar();
  return (
    <button
      type="button"
      onClick={toggleSidebar}
      className={`md:hidden inline-flex items-center gap-2 rounded-lg bg-white/10 border border-white/20 px-2.5 py-2 hover:bg-white/15 focus:outline-none focus:ring-2 focus:ring-emerald-400/40 ${className}`}
      aria-label={label}
    >
      {/* ícone hamburger */}
      <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
        <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
      <span className="text-sm">Menu</span>
    </button>
  );
}
