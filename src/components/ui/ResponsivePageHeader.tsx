import * as React from "react";

/**
 * Cabeçalho responsivo com título/subtítulo e área de ações.
 * - Desktop (≥ md): título à esquerda e ações alinhadas à direita, na mesma linha
 * - Mobile (< md): título/subtítulo em cima e ações empilhadas abaixo, com wrap
 */
export default function ResponsivePageHeader({
  title,
  subtitle,
  actions,
  leading,        // ex.: botão Voltar / ícone
  className = "",
  titleClassName = "",
  subtitleClassName = "",
  actionsClassName = "",
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  leading?: React.ReactNode;
  className?: string;
  titleClassName?: string;
  subtitleClassName?: string;
  actionsClassName?: string;
}) {
  return (
    <div className={`w-full ${className}`}>
      {/* Linha desktop */}
      <div className="hidden md:flex items-center justify-between gap-3">
        <div className="min-w-0 flex items-center gap-3">
          {leading ? <div className="shrink-0">{leading}</div> : null}
          <div className="min-w-0">
            <h1 className={`text-2xl font-semibold truncate ${titleClassName}`}>{title}</h1>
            {subtitle ? (
              <p className={`text-slate-400 text-sm truncate ${subtitleClassName}`}>{subtitle}</p>
            ) : null}
          </div>
        </div>
        {actions ? <div className={actionsClassName}>{actions}</div> : <div />}
      </div>

      {/* Empilhado mobile */}
      <div className="md:hidden space-y-3">
        <div className="flex items-center gap-3">
          {leading ? <div className="shrink-0">{leading}</div> : null}
          <div className="min-w-0">
            <h1 className={`text-xl font-semibold break-words ${titleClassName}`}>{title}</h1>
            {subtitle ? (
              <p className={`text-slate-400 text-sm break-words ${subtitleClassName}`}>{subtitle}</p>
            ) : null}
          </div>
        </div>
        {actions ? (
          <div className={`flex flex-wrap items-center gap-2 ${actionsClassName}`}>{actions}</div>
        ) : null}
      </div>
    </div>
  );
}
