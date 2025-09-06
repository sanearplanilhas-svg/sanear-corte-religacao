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
}: Props) {
  return (
    <div className="mb-3">
      <div className="flex flex-col gap-3 md:grid md:grid-cols-12 md:items-end">
        {/* Busca */}
        <div className="md:col-span-4">
          <label className="text-xs text-slate-400 mb-1 block">Pesquisar</label>
          <input
            value={value.q}
            onChange={(e) => onChange({ ...value, q: e.target.value })}
            onKeyDown={(e) => { if (e.key === "Enter") onSearch(); }}
            placeholder="Matrícula, bairro ou rua"
            className="w-full rounded-xl bg-slate-950/60 border border-white/10 px-3 py-2 outline-none focus:ring-2 ring-emerald-400/40"
          />
        </div>

        {/* De */}
        <div className="md:col-span-3">
          <label className="text-xs text-slate-400 mb-1 block">De</label>
          <input
            type="date"
            value={value.startDate ?? ""}
            onChange={(e) => onChange({ ...value, startDate: e.target.value || null })}
            className="w-full rounded-xl bg-slate-950/60 border border-white/10 px-3 py-2 outline-none focus:ring-2 ring-emerald-400/40"
          />
        </div>

        {/* Até */}
        <div className="md:col-span-3">
          <label className="text-xs text-slate-400 mb-1 block">Até</label>
          <input
            type="date"
            value={value.endDate ?? ""}
            onChange={(e) => onChange({ ...value, endDate: e.target.value || null })}
            className="w-full rounded-xl bg-slate-950/60 border border-white/10 px-3 py-2 outline-none focus:ring-2 ring-emerald-400/40"
          />
        </div>

        {/* Botões principais */}
        <div className="md:col-span-2 flex items-end gap-2">
          <button
            type="button"
            onClick={onSearch}
            className="flex-1 px-3 py-2 rounded-lg bg-emerald-500/20 text-emerald-200 ring-1 ring-emerald-400/40 hover:bg-emerald-500/30"
          >
            Buscar
          </button>
          {onClear && (
            <button
              type="button"
              onClick={onClear}
              className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10"
            >
              Limpar
            </button>
          )}
        </div>
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
              className="px-3 py-2 rounded-lg bg-rose-700 hover:bg-rose-600 text-white border border-rose-500"
            >
              Excluir selecionados ({selectedCount ?? 0})
            </button>
          )}
        </div>
      )}
    </div>
  );
}
