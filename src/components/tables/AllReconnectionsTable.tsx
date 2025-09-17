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
  pdf_ordem_path: string | null;
  ativa_em: string | null;
  created_at: string;
  observacao?: string | null;
};

const norm = (s?: string | null) =>
  (s ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/_/g, " ").replace(/\s+/g, " ").trim();

function StatusBadge({ status }: { status: string }) {
  const s = norm(status);
  const IS_LIBERACAO_PENDENTE = s === "liberacao pendente";
  const IS_AGUARDANDO_RELIG = s === "aguardando religacao" || s.startsWith("aguardando");
  const IS_ATIVA = s === "ativa" || s === "ativo";

  let cls = "bg-slate-500/20 text-slate-300 ring-slate-400/30";
  let label = status;

  if (IS_LIBERACAO_PENDENTE) {
    cls = "bg-violet-500/20 text-violet-200 ring-violet-400/30";
    label = "Liberação Pendente";
  } else if (IS_AGUARDANDO_RELIG) {
    cls = "bg-amber-500/20 text-amber-300 ring-amber-400/30";
    label = "Aguardando Religação";
  } else if (IS_ATIVA) {
    cls = "bg-emerald-500/20 text-emerald-300 ring-emerald-400/30";
    label = "Ativa";
  }

  return (
    <span className={`inline-flex items-center px-2 py-0.5 text-xs rounded-full ring-1 ${cls} whitespace-nowrap`}>
      {label}
    </span>
  );
}

type StatusFilter = "all" | "liberacao_pendente" | "aguardando" | "ativa";

export default function AllReconnectionsTable() {
  const [rows, setRows] = React.useState<ReligRow[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [msg, setMsg] = React.useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const [filter, setFilter] = React.useState<ListFilter>({ q: "", startDate: null, endDate: null });
  const [statusFilter, setStatusFilter] = React.useState<StatusFilter>("all");
  const [over24h, setOver24h] = React.useState(false);

  const [deleteMode, setDeleteMode] = React.useState(false);
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());
  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString("pt-BR") : "—");

  async function load() {
    setLoading(true);

    let query = supabase
      .from("ordens_religacao")
      .select("id, matricula, bairro, rua, numero, ponto_referencia, prioridade, status, pdf_ordem_path, ativa_em, created_at, observacao");

    if (filter.q.trim() !== "") {
      const q = filter.q.trim();
      query = query.or(`matricula.ilike.%${q}%,bairro.ilike.%${q}%,rua.ilike.%${q}%`);
    }

    if (over24h) {
      const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      query = query.lte("created_at", cutoff);
    } else {
      if (filter.startDate) query = query.gte("ativa_em", `${filter.startDate}T00:00:00`);
      if (filter.endDate)   query = query.lte("ativa_em", `${filter.endDate}T23:59:59`);
    }

    query = query.order("created_at", { ascending: false });

    const { data, error } = await query;
    if (error) setMsg({ kind: "err", text: error.message });
    else setRows((data || []) as ReligRow[]);

    setLoading(false);
  }

  React.useEffect(() => { load(); /* eslint-disable-next-line */ }, []);
  React.useEffect(() => { load(); /* eslint-disable-next-line */ }, [over24h]);

  function clearFilters() {
    setFilter({ q: "", startDate: null, endDate: null });
  }

  async function handleBulkDelete() {
    if (selectedIds.size === 0) return setMsg({ kind: "err", text: "Nenhuma papeleta selecionada para excluir." });
    const ids = Array.from(selectedIds);
    const { error } = await supabase.from("ordens_religacao").delete().in("id", ids);
    if (error) return setMsg({ kind: "err", text: `Falha ao excluir: ${error.message}` });
    setRows((prev) => prev.filter((r) => !selectedIds.has(r.id)));
    setSelectedIds(new Set());
    setDeleteMode(false);
    setMsg({ kind: "ok", text: "Papeletas excluídas com sucesso." });
  }

  const filteredRows = React.useMemo(() => {
    if (statusFilter === "all") return rows;
    return rows.filter((r) => {
      const s = norm(r.status);
      if (statusFilter === "liberacao_pendente") return s === "liberacao pendente";
      if (statusFilter === "aguardando")         return s === "aguardando religacao" || s.startsWith("aguardando");
      if (statusFilter === "ativa")              return s === "ativa" || s === "ativo";
      return true;
    });
  }, [rows, statusFilter]);

  // ===== Bloqueio de impressão quando liberação pendente =====
  const [modalBloqueio, setModalBloqueio] = React.useState<{ open: boolean; matricula?: string }>({ open: false });

  // ===== Modal Observação =====
  const [modalObs, setModalObs] = React.useState<{ open: boolean; matricula?: string; obs?: string | null }>({ open: false });

  function extractNovoHidrometro(obs?: string | null): string | undefined {
    if (!obs) return undefined;
    const m = obs.match(/NOVO HIDR[ÔO]METRO:\s*([^\s|]+.*?)(?=$|\s*\|)/i);
    return m && m[1] ? m[1].trim() : undefined;
  }

  function renderImprimirCell(row: ReligRow) {
    const s = norm(row.status);
    const isPendente = s === "liberacao pendente";
    if (!row.pdf_ordem_path) return "—";

    if (isPendente) {
      return (
        <button
          type="button"
          onClick={() => setModalBloqueio({ open: true, matricula: row.matricula })}
          className="px-3 py-1.5 text-xs rounded-lg bg-indigo-500/20 text-indigo-200 ring-1 ring-indigo-400/40 hover:bg-indigo-500/30 whitespace-nowrap"
          title="Papeleta pendente de liberação"
        >
          Imprimir
        </button>
      );
    }

    const { data } = supabase.storage.from("ordens-pdfs").getPublicUrl(row.pdf_ordem_path);
    const url = data?.publicUrl;
    if (!url) return <span className="text-slate-400 text-xs">Sem link</span>;

    return (
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="px-3 py-1.5 text-xs rounded-lg bg-indigo-500/20 text-indigo-200 ring-1 ring-indigo-400/40 hover:bg-indigo-500/30 whitespace-nowrap"
        title="Imprimir PDF"
      >
        Imprimir
      </a>
    );
  }

  return (
    <div className="rounded-2xl bg-slate-900/50 ring-1 ring-white/10 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div>
          <h3 className="font-semibold">Todas as papeletas</h3>
          <p className="text-slate-400 text-sm">Lista completa das papeletas de religação.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 rounded-xl bg-white/5 ring-1 ring-white/10 p-1">
            <button onClick={() => setStatusFilter("all")}                className={`px-3 py-1.5 text-xs rounded-lg ${statusFilter === "all" ? "bg-white/10" : "hover:bg-white/5"}`}>Todos</button>
            <button onClick={() => setStatusFilter("liberacao_pendente")} className={`px-3 py-1.5 text-xs rounded-lg ${statusFilter === "liberacao_pendente" ? "bg-white/10" : "hover:bg-white/5"}`}>Liberação Pendente</button>
            <button onClick={() => setStatusFilter("aguardando")}         className={`px-3 py-1.5 text-xs rounded-lg ${statusFilter === "aguardando" ? "bg-white/10" : "hover:bg-white/5"}`}>Aguardando Religação</button>
            <button onClick={() => setStatusFilter("ativa")}              className={`px-3 py-1.5 text-xs rounded-lg ${statusFilter === "ativa" ? "bg-white/10" : "hover:bg-white/5"}`}>Ativa</button>
          </div>

          <button
            type="button"
            onClick={() => setOver24h((v) => !v)}
            className={`px-3 py-1.5 rounded-lg border text-xs ${
              over24h ? "bg-rose-600 text-white border-rose-500 hover:bg-rose-500"
                      : "bg-rose-600/90 text-white border-rose-500 hover:bg-rose-600"
            }`}
            title="+24h: mostrar apenas papeletas criadas há mais de 24 horas"
          >
            +24h
          </button>

          <button onClick={load} className="text-xs px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10">
            {loading ? "Atualizando…" : "Atualizar"}
          </button>
        </div>
      </div>

      <ListFilterBar
        value={filter}
        onChange={setFilter}
        onSearch={load}
        onClear={() => { clearFilters(); setTimeout(load, 0); }}
        deletable
        deleteMode={deleteMode}
        selectedCount={selectedIds.size}
        onToggleDeleteMode={() => { setDeleteMode((v) => !v); setSelectedIds(new Set()); }}
        onConfirmDelete={async () => {
          if (selectedIds.size === 0) return setMsg({ kind: "err", text: "Nenhuma papeleta selecionada para excluir." });
          const ids = Array.from(selectedIds);
          const { error } = await supabase.from("ordens_religacao").delete().in("id", ids);
          if (error) return setMsg({ kind: "err", text: `Falha ao excluir: ${error.message}` });
          setRows((prev) => prev.filter((r) => !selectedIds.has(r.id)));
          setSelectedIds(new Set());
          setDeleteMode(false);
          setMsg({ kind: "ok", text: "Papeletas excluídas com sucesso." });
        }}
      />

      {over24h && (
        <div className="mb-3 text-xs px-3 py-2 rounded-lg bg-rose-500/15 text-rose-300 border border-rose-400/30">
          Filtro <strong>+24h</strong> ativo: mostrando apenas papeletas criadas há mais de 24h.
        </div>
      )}

      {msg && (
        <div className={`mb-3 text-sm px-3 py-2 rounded-lg ${msg.kind === "ok" ? "bg-emerald-500/15 text-emerald-300" : "bg-rose-500/15 text-rose-300"}`}>
          {msg.text}
        </div>
      )}

      {/* === TABELA: mesma pegada das pendentes === */}
      <div className="rounded-xl overflow-x-auto ring-1 ring-white/10">
        <table className="w-full text-sm table-auto">
          <colgroup>
            {deleteMode && <col className="w-10" />}
            <col className="w-28" />        {/* matrícula */}
            <col className="w-40" />        {/* bairro */}
            <col className="w-[320px]" />   {/* rua e nº */}
            <col className="w-[300px]" />   {/* ponto ref */}
            <col className="w-28" />        {/* prioridade */}
            <col className="w-48" />        {/* status */}
            <col className="w-28" />        {/* pdf */}
            <col className="w-40" />        {/* criado em */}
            <col className="w-40" />        {/* ativa em */}
            <col className="w-48" />        {/* nº hidrômetro */}
            <col className="w-28" />        {/* observação (botão) */}
          </colgroup>

        <thead className="bg-white/5 text-slate-300">
          <tr>
            {deleteMode && <th className="py-2 px-3"></th>}
            <th className="text-left font-medium py-2 px-3">Matrícula</th>
            <th className="text-left font-medium py-2 px-3">Bairro</th>
            <th className="text-left font-medium py-2 px-3">Rua e nº</th>
            <th className="text-left font-medium py-2 px-3">Ponto ref.</th>
            <th className="text-left font-medium py-2 px-3">Prioridade</th>
            <th className="text-center font-medium py-2 px-3">Status</th>
            <th className="text-center font-medium py-2 px-3">Ordem (PDF)</th>
            <th className="text-center font-medium py-2 px-3">Criado em</th>
            <th className="text-center font-medium py-2 px-3">Ativa em</th>
            <th className="text-center font-medium py-2 px-3">Número do Hidrômetro</th>
            <th className="text-center font-medium py-2 px-3">Observação</th>
          </tr>
        </thead>

        <tbody className="divide-y divide-white/10">
          {filteredRows.map((r) => {
            const numeroHid = extractNovoHidrometro(r.observacao) ?? "-";
            return (
              <tr key={r.id} className="bg-slate-950/40 align-middle">
                {deleteMode && (
                  <td className="py-2 px-3 text-center">
                    <input type="checkbox" checked={selectedIds.has(r.id)} onChange={() => toggleSelect(r.id)} className="w-4 h-4" />
                  </td>
                )}

                <td className="py-2 px-3 font-mono whitespace-nowrap">{r.matricula}</td>

                <td className="py-2 px-3">
                  <div className="truncate max-w-[160px]" title={r.bairro}>{r.bairro}</div>
                </td>

                <td className="py-2 px-3">
                  <div className="truncate max-w-[280px]" title={`${r.rua}, ${r.numero}`}>{r.rua}, {r.numero}</div>
                </td>

                <td className="py-2 px-3">
                  <div className="truncate max-w-[260px]" title={r.ponto_referencia || "-"}>{r.ponto_referencia || "-"}</div>
                </td>

                <td className="py-2 px-3 whitespace-nowrap">
                  {r.prioridade ? (
                    <span className="inline-flex items-center px-2 py-0.5 text-xs rounded-full bg-fuchsia-500/20 text-fuchsia-300 ring-1 ring-fuchsia-400/30 whitespace-nowrap">
                      PRIORIDADE
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-2 py-0.5 text-xs rounded-full bg-slate-500/20 text-slate-300 ring-1 ring-slate-400/30 whitespace-nowrap">
                      Normal
                    </span>
                  )}
                </td>

                <td className="py-2 px-3 text-center whitespace-nowrap"><StatusBadge status={r.status} /></td>
                <td className="py-2 px-3 text-center">{renderImprimirCell(r)}</td>
                <td className="py-2 px-3 text-center whitespace-nowrap">{fmt(r.created_at)}</td>
                <td className="py-2 px-3 text-center whitespace-nowrap">{fmt(r.ativa_em)}</td>

                <td className="py-2 px-3 text-center whitespace-nowrap">{numeroHid}</td>

                <td className="py-2 px-3 text-center">
                  <button
                    type="button"
                    onClick={() => setModalObs({ open: true, matricula: r.matricula, obs: r.observacao ?? "-" })}
                    className="px-2 py-1 text-xs rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 whitespace-nowrap"
                    title="Ver observação"
                  >
                    Ver
                  </button>
                </td>
              </tr>
            );
          })}

          {filteredRows.length === 0 && (
            <tr>
              <td colSpan={deleteMode ? 12 : 11} className="py-6 text-center text-slate-400">
                Nenhuma papeleta encontrada.
              </td>
            </tr>
          )}
        </tbody>
        </table>
      </div>

      {/* Modais */}
      {modalBloqueio.open && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-slate-800 p-6 rounded-xl shadow-2xl w-full max-w-sm text-center">
            <h3 className="text-lg font-semibold text-white mb-3">Impressão bloqueada</h3>
            <p className="text-slate-300 text-sm">
              A papeleta da matrícula <span className="font-mono font-semibold">{modalBloqueio.matricula}</span> ainda
              <br />
              <strong>precisa ser liberada</strong> na tela <em>Liberação de Papeleta</em>.
            </p>
            <div className="mt-5">
              <button onClick={() => setModalBloqueio({ open: false })} className="px-4 py-2 rounded-lg bg-white/10 border border-white/20 hover:bg-white/20 text-white">
                Ok, entendi
              </button>
            </div>
          </div>
        </div>
      )}

      {modalObs.open && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-slate-800 p-6 rounded-xl shadow-2xl w-full max-w-sm">
            <h3 className="text-lg font-semibold text-white mb-3">Observação — Matrícula {modalObs.matricula}</h3>
            <div className="text-slate-300 text-sm whitespace-pre-wrap">{modalObs.obs && modalObs.obs.trim() !== "" ? modalObs.obs : "-"}</div>
            <div className="mt-5 text-center">
              <button onClick={() => setModalObs({ open: false })} className="px-4 py-2 rounded-lg bg-white/10 border border-white/20 hover:bg-white/20 text-white">
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
