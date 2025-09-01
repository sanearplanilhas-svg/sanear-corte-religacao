import * as React from "react";
import supabase from "../lib/supabase";
import ListFilterBar, { ListFilter } from "../components/filters/ListFilterBar";

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
  created_at: string;
  ativa_em: string | null; // Coluna ativa_em para data e hora de ativação
};

type Props = {
  onGoToPending?: (id: string) => void;
};

export default function AllReconnectionsTable({ onGoToPending }: Props) {
  const [rows, setRows] = React.useState<ReligRow[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [msg, setMsg] = React.useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const [filter, setFilter] = React.useState<ListFilter>({
    q: "",
    startDate: null,
    endDate: null,
  });

  async function load() {
    setLoading(true);

    let query = supabase
      .from("ordens_religacao")
      .select("id, matricula, bairro, rua, numero, ponto_referencia, prioridade, status, pdf_ordem_path, created_at, ativa_em"); // Incluindo ativa_em

    if (filter.startDate) {
      query = query.gte("created_at", `${filter.startDate}T00:00:00`);
    }
    if (filter.endDate) {
      query = query.lte("created_at", `${filter.endDate}T23:59:59`);
    }

    if (filter.q.trim() !== "") {
      const q = filter.q.trim();
      query = query.or(
        `matricula.ilike.%${q}%,bairro.ilike.%${q}%,rua.ilike.%${q}%`
      );
    }

    query = query.order("created_at", { ascending: false });

    const { data, error } = await query;
    if (error) setMsg({ kind: "err", text: error.message });
    else setRows((data || []) as ReligRow[]);

    setLoading(false);
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
          <h3 className="font-semibold">Todas as papeletas</h3>
          <p className="text-slate-400 text-sm">Lista completa das papeletas de religação.</p>
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

      {msg && (
        <div
          className={`mb-3 text-sm px-3 py-2 rounded-lg ${msg.kind === "ok" ? "bg-emerald-500/15 text-emerald-300" : "bg-rose-500/15 text-rose-300"}`}
        >
          {msg.text}
        </div>
      )}

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
              <th className="text-center font-medium py-2">Ativa em</th> {/* Exibe a data de ativação */}
            </tr>
          </thead>
          <tbody className="text-slate-200">
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-white/5">
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
                      className="px-3 py-1.5 text-xs rounded-lg bg-indigo-500/20 text-indigo-200 ring-1 ring-indigo-400/40 hover:bg-indigo-500/30"
                    >
                      Imprimir
                    </a>
                  ) : ("—")}
                </td>
                <td className="py-2 text-center">
                  {new Date(r.created_at).toLocaleString("pt-BR")}
                </td>
                <td className="py-2 text-center">
                  {r.ativa_em ? new Date(r.ativa_em).toLocaleString("pt-BR") : "-"}
                </td>
              </tr>
            ))}

            {rows.length === 0 && (
              <tr>
                <td colSpan={9} className="py-6 text-center text-slate-400">
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
