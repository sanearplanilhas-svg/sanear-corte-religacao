import * as React from "react";
import supabase from "../../lib/supabase";
import ListFilterBar, { ListFilter } from "../../components/filters/ListFilterBar";

type ReligRow = {
  id: string;
  matricula: string;
  bairro: string;
  rua: string;
  numero: string;
  ponto_referencia: string | null;
  prioridade: boolean;
  status: string;
  status_id: number;
  pdf_ordem_path: string | null;
  created_at: string;
  ativa_em?: string | null;
};

export default function PendingReconnectionsTable() {
  const [priorityRows, setPriorityRows] = React.useState<ReligRow[]>([]);
  const [normalRows, setNormalRows] = React.useState<ReligRow[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [msg, setMsg] = React.useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const [filter, setFilter] = React.useState<ListFilter>({
    q: "",
    startDate: null,
    endDate: null,
  });

  // Exclusão em lote
  const [deleteMode, setDeleteMode] = React.useState(false);
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());

  function buildQuery() {
    let query = supabase
      .from("ordens_religacao")
      .select(
        "id, matricula, bairro, rua, numero, ponto_referencia, prioridade, status, status_id, pdf_ordem_path, created_at, ativa_em"
      )
      .eq("status_id", 3); // aguardando religação

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

    const rows = (data || []) as ReligRow[];
    const pri = rows.filter((r) => r.prioridade);
    const norm = rows.filter((r) => !r.prioridade);

    setPriorityRows(pri);
    setNormalRows(norm);
    setLoading(false);

    setSelectedIds(new Set());
  }

  React.useEffect(() => {
    load();
  }, []);

  function clearFilters() {
    setFilter({ q: "", startDate: null, endDate: null });
  }

  async function marcarAtiva(id: string, from: "priority" | "normal") {
    const agora = new Date().toISOString();

    const { error } = await supabase
      .from("ordens_religacao")
      .update({
        status: "ativa",
        status_id: 4,
        prioridade: false,
        ativa_em: agora,
      })
      .eq("id", id);

    if (error) {
      return setMsg({ kind: "err", text: `Falha ao atualizar: ${error.message}` });
    }

    if (from === "priority") {
      setPriorityRows((prev) => prev.filter((r) => r.id !== id));
    } else {
      setNormalRows((prev) => prev.filter((r) => r.id !== id));
    }
    setMsg({ kind: "ok", text: "Papeleta marcada como ATIVA." });
  }

  // Seleção individual e em grupo
  function toggleSelect(id: string, checked: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function toggleAll(rows: ReligRow[], checked: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const r of rows) {
        if (checked) next.add(r.id);
        else next.delete(r.id);
      }
      return next;
    });
  }

  async function confirmDelete() {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) {
      setMsg({ kind: "err", text: "Nenhuma papeleta selecionada para excluir." });
      return;
    }
    const { error } = await supabase.from("ordens_religacao").delete().in("id", ids);
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
    onActivate,
  }: {
    title: string;
    rows: ReligRow[];
    onActivate: (id: string) => void;
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
                      onChange={(e) => toggleAll(rows, e.target.checked)}
                      title="Selecionar todos desta tabela"
                    />
                  </th>
                )}
                <th className="text-left font-medium py-2">Matrícula</th>
                <th className="text-left font-medium py-2">Bairro</th>
                <th className="text-left font-medium py-2">Rua e Nº</th>
                <th className="text-left font-medium py-2">Ponto Ref.</th>
                <th className="text-left font-medium py-2">Prioridade</th>
                <th className="text-center font-medium py-2">Status / Marcar</th>
                <th className="text-center font-medium py-2">Ordem (PDF)</th>
                <th className="text-center font-medium py-2">Criado em</th>
                <th className="text-center font-medium py-2">Ativa em</th>
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
                        onChange={(e) => toggleSelect(r.id, e.target.checked)}
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
                        Aguardando Religação
                      </span>
                      <button
                        onClick={() => onActivate(r.id)}
                        className="px-3 py-1.5 text-xs rounded-lg bg-emerald-500/20 text-emerald-200 ring-1 ring-emerald-400/40 hover:bg-emerald-500/30"
                      >
                        Ativa
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
                    {r.ativa_em ? new Date(r.ativa_em).toLocaleString("pt-BR") : "—"}
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
            <h2 className="text-lg font-semibold">Papeletas de Religação Pendentes</h2>
            <p className="text-slate-400 text-sm">Somente status “aguardando religação”.</p>
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
              if (!next) setSelectedIds(new Set());
              return next;
            });
          }}
          onConfirmDelete={confirmDelete}
          selectedCount={selectedIds.size}
        />
      </div>

      <div className="mb-4">
        <TableBlock
          title="Lista de prioridade liberada pelo diretor"
          rows={priorityRows}
          onActivate={(id) => marcarAtiva(id, "priority")}
        />
      </div>

      <TableBlock
        title="Pendentes (normais)"
        rows={normalRows}
        onActivate={(id) => marcarAtiva(id, "normal")}
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
