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
  pdf_path: string | null;           // novo
  pdf_ordem_path?: string | null;    // compat
  created_at: string;
  cortada_em: string | null;
  corte_na_rua: boolean | null;
};

const norm = (s?: string | null) =>
  (s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim();

function StatusBadge({ status }: { status: string }) {
  const s = norm(status);
  const CORTE_PEND = new Set(["aguardando corte", "pendente", "aguardando", "aguardando corte "]);
  const CORTE_DONE = new Set(["cortada", "cortado", "feito"]);

  let cls = "bg-slate-500/20 text-slate-300 ring-slate-400/30";
  let label = status;

  if (CORTE_PEND.has(s)) {
    cls = "bg-amber-500/20 text-amber-300 ring-amber-400/30";
    label = "Aguardando Corte";
  } else if (CORTE_DONE.has(s)) {
    cls = "bg-rose-600/20 text-rose-300 ring-rose-400/30";
    label = "Cortada";
  }

  return (
    <span className={`inline-flex items-center px-2 py-0.5 text-xs rounded-full ring-1 ${cls} whitespace-nowrap`}>
      {label}
    </span>
  );
}

type StatusFilter = "all" | "aguardando" | "cortada";

// Perfis que podem excluir
const ALLOWED_DELETE = new Set(["ADM", "DIRETOR", "COORDENADOR"]);

export default function AllOrdersTable() {
  const [rows, setRows] = React.useState<CutRow[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [msg, setMsg] = React.useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const [filter, setFilter] = React.useState<ListFilter>({ q: "", startDate: null, endDate: null });
  const [statusFilter, setStatusFilter] = React.useState<StatusFilter>("all");

  // Papel do usuário e permissão
  const [userRole, setUserRole] = React.useState<string>("VISITANTE");
  const canDelete = React.useMemo(
    () => ALLOWED_DELETE.has((userRole || "VISITANTE").toUpperCase()),
    [userRole]
  );

  const [permModalOpen, setPermModalOpen] = React.useState(false);
  const [permText, setPermText] = React.useState("Apenas ADM, DIRETOR e COORDENADOR podem excluir ordens.");

  React.useEffect(() => {
    (async () => {
      try {
        const { data: udata, error: uerr } = await supabase.auth.getUser();
        if (uerr) throw uerr;
        const user = (udata && "user" in udata ? (udata as any).user : undefined) as
          | { id: string }
          | undefined;
        if (!user) {
          setUserRole("VISITANTE");
          return;
        }
        const { data, error } = await supabase
          .from("app_users")
          .select("papel")
          .eq("id", user.id)
          .single();
        if (error) throw error;
        setUserRole((data?.papel || "VISITANTE").toUpperCase());
      } catch {
        setUserRole("VISITANTE");
      }
    })();
  }, []);

  const [deleteMode, setDeleteMode] = React.useState(false);
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());
  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function load() {
    setLoading(true);
    let query = supabase
      .from("ordens_corte")
      .select(
        "id, os, matricula, bairro, rua, numero, ponto_referencia, status, pdf_path, pdf_ordem_path, created_at, cortada_em, corte_na_rua"
      );

    if (filter.startDate) query = query.gte("created_at", `${filter.startDate}T00:00:00`);
    if (filter.endDate) query = query.lte("created_at", `${filter.endDate}T23:59:59`);

    if ((filter.q || "").trim() !== "") {
      const q = filter.q!.trim();
      query = query.or(`matricula.ilike.%${q}%,bairro.ilike.%${q}%,rua.ilike.%${q}%,os.ilike.%${q}%`);
    }

    query = query.order("created_at", { ascending: false });

    const { data, error } = await query;
    if (error) {
      setMsg({ kind: "err", text: error.message });
      setTimeout(() => setMsg(null), 2200);
    } else {
      setRows(((data || []) as unknown) as CutRow[]);
    }

    setLoading(false);
  }

  React.useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function clearFilters() {
    setFilter({ q: "", startDate: null, endDate: null });
  }

  // Guarda ao entrar/sair do modo excluir
  function guardedToggleDeleteMode() {
    if (!canDelete) {
      setPermText("Apenas ADM, DIRETOR e COORDENADOR podem excluir ordens.");
      setPermModalOpen(true);
      return;
    }
    setDeleteMode((v) => !v);
    setSelectedIds(new Set());
  }

  async function handleBulkDelete() {
    if (!canDelete) {
      setPermText("Apenas ADM, DIRETOR e COORDENADOR podem excluir ordens.");
      setPermModalOpen(true);
      return;
    }
    if (selectedIds.size === 0) {
      setMsg({ kind: "err", text: "Nenhuma OS selecionada para excluir." });
      setTimeout(() => setMsg(null), 2200);
      return;
    }

    const ids = Array.from(selectedIds);
    const { error } = await supabase.from("ordens_corte").delete().in("id", ids);
    if (error) {
      if (/Impedido|insufficient_privilege|permission|RLS|row-level|policy|denied/i.test(error.message)) {
        setPermText("A operação foi bloqueada pelas regras de segurança.");
        setPermModalOpen(true);
        return;
      }
      setMsg({ kind: "err", text: `Falha ao excluir: ${error.message}` });
      setTimeout(() => setMsg(null), 2200);
      return;
    }
    setRows((prev) => prev.filter((r) => !selectedIds.has(r.id)));
    setSelectedIds(new Set());
    setDeleteMode(false);
    setMsg({ kind: "ok", text: "OS excluídas com sucesso." });
    setTimeout(() => setMsg(null), 1800);
  }

  const filteredRows = React.useMemo(() => {
    if (statusFilter === "all") return rows;
    return rows.filter((r) => {
      const s = norm(r.status);
      if (statusFilter === "aguardando")
        return s === "aguardando corte" || s === "pendente" || s === "aguardando";
      if (statusFilter === "cortada") return s === "cortada" || s === "cortado" || s === "feito";
      return true;
    });
  }, [rows, statusFilter]);

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
        className="px-3 py-1.5 text-xs rounded-lg bg-indigo-500/20 text-indigo-200 ring-1 ring-indigo-400/40 hover:bg-indigo-500/30 whitespace-nowrap"
      >
        Imprimir
      </a>
    );
  }

  function renderCorteNaRua(val: boolean | null) {
    if (val === true)
      return (
        <span className="inline-flex items-center px-2 py-0.5 text-xs rounded-full ring-1 bg-emerald-600/20 text-emerald-200 ring-emerald-400/40 whitespace-nowrap">
          SIM
        </span>
      );
    if (val === false)
      return (
        <span className="inline-flex items-center px-2 py-0.5 text-xs rounded-full ring-1 bg-rose-600/20 text-rose-200 ring-rose-400/40 whitespace-nowrap">
          NÃO
        </span>
      );
    return "—";
  }

  const fmt = (iso?: string | null) => (iso ? new Date(iso).toLocaleString("pt-BR") : "—");

  // Larguras das colunas — mantidas; adiciona w-10 quando deleteMode
  const colWidths = React.useMemo(() => {
    const arr: string[] = [];
    if (deleteMode) arr.push("w-10");
    arr.push(
      "w-32",     // matrícula (ajuste para casar com layout base)
      "w-24",     // OS
      "w-40",     // bairro
      "w-[320px]",// rua e nº
      "w-[300px]",// ponto ref
      "w-40",     // status
      "w-28",     // pdf
      "w-40",     // criado em
      "w-40",     // cortada em
      "w-36"      // corte na rua
    );
    return arr;
  }, [deleteMode]);

  const colEls = React.useMemo(
    () => colWidths.map((cls, i) => <col key={i} className={cls} />),
    [colWidths]
  );

  // classes sticky iguais às do layout base
  const thMatriculaSticky =
    `py-2 px-3 font-medium text-center sticky z-30 bg-slate-900/95 backdrop-blur border-r border-white/10 ` +
    (deleteMode ? "left-10" : "left-0");

  const tdMatriculaSticky =
    `py-2 px-3 font-mono whitespace-nowrap text-center sticky z-10 bg-slate-950/80 backdrop-blur border-r border-white/10 ` +
    (deleteMode ? "left-10" : "left-0");

  return (
    <div className="rounded-2xl bg-slate-900/50 ring-1 ring-white/10 p-4">
      <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
        <div>
          <h3 className="font-semibold">Todas as ordens</h3>
          <p className="text-slate-400 text-sm">Lista completa das ordens de corte.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 rounded-xl bg-white/5 ring-1 ring-white/10 p-1">
            <button
              onClick={() => setStatusFilter("all")}
              className={`px-3 py-1.5 text-xs rounded-lg ${statusFilter === "all" ? "bg-white/10" : "hover:bg-white/5"}`}
            >
              Todos
            </button>
            <button
              onClick={() => setStatusFilter("aguardando")}
              className={`px-3 py-1.5 text-xs rounded-lg ${statusFilter === "aguardando" ? "bg-white/10" : "hover:bg-white/5"}`}
            >
              Aguardando Corte
            </button>
            <button
              onClick={() => setStatusFilter("cortada")}
              className={`px-3 py-1.5 text-xs rounded-lg ${statusFilter === "cortada" ? "bg-white/10" : "hover:bg-white/5"}`}
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
        deletable={canDelete}
        deleteMode={deleteMode}
        selectedCount={selectedIds.size}
        onToggleDeleteMode={guardedToggleDeleteMode}
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

      {/* >>> Layout idêntico ao AllReconnectionsTable (apenas aparência) */}
      <div className="rounded-xl ring-1 ring-white/10 max-h-[60vh] overflow-x-auto overflow-y-auto">
        <table className="min-w-[1280px] w-max text-sm table-auto">
          <colgroup>{colEls}</colgroup>

          <thead className="sticky top-0 z-20 bg-slate-900/95 text-slate-100 backdrop-blur supports-backdrop-blur:bg-slate-900/80 border-white/10">
            <tr>
              {deleteMode && (
                <th
                  className="py-2 px-3 sticky left-0 z-40 bg-slate-900/95 backdrop-blur border-r border-white/10"
                  aria-label="Selecionar"
                />
              )}
              <th className={thMatriculaSticky}>Matrícula</th>
              <th className="text-left font-medium py-2 px-3">OS</th>
              <th className="text-left font-medium py-2 px-3">Bairro</th>
              <th className="text-left font-medium py-2 px-3">Rua e nº</th>
              <th className="text-left font-medium py-2 px-3">Ponto ref.</th>
              <th className="text-center font-medium py-2 px-3">Status</th>
              <th className="text-center font-medium py-2 px-3">OS (PDF)</th>
              <th className="text-center font-medium py-2 px-3">Criado em</th>
              <th className="text-center font-medium py-2 px-3">Cortada em</th>
              <th className="text-center font-medium py-2 px-3">Corte na rua?</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-white/10">
            {filteredRows.map((r) => {
              const pdfPath = r.pdf_path ?? r.pdf_ordem_path ?? null;
              return (
                <tr key={r.id} className="bg-slate-950/40 align-middle">
                  {deleteMode && (
                    <td className="py-2 px-3 text-center sticky left-0 z-20 bg-slate-950/90 backdrop-blur border-r border-white/10">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(r.id)}
                        onChange={() => toggleSelect(r.id)}
                        className="w-4 h-4"
                      />
                    </td>
                  )}

                  {/* Matrícula sticky */}
                  <td className={tdMatriculaSticky}>{r.matricula}</td>
                  <td className="py-2 px-3 whitespace-nowrap">{r.os || "-"}</td>

                  <td className="py-2 px-3">
                    <div className="truncate max-w-[160px]" title={r.bairro}>
                      {r.bairro}
                    </div>
                  </td>

                  <td className="py-2 px-3">
                    <div className="truncate max-w-[280px]" title={`${r.rua}, ${r.numero}`}>
                      {r.rua}, {r.numero}
                    </div>
                  </td>

                  <td className="py-2 px-3">
                    <div className="truncate max-w-[260px]" title={r.ponto_referencia || "-"}>
                      {r.ponto_referencia || "-"}
                    </div>
                  </td>

                  <td className="py-2 px-3 text-center whitespace-nowrap">
                    <StatusBadge status={r.status} />
                  </td>
                  <td className="py-2 px-3 text-center">{renderPdfLink(pdfPath)}</td>
                  <td className="py-2 px-3 text-center whitespace-nowrap">{fmt(r.created_at)}</td>
                  <td className="py-2 px-3 text-center whitespace-nowrap">{fmt(r.cortada_em)}</td>
                  <td className="py-2 px-3 text-center">{renderCorteNaRua(r.corte_na_rua)}</td>
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

      {/* Permissão negada */}
      {permModalOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-slate-800 p-6 rounded-2xl w-full max-w-lg text-center">
            <h3 className="text-lg font-semibold text-white">Permissão necessária</h3>
            <p className="text-slate-300 text-sm mt-2">{permText}</p>
            <div className="mt-5">
              <button
                onClick={() => setPermModalOpen(false)}
                className="px-4 py-2 rounded-lg bg-white/10 border border-white/20 hover:bg-white/20 text-white text-sm"
              >
                Entendi
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
