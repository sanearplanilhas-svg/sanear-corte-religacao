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
  created_at: string; // usado em "Criado em"
};

export default function AllReconnectionsTable() {
  const [rows, setRows] = React.useState<ReligRow[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [msg, setMsg] = React.useState<{ kind: "ok" | "err"; text: string } | null>(null);

  // filtros da barra (datas são ignoradas quando over24h = true)
  const [filter, setFilter] = React.useState<ListFilter>({
    q: "",
    startDate: null,
    endDate: null,
  });

  // ▶️ Toggle do modo +24h: apenas papeletas com mais de 24h de criadas
  const [over24h, setOver24h] = React.useState(false);

  const [deleteMode, setDeleteMode] = React.useState(false);
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());
  function toggleSelect(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const fmtDateTime = (iso: string | null) =>
    iso ? new Date(iso).toLocaleString("pt-BR") : "—";

  async function load() {
    setLoading(true);

    let query = supabase
      .from("ordens_religacao")
      .select(
        "id, matricula, bairro, rua, numero, ponto_referencia, prioridade, status, pdf_ordem_path, ativa_em, created_at"
      );

    // 🔎 Pesquisa livre
    if (filter.q.trim() !== "") {
      const q = filter.q.trim();
      query = query.or(`matricula.ilike.%${q}%,bairro.ilike.%${q}%,rua.ilike.%${q}%`);
    }

    if (over24h) {
      // ✅ +24h ligado: mostra apenas criadas há mais de 24h (pelo relógio do PC)
      const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      query = query.lte("created_at", cutoff);
    } else {
      // 🔁 Modo normal: (a pedido) mostrar TUDO; se quiser usar os campos De/Até, descomente:
      if (filter.startDate) query = query.gte("ativa_em", `${filter.startDate}T00:00:00`);
      if (filter.endDate)   query = query.lte("ativa_em", `${filter.endDate}T23:59:59`);
    }

    // Ordena por criação (mais recentes primeiro)
    query = query.order("created_at", { ascending: false });

    const { data, error } = await query;
    if (error) setMsg({ kind: "err", text: error.message });
    else setRows((data || []) as ReligRow[]);

    setLoading(false);
  }

  // 🔁 carrega inicialmente
  React.useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 🔁 recarrega quando o modo +24h muda (evita usar valor antigo por fechamento)
  React.useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [over24h]);

  function clearFilters() {
    setFilter({ q: "", startDate: null, endDate: null });
  }

  async function handleBulkDelete() {
    if (selectedIds.size === 0) {
      setMsg({ kind: "err", text: "Nenhuma papeleta selecionada para excluir." });
      return;
    }
    const ids = Array.from(selectedIds);
    const { error } = await supabase.from("ordens_religacao").delete().in("id", ids);
    if (error) {
      setMsg({ kind: "err", text: `Falha ao excluir: ${error.message}` });
      return;
    }
    setRows(prev => prev.filter(r => !selectedIds.has(r.id)));
    setSelectedIds(new Set());
    setDeleteMode(false);
    setMsg({ kind: "ok", text: "Papeletas excluídas com sucesso." });
  }

  return (
    <div className="rounded-2xl bg-slate-900/50 ring-1 ring-white/10 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div>
          <h3 className="font-semibold">Todas as papeletas</h3>
          <p className="text-slate-400 text-sm">Lista completa das papeletas de religação.</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Botão +24h (toggle) */}
          <button
            type="button"
            onClick={() => setOver24h(v => !v)}
            className={`px-3 py-1.5 rounded-lg border text-xs ${
              over24h
                ? "bg-rose-600 text-white border-rose-500 hover:bg-rose-500"
                : "bg-rose-600/90 text-white border-rose-500 hover:bg-rose-600"
            }`}
            title="+24h: mostrar apenas papeletas criadas há mais de 24 horas"
          >
            +24h
          </button>

          <button
            onClick={load}
            className="text-xs px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10"
          >
            {loading ? "Atualizando…" : "Atualizar"}
          </button>
        </div>
      </div>

      {/* Barra de filtros (datas são ignoradas quando +24h está ativo) */}
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
        onToggleDeleteMode={() => { setDeleteMode(v => !v); setSelectedIds(new Set()); }}
        onConfirmDelete={handleBulkDelete}
      />

      {/* Banner do modo +24h */}
      {over24h && (
        <div className="mb-3 text-xs px-3 py-2 rounded-lg bg-rose-500/15 text-rose-300 border border-rose-400/30">
          Filtro <strong>+24h</strong> ativo: mostrando apenas papeletas criadas há mais de 24h (baseado no horário do seu dispositivo).
        </div>
      )}

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
              <th className="text-left font-medium py-2">Bairro</th>
              <th className="text-left font-medium py-2">Rua e nº</th>
              <th className="text-left font-medium py-2">Ponto ref.</th>
              <th className="text-left font-medium py-2">Prioridade</th>
              <th className="text-center font-medium py-2">Status</th>
              <th className="text-center font-medium py-2">Ordem (PDF)</th>
              <th className="text-center font-medium py-2">Criado em</th>
              <th className="text-center font-medium py-2">Ativa em</th>
            </tr>
          </thead>
          <tbody className="text-slate-200">
            {rows.map((r) => (
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
                <td className="py-2">{r.bairro}</td>
                <td className="py-2">{r.rua}, {r.numero}</td>
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
                  <span className="inline-flex items-center px-2 py-0.5 text-xs rounded-full bg-white/5 ring-1 ring-white/10">
                    {r.status}
                  </span>
                </td>
                <td className="py-2 text-center">
                  {r.pdf_ordem_path ? (
                    <a
                      href={supabase.storage.from("ordens-pdfs").getPublicUrl(r.pdf_ordem_path).data.publicUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="px-3 py-1.5 text-xs rounded-lg bg-indigo-500/20 text-indigo-200 ring-1 ring-indigo-400/40 hover:bg-indigo-500/30"
                    >
                      Imprimir
                    </a>
                  ) : "—"}
                </td>
                <td className="py-2 text-center">{fmtDateTime(r.created_at)}</td>
                <td className="py-2 text-center">{fmtDateTime(r.ativa_em)}</td>
              </tr>
            ))}

            {rows.length === 0 && (
              <tr>
                <td colSpan={deleteMode ? 10 : 9} className="py-6 text-center text-slate-400">
                  Nenhuma papeleta encontrada.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
