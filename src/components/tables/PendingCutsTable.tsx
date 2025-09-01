import * as React from "react";
import supabase from "../../lib/supabase";
import ListFilterBar, { ListFilter } from "../../components/filters/ListFilterBar";

type CorteRow = {
  id: string;
  matricula: string;
  bairro: string;
  rua: string;
  numero: string;
  ponto_referencia: string | null;
  prioridade: boolean;
  status: string;
  pdf_ordem_path: string | null;
  created_at: string;
  cortada_em?: string | null;
};

export default function PendingCutsTable() {
  const [priorityRows, setPriorityRows] = React.useState<CorteRow[]>([]);
  const [normalRows, setNormalRows] = React.useState<CorteRow[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [msg, setMsg] = React.useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const [filter, setFilter] = React.useState<ListFilter>({
    q: "",
    startDate: null,
    endDate: null,
  });

  const [showPriorityPopup, setShowPriorityPopup] = React.useState(false);

  // Exclusão em lote
  const [deleteMode, setDeleteMode] = React.useState(false);
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());

  function buildQuery() {
    let query = supabase
      .from("ordens_corte")
      .select(
        "id, matricula, bairro, rua, numero, ponto_referencia, prioridade, status, pdf_ordem_path, created_at, cortada_em"
      )
      .eq("status", "pendente");

    if (filter.startDate) query = query.gte("created_at", `${filter.startDate}T00:00:00`);
    if (filter.endDate) query = query.lte("created_at", `${filter.endDate}T23:59:59`);

    if (filter.q?.trim()) {
      const q = filter.q.trim();
      query = query.or(`matricula.ilike.%${q}%,bairro.ilike.%${q}%,rua.ilike.%${q}%`);
    }

    return query.order("created_at", { ascending: false });
  }

  async function load() {
    setLoading(true);
    const { data, error } = await buildQuery();
    if (error) {
      setMsg({ kind: "err", text: error.message });
      setLoading(false);
      return;
    }

    const rows = (data || []) as CorteRow[];
    const pri = rows.filter((r) => r.prioridade);
    const norm = rows.filter((r) => !r.prioridade);

    setPriorityRows(pri);
    setNormalRows(norm);
    setShowPriorityPopup(pri.length > 0);
    setLoading(false);

    // limpando seleção pois a lista mudou
    setSelectedIds(new Set());
  }

  React.useEffect(() => {
    load();
  }, []);

  function clearFilters() {
    setFilter({ q: "", startDate: null, endDate: null });
  }

  async function marcarCortada(id: string, from: "priority" | "normal") {
    const agora = new Date().toISOString();

    const { error } = await supabase
      .from("ordens_corte")
      .update({ status: "cortada", prioridade: false, cortada_em: agora })
      .eq("id", id);

    if (error) {
      return setMsg({ kind: "err", text: `Falha ao atualizar: ${error.message}` });
    }

    if (from === "priority") {
      setPriorityRows((prev) => prev.filter((r) => r.id !== id));
    } else {
      setNormalRows((prev) => prev.filter((r) => r.id !== id));
    }
    setMsg({ kind: "ok", text: "Papeleta marcada como CORTADA." });
  }

  // Seleção individual
  function toggleSelect(id: string, checked: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  // Selecionar todos os itens visíveis deste bloco (prioridade ou normal)
  function toggleAll(rows: CorteRow[], checked: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const r of rows) {
        if (checked) next.add(r.id);
        else next.delete(r.id);
      }
      return next;
    });
  }

  // Exclusão confirmada
  async function confirmDelete() {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) {
      setMsg({ kind: "err", text: "Nenhuma papeleta selecionada para excluir." });
      return;
    }

    const { error } = await supabase.from("ordens_corte").delete().in("id", ids);
    if (error) {
      setMsg({ kind: "err", text: `Erro ao excluir: ${error.message}` });
      return;
    }

    setPriorityRows((prev) => prev.filter((r) => !selectedIds.has(r.id)));
    setNormalRows((prev) => prev.filter((r) => !selectedIds.has(r.id)));

    setSelectedIds(new Set());
    setDeleteMode(false);

    setMsg({ kind: "ok", text: "Ordens excluídas com sucesso." });
  }

  function TableBlock({
    title,
    rows,
    onCut,
    deleteMode,
    selectedIds,
    onToggleSelect,
    onToggleAll,
  }: {
    title: string;
    rows: CorteRow[];
    onCut: (id: string) => void;
    deleteMode: boolean;
    selectedIds: Set<string>;
    onToggleSelect: (id: string, checked: boolean) => void;
    onToggleAll: (rows: CorteRow[], checked: boolean) => void;
  }) {
    const colsCount = deleteMode ? 10 : 9;
    const allChecked = rows.length > 0 && rows.every((r) => selectedIds.has(r.id));

    return (
      <div className="rounded-2xl bg-slate-900/50 ring-1 ring-white/10 p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold">{title}</h3>
          <button
            onClick={load}
            className="text-xs px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10"
          >
            {loading ? "Atualizando…" : "Atualizar"}
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-slate-400">
              <tr>
                {deleteMode && (
                  <th className="text-left font-medium py-2 w-10">
                    <input
                      type="checkbox"
                      checked={allChecked}
                      onChange={(e) => onToggleAll(rows, e.target.checked)}
                      title="Selecionar todos desta tabela"
                    />
                  </th>
                )}
                <th className="text-left font-medium py-2">Matrícula</th>
                <th className="text-left font-medium py-2">Bairro</th>
                <th className="text-left font-medium py-2">Rua e nº</th>
                <th className="text-left font-medium py-2">Ponto ref.</th>
                <th className="text-left font-medium py-2">Prioridade</th>
                <th className="text-center font-medium py-2">Status / Marcar</th>
                <th className="text-center font-medium py-2">Ordem (PDF)</th>
                <th className="text-center font-medium py-2">Criado em</th>
                <th className="text-center font-medium py-2">Cortada em</th>
              </tr>
            </thead>
            <tbody className="text-slate-200">
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-white/5">
                  {deleteMode && (
                    <td className="py-2">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(r.id)}
                        onChange={(e) => onToggleSelect(r.id, e.target.checked)}
                      />
                    </td>
                  )}
                  <td className="py-2">{r.matricula}</td>
                  <td className="py-2">{r.bairro}</td>
                  <td className="py-2">
                    {r.rua}, {r.numero}
                  </td>
                  <td className="py-2">{r.ponto_referencia || "-"}</td>
                  <td className="py-2">
                    {r.prioridade ? (
                      <span className="inline-flex items-center px-2 py-0.5 text-xs rounded-full bg-fuchsia-500/20 text-fuchsia-300 ring-1 ring-fuchsia-400/30">
                        PRIORIDADE
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 text-xs rounded-full bg-slate-500/20 text-slate-300 ring-1 ring-slate-400/30">
                        normal
                      </span>
                    )}
                  </td>
                  <td className="py-2 text-center">
                    <div className="inline-flex items-center gap-2">
                      <span className="inline-flex items-center px-2 py-0.5 text-xs rounded-full bg-amber-500/20 text-amber-300 ring-1 ring-amber-400/30">
                        pendente
                      </span>
                      <button
                        onClick={() => onCut(r.id)}
                        className="px-3 py-1.5 text-xs rounded-lg bg-rose-500/20 text-rose-200 ring-1 ring-rose-400/40 hover:bg-rose-500/30"
                      >
                        Cortar
                      </button>
                    </div>
                  </td>
                  <td className="py-2 text-center">
                    {r.pdf_ordem_path ? (
                      <a
                        href={
                          supabase.storage
                            .from("ordens-pdfs")
                            .getPublicUrl(r.pdf_ordem_path).data?.publicUrl || "#"
                        }
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3 py-1.5 text-xs rounded-lg bg-indigo-500/20 text-indigo-200 ring-1 ring-indigo-400/40 hover:bg-indigo-500/30"
                      >
                        Imprimir
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="py-2 text-center">
                    {new Date(r.created_at).toLocaleString("pt-BR")}
                  </td>
                  <td className="py-2 text-center">
                    {r.cortada_em ? new Date(r.cortada_em).toLocaleString("pt-BR") : "—"}
                  </td>
                </tr>
              ))}

              {rows.length === 0 && (
                <tr>
                  <td colSpan={colsCount} className="py-6 text-center text-slate-400">
                    Nenhuma papeleta nesta lista.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="rounded-2xl bg-slate-900/50 ring-1 ring-white/10 p-4 mb-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-lg font-semibold">Papeletas de corte pendentes</h2>
            <p className="text-slate-400 text-sm">Somente status “pendente”.</p>
          </div>
          <button
            onClick={load}
            className="text-xs px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10"
          >
            {loading ? "Atualizando…" : "Atualizar"}
          </button>
        </div>

        <ListFilterBar
          value={filter}
          onChange={setFilter}
          onSearch={load}
          onClear={() => {
            clearFilters();
            setTimeout(load, 0);
          }}
          deletable={true}
          deleteMode={deleteMode}
          onToggleDeleteMode={() => {
            setDeleteMode((m) => {
              const next = !m;
              if (!next) setSelectedIds(new Set()); // limpando seleção ao sair
              return next;
            });
          }}
          onConfirmDelete={confirmDelete}
          selectedCount={selectedIds.size}
        />
      </div>

      {showPriorityPopup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60" />
          <div className="relative z-10 w-full max-w-lg rounded-2xl bg-slate-900 ring-1 ring-white/10 p-6 text-center">
            <h3 className="text-xl font-semibold text-fuchsia-300">Prioridade do diretor</h3>
            <p className="mt-2 text-slate-300">
              Existem papeletas marcadas como{" "}
              <span className="text-fuchsia-300 font-medium">PRIORIDADE</span>.
            </p>
            <button
              onClick={() => setShowPriorityPopup(false)}
              className="mt-6 px-4 py-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10"
            >
              Ok, entendido
            </button>
          </div>
        </div>
      )}

      <div className="mb-4">
        <TableBlock
          title="Lista de prioridade liberada pelo diretor"
          rows={priorityRows}
          onCut={(id) => marcarCortada(id, "priority")}
          deleteMode={deleteMode}
          selectedIds={selectedIds}
          onToggleSelect={toggleSelect}
          onToggleAll={toggleAll}
        />
      </div>

      <TableBlock
        title="Pendentes (normais)"
        rows={normalRows}
        onCut={(id) => marcarCortada(id, "normal")}
        deleteMode={deleteMode}
        selectedIds={selectedIds}
        onToggleSelect={toggleSelect}
        onToggleAll={toggleAll}
      />

      {msg && (
        <div
          className={`mt-4 text-sm px-3 py-2 rounded-lg ${
            msg.kind === "ok" ? "bg-emerald-500/15 text-emerald-300" : "bg-rose-500/15 text-rose-300"
          }`}
        >
          {msg.text}
        </div>
      )}
    </>
  );
}
