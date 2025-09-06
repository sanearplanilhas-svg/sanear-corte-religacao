import * as React from "react";
import supabase from "../../lib/supabase";
import ListFilterBar, { ListFilter } from "../../components/filters/ListFilterBar";

type ReligRow = {
  id: string;
  matricula: string;
  bairro: string | null;
  rua: string | null;
  numero: string | null;
  ponto_referencia: string | null;
  prioridade: boolean | null;
  status: string;
  pdf_ordem_path: string | null;
  created_at: string; // ISO
};

type Msg = { kind: "ok" | "err"; text: string } | null;

const STATUS_PENDENTE = "aguardando_religacao";

export default function PendingReconnectionsTable() {
  const [rows, setRows] = React.useState<ReligRow[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [msg, setMsg] = React.useState<Msg>(null);

  const [filter, setFilter] = React.useState<ListFilter>({
    q: "",
    startDate: null,
    endDate: null,
  });

  const fmtDT = (iso?: string | null) =>
    iso ? new Date(iso).toLocaleString("pt-BR") : "—";

  const fileUrl = (path: string | null) => {
    if (!path) return null;
    return supabase.storage.from("ordens-pdfs").getPublicUrl(path).data.publicUrl ?? null;
  };

  async function load() {
    setLoading(true);
    try {
      let query = supabase
        .from("ordens_religacao")
        .select(
          "id, matricula, bairro, rua, numero, ponto_referencia, prioridade, status, pdf_ordem_path, created_at"
        )
        .eq("status", STATUS_PENDENTE);

      if (filter.q.trim()) {
        const q = filter.q.trim();
        query = query.or(`matricula.ilike.%${q}%,bairro.ilike.%${q}%,rua.ilike.%${q}%`);
      }
      if (filter.startDate) query = query.gte("created_at", `${filter.startDate}T00:00:00`);
      if (filter.endDate)   query = query.lte("created_at", `${filter.endDate}T23:59:59`);

      // prioridade primeiro, depois data
      query = query.order("prioridade", { ascending: false }).order("created_at", { ascending: false });

      const { data, error } = await query;
      if (error) throw error;

      setRows((data ?? []) as ReligRow[]);
    } catch (e: any) {
      setMsg({ kind: "err", text: e?.message ?? "Falha ao carregar" });
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function clearFilters() {
    setFilter({ q: "", startDate: null, endDate: null });
  }

  return (
    <div className="rounded-2xl bg-slate-900/50 ring-1 ring-white/10 p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="font-semibold">Religações pendentes</h3>
          <p className="text-slate-400 text-sm">
            Ordens com status{" "}
            <span className="text-amber-300 font-medium">aguardando_religacao</span>.
            Prioridades aparecem no topo em destaque.
          </p>
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
      />

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-slate-400">
            <tr>
              <th className="text-left font-medium py-2">Matrícula</th>
              <th className="text-left font-medium py-2">Bairro</th>
              <th className="text-left font-medium py-2">Rua e nº</th>
              <th className="text-left font-medium py-2">Ponto ref.</th>
              <th className="text-left font-medium py-2">Prioridade</th>
              <th className="text-center font-medium py-2">Status</th>
              <th className="text-center font-medium py-2">Ordem (PDF)</th>
              <th className="text-center font-medium py-2">Criado em</th>
            </tr>
          </thead>
          <tbody className="text-slate-200">
            {rows.map((r) => (
              <tr
                key={r.id}
                className={`border-t border-white/5 ${
                  r.prioridade ? "bg-rose-500/10" : ""
                }`}
              >
                <td className="py-2 font-semibold">{r.matricula}</td>
                <td className="py-2">{r.bairro || "-"}</td>
                <td className="py-2">{[r.rua, r.numero].filter(Boolean).join(", ") || "-"}</td>
                <td className="py-2">{r.ponto_referencia || "-"}</td>
                <td className="py-2">
                  {r.prioridade ? (
                    <span className="px-2 py-1 rounded bg-rose-600/30 text-rose-200 text-xs font-bold">
                      PRIORIDADE
                    </span>
                  ) : (
                    <span className="px-2 py-1 rounded bg-slate-500/20 text-slate-300 text-xs">
                      normal
                    </span>
                  )}
                </td>
                <td className="py-2 text-center">
                  <span className="inline-flex items-center px-2 py-0.5 text-xs rounded-full bg-amber-500/20 text-amber-300 ring-1 ring-amber-400/30">
                    {r.status}
                  </span>
                </td>
                <td className="py-2 text-center">
                  {r.pdf_ordem_path ? (
                    <a
                      href={fileUrl(r.pdf_ordem_path) || "#"}
                      target="_blank"
                      rel="noreferrer"
                      className="px-3 py-1.5 text-xs rounded-lg bg-indigo-500/20 text-indigo-200 ring-1 ring-indigo-400/40 hover:bg-indigo-500/30"
                    >
                      Imprimir
                    </a>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="py-2 text-center">{fmtDT(r.created_at)}</td>
              </tr>
            ))}

            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={8} className="py-6 text-center text-slate-400">
                  Nenhuma papeleta pendente.
                </td>
              </tr>
            )}
            {loading && (
              <tr>
                <td colSpan={8} className="py-6 text-center text-slate-400">
                  Carregando…
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {msg && (
        <div
          className={`mt-3 text-sm px-3 py-2 rounded-lg ${
            msg.kind === "ok"
              ? "bg-emerald-500/15 text-emerald-300"
              : "bg-rose-500/15 text-rose-300"
          }`}
        >
          {msg.text}
        </div>
      )}
    </div>
  );
}
