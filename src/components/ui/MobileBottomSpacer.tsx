import * as React from "react";

/**
 * Espaçador para evitar que conteúdo fique escondido atrás de barras fixas no rodapé (mobile).
 * Exibe um bloco invisível apenas em telas < md.
 *
 * Use logo após listas/tabelas quando utilizar a <MobileActionsBar />.
 */
export default function MobileBottomSpacer({
  height = 72, // px
  className = "",
}: {
  height?: number;
  className?: string;
}) {
  return <div className={`md:hidden ${className}`} style={{ height }} aria-hidden="true" />;
}
