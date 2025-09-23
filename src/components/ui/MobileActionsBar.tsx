import * as React from "react";

type MobileActionsBarProps = {
  /** Conteúdo customizado. Se informado, ignora os botões padrão. */
  children?: React.ReactNode;

  /** Botão principal (direita) */
  primaryLabel?: string;
  onPrimary?: () => void;
  primaryDisabled?: boolean;

  /** Botão secundário (esquerda) */
  secondaryLabel?: string;
  onSecondary?: () => void;
  secondaryDisabled?: boolean;

  /** Altura fixa do bar em px (combine com <MobileBottomSpacer height={...} />). */
  height?: number;

  /** Classes adicionais do wrapper fixo */
  className?: string;
};

/**
 * Barra fixa de ações para mobile (somente < md).
 * Use junto com <MobileBottomSpacer /> para não cobrir o conteúdo.
 */
export default function MobileActionsBar({
  children,
  primaryLabel = "Salvar",
  onPrimary,
  primaryDisabled,
  secondaryLabel,
  onSecondary,
  secondaryDisabled,
  height = 72,
  className = "",
}: MobileActionsBarProps) {
  return (
    <div
      className={`md:hidden fixed left-0 right-0 bottom-0 z-40 ${className}`}
      style={{
        height,
        paddingBottom: "env(safe-area-inset-bottom)",
        backdropFilter: "blur(6px)",
      }}
      aria-live="polite"
    >
      <div className="h-full bg-slate-900/80 ring-1 ring-white/10 px-3">
        <div className="h-full flex items-center justify-between gap-2">
          {children ? (
            <div className="w-full flex items-center justify-between gap-2">{children}</div>
          ) : (
            <>
              {/* Secundário (esquerda) */}
              {secondaryLabel ? (
                <button
                  type="button"
                  onClick={onSecondary}
                  disabled={secondaryDisabled}
                  className="flex-1 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-slate-200 text-sm hover:bg-white/10 disabled:opacity-50"
                >
                  {secondaryLabel}
                </button>
              ) : (
                <span className="flex-1" />
              )}

              {/* Primário (direita) */}
              <button
                type="button"
                onClick={onPrimary}
                disabled={primaryDisabled}
                className="flex-1 px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm disabled:opacity-50"
              >
                {primaryLabel}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
