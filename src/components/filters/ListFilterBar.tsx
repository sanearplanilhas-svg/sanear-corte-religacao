import * as React from "react";
import { ChevronUp, ChevronDown, Trash2, Search, X } from "lucide-react";

export type ListFilter = {
  q: string;
  startDate: string | null; // YYYY-MM-DD
  endDate: string | null;
};

type Props = {
  value: ListFilter;
  onChange: (v: ListFilter) => void;
  onSearch: () => void;
  onClear: () => void;

  // Exclusão em lote (controlado pelo pai)
  deletable?: boolean;              // se true, mostra botão "Excluir"
  deleteMode?: boolean;             // estado atual do modo exclusão
  onToggleDeleteMode?: () => void;  // alterna modo exclusão
  onConfirmDelete?: () => void;     // pai executa a exclusão
  selectedCount?: number;           // quantos itens marcados
};

export default function ListFilterBar({
  value, onChange, onSearch, onClear,
  deletable = true, deleteMode = false,
  onToggleDeleteMode, onConfirmDelete,
  selectedCount = 0
}: Props) {
  const [collapsed, setCollapsed] = React.useState(false);

  function setQuick(days: number | "hoje") {
    const now = new Date();
    const toISO = (d: Date) => d.toISOString().slice(0, 10);

    if (days === "hoje") {
      const d = toISO(now);
      onChange({ ...value, startDate: d, endDate: d });
      onSearch();
      return;
    }

    const start = new Date();
    start.setDate(now.getDate() - (Number(days) - 1));
    onChange({ ...value, startDate: toISO(start), endDate: toISO(now) });
    onSearch();
  }

  function setMais24h() {
    const limite = new Date(Date.now() - 24 * 60 * 60 * 1000); // agora - 24h
    const toISO = (d: Date) => d.toISOString().slice(0, 10);

    onChange({
      ...value,
      startDate: null,
      endDate: toISO(limite),
    });
    onSearch();
  }

  function setTodas() {
    onChange({
      q: "",
      startDate: null,
      endDate: null,
    });
    onSearch();
  }

  function handleSearch() {
    onClear(); // 🔥 reset filtros
    onSearch();
  }

  return (
    <div className="rounded-xl bg-slate-900/60 ring-1 ring-white/10 mb-3">
      {/* Cabeçalho do filtro */}
      <div className="flex items-center justify-between px-3 py-2">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCollapsed((c) => !c)}
            className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 transition"
            aria-label={collapsed ? "Expandir filtro" : "Recolher filtro"}
          >
            {collapsed ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
          </button>
          <span className="text-xs uppercase tracking-wide text-slate-400">Filtros</span>
          {deleteMode && (
            <span className="ml-2 text-xs px-2 py-1 rounded bg-rose-600/20 text-rose-200 ring-1 ring-rose-400/40">
              Exclusão em lote: {selectedCount}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {deletable && (
            <>
              {!deleteMode ? (
                <button
                  onClick={() => onToggleDeleteMode?.()}
                  className="text-xs px-3 py-2 rounded-lg bg-rose-600/20 text-rose-200 ring-1 ring-rose-400/40 hover:bg-rose-600/30 inline-flex items-center gap-2"
                  title="Ativar seleção para excluir"
                >
                  <Trash2 size={14} /> Excluir
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => onConfirmDelete?.()}
                    className="text-xs px-3 py-2 rounded-lg bg-rose-600/30 text-rose-100 ring-1 ring-rose-400/40 hover:bg-rose-600/40"
                    title="Excluir selecionados"
                  >
                    Excluir selecionados
                  </button>
                  <button
                    onClick={() => onToggleDeleteMode?.()}
                    className="text-xs px-3 py-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 inline-flex items-center gap-2"
                    title="Sair do modo exclusão"
                  >
                    <X size={14} /> Cancelar
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {!collapsed && (
        <div className="px-3 pb-3">
          {/* Layout em grid responsivo */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
            {/* Busca */}
            <div className="col-span-1 md:col-span-2">
              <label className="block text-xs text-slate-400 mb-1">Buscar</label>
              <input
                value={value.q}
                onChange={(e) => onChange({ ...value, q: e.target.value })}
                placeholder="Matrícula, bairro, rua, OS..."
                className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {/* Datas */}
            <div>
              <label className="block text-xs text-slate-400 mb-1">Data inicial</label>
              <input
                type="date"
                value={value.startDate ?? ""}
                onChange={(e) => onChange({ ...value, startDate: e.target.value || null })}
                className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Data final</label>
              <input
                type="date"
                value={value.endDate ?? ""}
                onChange={(e) => onChange({ ...value, endDate: e.target.value || null })}
                className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          {/* Atalhos + ações */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-xs text-slate-400 mr-2">Atalhos:</span>
            <button onClick={setTodas} className="text-xs px-3 py-1.5 rounded-lg bg-emerald-500/20 text-emerald-200 border border-emerald-400/40 hover:bg-emerald-500/30">Todas</button>
            <button onClick={() => setQuick("hoje")} className="text-xs px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10">Hoje</button>
            <button onClick={() => setQuick(7)} className="text-xs px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10">7 dias</button>
            <button onClick={() => setQuick(15)} className="text-xs px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10">15 dias</button>
            <button onClick={() => setQuick(30)} className="text-xs px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10">30 dias</button>
            <button
              onClick={setMais24h}
              className="text-xs px-3 py-1.5 rounded-lg bg-rose-500/20 text-rose-200 border border-rose-400/40 hover:bg-rose-500/30"
            >
              +24h
            </button>

            <div className="ml-auto flex gap-2">
              <button
                onClick={handleSearch}
                className="text-xs px-3 py-2 rounded-lg bg-indigo-500/20 text-indigo-200 ring-1 ring-indigo-400/40 hover:bg-indigo-500/30 inline-flex items-center gap-2"
              >
                <Search size={14} /> Buscar
              </button>
              <button
                onClick={onClear}
                className="text-xs px-3 py-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 inline-flex items-center gap-2"
              >
                <X size={14} /> Limpar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
