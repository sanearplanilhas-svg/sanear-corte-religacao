import * as React from "react";

export type ListFilter = {
  q: string;
  startDate: string | null; // "YYYY-MM-DD" ou null
  endDate: string | null;   // "YYYY-MM-DD" ou null
};

type Props = {
  value: ListFilter;
  onChange: (next: ListFilter) => void;
  onSearch: () => void;
  onClear?: () => void;

  // extras (opcionais)
  deletable?: boolean;
  deleteMode?: boolean;
  selectedCount?: number;
  onToggleDeleteMode?: () => void;
  onConfirmDelete?: () => void;

  // qualidade de vida (opcionais)
  loading?: boolean;                // desabilita botões enquanto busca
  placeholder?: string;             // placeholder customizado do campo de busca
  rightSlot?: React.ReactNode;      // espaço pra filtros extras personalizados (ex.: dropdown de status)
};

export default function ListFilterBar({
  value,
  onChange,
  onSearch,
  onClear,
  deletable = false,
  deleteMode = false,
  selectedCount = 0,
  onToggleDeleteMode,
  onConfirmDelete,
  loading = false,
  placeholder = "Matrícula, bairro ou rua",
  rightSlot,
}: Props) {
  // Garante coerência de datas (se start > end, “corrige” o outro lado)
  React.useEffect(() => {
    if (value.startDate && value.endDate && value.startDate > value.endDate) {
      // Mantém o último campo mexido — aqui vamos ajustar o startDate para endDate
      onChange({ ...value, startDate: value.endDate });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.startDate, value.endDate]);

  const handleEnter = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") onSearch();
    if (e.key === "Escape") onClear?.();
  };

  return (
    <div className="mb-3">
      <div className="flex flex-col gap-3 md:grid md:grid-cols-12 md:items-end">
        {/* Busca */}
        <div className="md:col-span-4">
          <label className="text-xs text-slate-400 mb-1 block">Pesquisar</label>
          <input
            value={value.q}
            onChange={(e) => onChange({ ...value, q: e.target.value })}
            onKeyDown={handleEnter}
            placeholder={placeholder}
            className="w-full rounded-xl bg-slate-950/60 border border-white/10 px-3 py-2 outline-none focus:ring-2 ring-emerald-400/40"
            aria-label="Pesquisar"
          />
        </div>

        {/* De */}
        <div className="md:col-span-3">
          <label className="text-xs text-slate-400 mb-1 block">De</label>
          <input
            type="date"
            value={value.startDate ?? ""}
            max={value.endDate ?? undefined}
            onChange={(e) => onChange({ ...value, startDate: e.target.value || null })}
            className="w-full rounded-xl bg-slate-950/60 border border-white/10 px-3 py-2 outline-none focus:ring-2 ring-emerald-400/40"
            aria-label="Data inicial"
          />
        </div>

        {/* Até */}
        <div className="md:col-span-3">
          <label className="text-xs text-slate-400 mb-1 block">Até</label>
          <input
            type="date"
            value={value.endDate ?? ""}
            min={value.startDate ?? undefined}
            onChange={(e) => onChange({ ...value, endDate: e.target.value || null })}
            className="w-full rounded-xl bg-slate-950/60 border border-white/10 px-3 py-2 outline-none focus:ring-2 ring-emerald-400/40"
            aria-label="Data final"
          />
        </div>

        {/* Botões principais + slot à direita */}
        <div className="md:col-span-2 flex items-end gap-2">
          <button
            type="button"
            onClick={onSearch}
            disabled={loading}
            className="flex-1 px-3 py-2 rounded-lg bg-emerald-500/20 text-emerald-200 ring-1 ring-emerald-400/40 hover:bg-emerald-500/30 disabled:opacity-60"
          >
            {loading ? "Buscando…" : "Buscar"}
          </button>
          {onClear && (
            <button
              type="button"
              onClick={onClear}
              disabled={loading}
              className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 disabled:opacity-60"
            >
              Limpar
            </button>
          )}
        </div>

        {/* Slot opcional para controles extras (ex.: seletor de status) */}
        {rightSlot && (
          <div className="md:col-span-12">
            <div className="flex items-center justify-end">{rightSlot}</div>
          </div>
        )}
      </div>

      {/* Exclusão em massa */}
      {deletable && (
        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            onClick={onToggleDeleteMode}
            className={`px-3 py-2 rounded-lg border ${
              deleteMode
                ? "bg-rose-600 text-white border-rose-500 hover:bg-rose-500"
                : "bg-rose-600/90 text-white border-rose-500 hover:bg-rose-600"
            }`}
            title={deleteMode ? "Cancelar modo de exclusão" : "Excluir…"}
          >
            {deleteMode ? "Cancelar" : "Excluir…"}
          </button>
          {deleteMode && (
            <button
              type="button"
              onClick={onConfirmDelete}
              disabled={(selectedCount ?? 0) === 0}
              className="px-3 py-2 rounded-lg bg-rose-700 hover:bg-rose-600 text-white border border-rose-500 disabled:opacity-60"
              title="Excluir selecionados"
            >
              Excluir selecionados ({selectedCount ?? 0})
            </button>
          )}
        </div>
      )}
    </div>
  );
}
