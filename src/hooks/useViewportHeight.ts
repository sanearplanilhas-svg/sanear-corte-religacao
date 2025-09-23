import * as React from "react";

/**
 * Corrige o 100vh em navegadores mobile (Safari/Chrome iOS).
 * Define a CSS var `--vh` = 1% da altura visível.
 *
 * Uso no CSS (Tailwind inline):
 *   style={{ height: "calc(var(--vh, 1vh) * 100)" }}
 * ou
 *   className="min-h-[calc(var(--vh,1vh)*100)]"
 */
export default function useViewportHeight() {
  const setVar = React.useCallback(() => {
    if (typeof window === "undefined") return;
    const vh = window.innerHeight * 0.01;
    document.documentElement.style.setProperty("--vh", `${vh}px`);
  }, []);

  React.useEffect(() => {
    // seta no mount
    setVar();

    // atualiza em resize/orientation
    const onResize = () => setVar();
    const onOrientation = () => setTimeout(setVar, 200);

    window.addEventListener("resize", onResize, { passive: true });
    window.addEventListener("orientationchange", onOrientation, { passive: true });

    // alguns UAs disparam mudanças de UI (barra) após scroll
    let raf = 0;
    const onScroll = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(setVar);
    };
    window.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onOrientation);
      window.removeEventListener("scroll", onScroll);
    };
  }, [setVar]);

  return null;
}
