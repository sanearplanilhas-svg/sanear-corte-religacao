import * as React from "react";

/**
 * Hook simples para detectar breakpoints (Tailwind default):
 * sm: 640px, md: 768px, lg: 1024px, xl: 1280px, 2xl: 1536px
 *
 * Retorna flags booleanas e a largura atual:
 * { width, isSm, isMd, isLg, isXl, is2xl }
 */
export default function useBreakpoint() {
  const getWidth = () =>
    typeof window !== "undefined" && typeof window.innerWidth === "number"
      ? window.innerWidth
      : 0;

  const [width, setWidth] = React.useState<number>(getWidth);

  React.useEffect(() => {
    // evita rodar no SSR
    if (typeof window === "undefined") return;

    let raf = 0;
    const handle = () => {
      // usa RAF p/ debouncing leve e evitar layout thrash
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setWidth(window.innerWidth));
    };

    // atualiza imediatamente (1º paint)
    handle();

    window.addEventListener("resize", handle, { passive: true });
    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("resize", handle);
    };
  }, []);

  const isSm = width >= 640;
  const isMd = width >= 768;
  const isLg = width >= 1024;
  const isXl = width >= 1280;
  const is2xl = width >= 1536;

  return { width, isSm, isMd, isLg, isXl, is2xl };
}
