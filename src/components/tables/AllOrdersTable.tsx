import * as React from "react";
import supabase from "../../lib/supabase";
import ListFilterBar, { ListFilter } from "../../components/filters/ListFilterBar";

type CutRow = {
  id: string;
  os: string | null;
  matricula: string;
  bairro: string;
  rua: string;
  numero: string;
  ponto_referencia: string | null;
  status: string;
  // compat: algumas linhas podem ter pdf_path (novo) ou pdf_ordem_path (antigo)
  pdf_path: string | null;
  pdf_ordem_path?: string | null;
  created_at: string;
  cortada_em: string | null;
  corte_na_rua: boolean | null; // 🟢 NOVO
};

// normaliza string p/ comparação robusta
const norm = (s?: string | null) =>
  (s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim();

// chip de status padronizado
function StatusBadge({ status }: { status: string }) {
  const s = norm(status);
  const CORTE_PEND = new Set(["aguardando corte", "pendente", "aguardando", "aguardando corte "]);
  const CORTE_DONE = new Set(["cortada", "cortado", "feito"]);

  let cls = "bg-slate-500/20 text-slate-300 ring-slate-400/30";
  let label = status;

  if (CORTE_PEND.has(s)) {
    cls = "bg-amber-500/20 text-amber-300 ring-amber-400/30";
    label = "Aguardando Corte"; // 🟢 capitalizado
  } else if (CORTE_DONE.has(s)) {
    cls = "bg-rose-600/20 text-rose-300 ring-rose-400/30";
    label = "Cortada";
  }

  return (
    <span className={`inline-flex items-center px-2 py-0.5 text-xs rounded-full ring-1 ${cls}`}>
      {label}
    </span>
  );
}

type StatusFilter = "all" | "aguardando" | "cortada";

export default function AllOrdersTable() {
  const [rows, setRows] = React.useState<CutRow[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [msg, setMsg] = React.useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const [filter, setFilter] = React.useState<ListFilter>({
    q: "",
    startDate: null,
    endDate: null,
  });

  // filtro por status
  const [statusFilter, setStatusFilter] = React.useState<StatusFilter>("all");

  const [deleteMode, setDeleteMode] = React.useState(false);
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());
  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function load() {
    setLoading(true);

    let query = supabase
      .from("ordens_corte")
      .select(
        // 🟢 inclui corte_na_rua e os dois nomes de coluna de PDF
        "id, os, matricula, bairro, rua, numero, ponto_referencia, status, pdf_path, pdf_ordem_path, created_at, cortada_em, corte_na_rua"
      );

    if (filter.startDate) query = query.gte("created_at", `${filter.startDate}T00:00:00`);
    if (filter.endDate) query = query.lte("created_at", `${filter.endDate}T23:59:59`);

    if (filter.q.trim() !== "") {
      const q = filter.q.trim();
      query = query.or(
        `matricula.ilike.%${q}%,bairro.ilike.%${q}%,rua.ilike.%${q}%,os.ilike.%${q}%`
      );
    }

    query = query.order("created_at", { ascending: false });

    const { data, error } = await query;
    if (error) setMsg({ kind: "err", text: error.message });
    else setRows(((data || []) as unknown) as CutRow[]);

    setLoading(false);
  }

  React.useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function clearFilters() {
    setFilter({ q: "", startDate: null, endDate: null });
  }

  async function handleBulkDelete() {
    if (selectedIds.size === 0) {
      setMsg({ kind: "err", text: "Nenhuma OS selecionada para excluir." });
      return;
    }
    const ids = Array.from(selectedIds);
    const { error } = await supabase.from("ordens_corte").delete().in("id", ids);
    if (error) {
      setMsg({ kind: "err", text: `Falha ao excluir: ${error.message}` });
      return;
    }
    setRows((prev) => prev.filter((r) => !selectedIds.has(r.id)));
    setSelectedIds(new Set());
    setDeleteMode(false);
    setMsg({ kind: "ok", text: "OS excluídas com sucesso." });
  }

  // filtro de status em memória
  const filteredRows = React.useMemo(() => {
    if (statusFilter === "all") return rows;

    return rows.filter((r) => {
      const s = norm(r.status);
      if (statusFilter === "aguardando") {
        return s === "aguardando corte" || s === "pendente" || s === "aguardando";
      }
      if (statusFilter === "cortada") {
        return s === "cortada" || s === "cortado" || s === "feito";
      }
      return true;
    });
  }, [rows, statusFilter]);

  // link do PDF (compat com os dois nomes de coluna)
  function renderPdfLink(path?: string | null) {
    if (!path) return "—";
    const { data } = supabase.storage.from("ordens-pdfs").getPublicUrl(path);
    const url = data?.publicUrl;
    if (!url) return "—";
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="px-3 py-1.5 text-xs rounded-lg bg-indigo-500/20 text-indigo-200 ring-1 ring-indigo-400/40 hover:bg-indigo-500/30"
      >
        Imprimir
      </a>
    );
  }

  function renderCorteNaRua(val: boolean | null) {
    if (val === true) {
      return (
        <span className="inline-flex items-center px-2 py-0.5 text-xs rounded-full ring-1 bg-emerald-600/20 text-emerald-200 ring-emerald-400/40">
          SIM
        </span>
      );
    }
    if (val === false) {
      return (
        <span className="inline-flex items-center px-2 py-0.5 text-xs rounded-full ring-1 bg-rose-600/20 text-rose-200 ring-rose-400/40">
          NÃO
        </span>
      );
    }
    return "—";
  }

  return (
    <div className="rounded-2xl bg-slate-900/50 ring-1 ring-white/10 p-4">
      <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
        <div>
          <h3 className="font-semibold">Todas as ordens</h3>
          <p className="text-slate-400 text-sm">Lista completa das ordens de corte.</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Filtro de status */}
          <div className="flex items-center gap-1 rounded-xl bg-white/5 ring-1 ring-white/10 p-1">
            <button
              onClick={() => setStatusFilter("all")}
              className={`px-3 py-1.5 text-xs rounded-lg ${
                statusFilter === "all" ? "bg-white/10" : "hover:bg-white/5"
              }`}
              title="Mostrar todos"
            >
              Todos
            </button>
            <button
              onClick={() => setStatusFilter("aguardando")}
              className={`px-3 py-1.5 text-xs rounded-lg ${
                statusFilter === "aguardando" ? "bg-white/10" : "hover:bg-white/5"
              }`}
              title="Somente Aguardando Corte"
            >
              Aguardando Corte
            </button>
            <button
              onClick={() => setStatusFilter("cortada")}
              className={`px-3 py-1.5 text-xs rounded-lg ${
                statusFilter === "cortada" ? "bg-white/10" : "hover:bg-white/5"
              }`}
              title="Somente Cortada"
            >
              Cortada
            </button>
          </div>

          <button
            onClick={load}
            className="text-xs px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10"
          >
            {loading ? "Atualizando…" : "Atualizar"}
          </button>
        </div>
      </div>

      <ListFilterBar
        value={filter}
        onChange={setFilter}
        onSearch={load}
        onClear={() => {
          clearFilters();
          setTimeout(load, 0);
        }}
        deletable
        deleteMode={deleteMode}
        selectedCount={selectedIds.size}
        onToggleDeleteMode={() => {
          setDeleteMode((v) => !v);
          setSelectedIds(new Set());
        }}
        onConfirmDelete={handleBulkDelete}
      />

      {msg && (
        <div
          className={`mb-3 text-sm px-3 py-2 rounded-lg ${
            msg.kind === "ok" ? "bg-emerald-500/15 text-emerald-300" : "bg-rose-500/15 text-rose-300"
          }`}
        >
          {msg.text}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-slate-400">
            <tr>
              {deleteMode && <th className="w-10 py-2"></th>}
              <th className="text-left font-medium py-2">Matrícula</th>
              <th className="text-left font-medium py-2">OS</th>
              <th className="text-left font-medium py-2">Bairro</th>
              <th className="text-left font-medium py-2">Rua e nº</th>
              <th className="text-left font-medium py-2">Ponto ref.</th>
              <th className="text-center font-medium py-2">Status</th>
              <th className="text-center font-medium py-2">OS (PDF)</th>
              <th className="text-center font-medium py-2">Criado em</th>
              <th className="text-center font-medium py-2">Cortada em</th>
              <th className="text-center font-medium py-2">Corte na rua?</th> {/* 🟢 NOVA ÚLTIMA COLUNA */}
            </tr>
          </thead>
          <tbody className="text-slate-200">
            {filteredRows.map((r) => {
              const pdfPath = r.pdf_path ?? r.pdf_ordem_path ?? null;
              return (
                <tr key={r.id} className="border-t border-white/5">
                  {deleteMode && (
                    <td className="py-2 text-center">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(r.id)}
                        onChange={() => toggleSelect(r.id)}
                        className="w-4 h-4"
                      />
                    </td>
                  )}
                  <td className="py-2">{r.matricula}</td>
                  <td className="py-2">{r.os || "-"}</td>
                  <td className="py-2">{r.bairro}</td>
                  <td className="py-2">
                    {r.rua}, {r.numero}
                  </td>
                  <td className="py-2">{r.ponto_referencia || "-"}</td>
                  <td className="py-2 text-center">
                    <StatusBadge status={r.status} />
                  </td>
                  <td className="py-2 text-center">{renderPdfLink(pdfPath)}</td>
                  <td className="py-2 text-center">
                    {new Date(r.created_at).toLocaleString("pt-BR")}
                  </td>
                  <td className="py-2 text-center">
                    {r.cortada_em ? new Date(r.cortada_em).toLocaleString("pt-BR") : "—"}
                  </td>
                  <td className="py-2 text-center">{renderCorteNaRua(r.corte_na_rua)}</td> {/* 🟢 NOVO */}
                </tr>
              );
            })}

            {filteredRows.length === 0 && (
              <tr>
                <td colSpan={deleteMode ? 11 : 10} className="py-6 text-center text-slate-400">
                  Nenhuma ordem encontrada.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
