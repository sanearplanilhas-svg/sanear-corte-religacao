import * as React from "react";
import useViewportHeight from "../../hooks/useViewportHeight";
import SidebarDrawer from "./SidebarDrawer";
import { SidebarProvider, useSidebar, SidebarToggleButton } from "../../context/SidebarContext";

/**
 * AppShell
 * - md+: sidebar fixa à esquerda; conteúdo desloca para a direita
 * - < md: sidebar vira drawer; topbar fixa; conteúdo com padding-top
 * - define --vh para corrigir 100vh em mobile
 * - 🔧 Corrigido: não aplicar margin-left no mobile (somente em md+)
 * - 🔧 Suporte a largura dinâmica da sidebar via CSS var --sidebar-w (fallback para 18rem / w-72)
 */
export default function AppShell({
  sidebar,
  topbar,
  children,
  sidebarWidthClassName = "w-72",
  contentClassName = "",
}: {
  sidebar: React.ReactNode;
  topbar: React.ReactNode;
  children: React.ReactNode;
  sidebarWidthClassName?: string; // ex.: "w-72"
  contentClassName?: string;
}) {
  useViewportHeight();

  return (
    <SidebarProvider>
      <ShellInner
        sidebar={sidebar}
        topbar={topbar}
        sidebarWidthClassName={sidebarWidthClassName}
        contentClassName={contentClassName}
      >
        {children}
      </ShellInner>
    </SidebarProvider>
  );
}

function ShellInner({
  sidebar,
  topbar,
  children,
  sidebarWidthClassName,
  contentClassName,
}: {
  sidebar: React.ReactNode;
  topbar: React.ReactNode;
  children: React.ReactNode;
  sidebarWidthClassName: string;
  contentClassName?: string;
}) {
  const { open, closeSidebar } = useSidebar();

  // Define --sidebar-w dinamicamente com base na largura real do <aside> (md+)
  const containerRef = React.useRef<HTMLDivElement>(null);
  const asideRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const setVar = () => {
      const w = asideRef.current?.offsetWidth || 0;
      if (containerRef.current) {
        containerRef.current.style.setProperty("--sidebar-w", `${w}px`);
      }
    };

    setVar(); // primeiro paint

    // Observa mudanças de tamanho da sidebar (seguro em navegadores modernos)
    let ro: ResizeObserver | null = null;
    if (typeof window !== "undefined" && "ResizeObserver" in window && asideRef.current) {
      ro = new ResizeObserver(() => setVar());
      ro.observe(asideRef.current);
    }

    window.addEventListener("resize", setVar, { passive: true });
    return () => {
      window.removeEventListener("resize", setVar);
      ro?.disconnect();
    };
  }, []);

  return (
    <div ref={containerRef} className="min-h-[calc(var(--vh,1vh)*100)] bg-slate-950 text-slate-100">
      {/* Sidebar fixa (desktop) */}
      <aside
        ref={asideRef}
        className={`hidden md:block fixed top-0 left-0 h-full z-40 ${sidebarWidthClassName}`}
      >
        {sidebar}
      </aside>

      {/* Drawer (mobile) */}
      <SidebarDrawer open={open} onClose={closeSidebar} widthClassName={sidebarWidthClassName} title="Menu">
        {sidebar}
      </SidebarDrawer>

      {/* Área principal */}
      {/* 🔧 Removido style com margin-left global; agora só aplica deslocamento em md+.
          Fallback md:ml-72 + versão com var(--sidebar-w) para quando a largura for customizada. */}
      <main className={`flex-1 relative md:ml-72 md:[margin-left:var(--sidebar-w)]`}>
        {/* Topbar fixa */}
        {/* Também deslocada apenas em md+ (fallback left-72 + var dinâmica) */}
        <div className="fixed top-0 left-0 right-0 h-16 z-30 md:left-72 md:left-[var(--sidebar-w)]">
          {/* Em mobile, garanta um botão padrão para abrir o menu se o seu Topbar não tiver */}
          <div className="md:hidden absolute left-3 top-3">
            <SidebarToggleButton />
          </div>
          {topbar}
        </div>

        {/* Conteúdo rolável */}
        <div className="pt-20 md:pt-24 px-4 md:px-8">
          <div className={`min-h-[calc(var(--vh,1vh)*100-6rem)] ${contentClassName}`}>{children}</div>
        </div>
      </main>
    </div>
  );
}
