import * as React from "react";
import useBreakpoint from "../../hooks/useBreakpoint";

export type TabKey = string | number;

export type TabItem = {
  key: TabKey;
  label: string;
  /** Ícone opcional (ReactNode) mostrado no desktop */
  icon?: React.ReactNode;
};

type ResponsiveTabsProps = {
  items: TabItem[];
  value: TabKey;
  onChange: (key: TabKey) => void;
  /** Classe extra do wrapper */
  className?: string;
  /** Texto do rótulo no mobile (acima do <select>) */
  mobileLabel?: string;
};

export default function ResponsiveTabs({
  items,
  value,
  onChange,
  className = "",
  mobileLabel = "Selecionar",
}: ResponsiveTabsProps) {
  const bp = useBreakpoint();
  const isDesktop = bp.isMd;

  if (!items || items.length === 0) return null;

  if (!isDesktop) {
    // ===== MOBILE: SELECT =====
    return (
      <div className={`w-full ${className}`}>
        <label className="block text-[12px] text-slate-400 mb-1">{mobileLabel}</label>
        <select
          value={String(value)}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-lg bg-slate-950/60 border border-white/10 px-3 py-2 text-sm outline-none focus:ring-2 ring-emerald-400/40"
        >
          {items.map((it) => (
            <option key={String(it.key)} value={String(it.key)}>
              {it.label}
            </option>
          ))}
        </select>
      </div>
    );
  }

  // ===== DESKTOP: ABAS (botões) =====
  return (
    <div className={`inline-flex items-center gap-1 rounded-xl bg-white/5 ring-1 ring-white/10 p-1 ${className}`}>
      {items.map((it) => {
        const active = String(it.key) === String(value);
        return (
          <button
            key={String(it.key)}
            type="button"
            onClick={() => onChange(it.key)}
            className={`px-3 py-1.5 text-sm rounded-lg transition ${
              active ? "bg-white/10 text-white" : "text-slate-300 hover:bg-white/5"
            }`}
          >
            <span className="inline-flex items-center gap-1">
              {it.icon ? <span className="text-slate-300">{it.icon}</span> : null}
              {it.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
