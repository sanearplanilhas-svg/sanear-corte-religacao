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
  status: string;
  pdf_ordem_path: string | null;
  created_at: string;
  corte_na_rua: boolean | null;
};

const fmt = (iso?: string | null) => (iso ? new Date(iso).toLocaleString("pt-BR") : "—");

// >>> NOVO: perfis autorizados a marcar CORTADA
const ALLOWED_CUT = new Set(["ADM", "TERCEIRIZADA"]);

export default function PendingCutsTable() {
  const [rows, setRows] = React.useState<CorteRow[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [msg, setMsg] = React.useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const [filter, setFilter] = React.useState<ListFilter>({
    q: "",
    startDate: null,
    endDate: null,
  });

  // >>> NOVO: papel do usuário + modal de permissão
  const [userRole, setUserRole] = React.useState<string>("VISITANTE");
  const canCut = React.useMemo(
    () => ALLOWED_CUT.has((userRole || "VISITANTE").toUpperCase()),
    [userRole]
  );

  const [permModalOpen, setPermModalOpen] = React.useState(false);
  const [permText, setPermText] = React.useState(
    "Apenas TERCEIRIZADA e ADM podem marcar como CORTADA."
  );
  // <<<

  React.useEffect(() => {
    (async () => {
      try {
        const { data: udata, error: uerr } = await supabase.auth.getUser();
        if (uerr) throw uerr;
        // Narrowing seguro para evitar TS2532
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

  function buildQuery() {
    let query = supabase
      .from("ordens_corte")
      .select(
        "id, matricula, bairro, rua, numero, ponto_referencia, status, pdf_ordem_path, created_at, corte_na_rua"
      )
      // duas formas de encontrar "aguardando corte"
      .or(["status.eq.aguardando_corte", "status.ilike.%aguardando corte%"].join(","));

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
      // limpa snackbar após um tempo
      setTimeout(() => setMsg(null), 2200);
      return;
    }
    setRows(((data ?? []) as unknown) as CorteRow[]);
    setLoading(false);
  }

  React.useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function clearFilters() {
    setFilter({ q: "", startDate: null, endDate: null });
  }

  async function marcarCortada(id: string) {
    // >>> NOVO: guarda de permissão
    if (!canCut) {
      setPermText("Apenas TERCEIRIZADA e ADM podem marcar como CORTADA.");
      setPermModalOpen(true);
      return;
    }
    // <<<

    const { error } = await supabase.from("ordens_corte").update({ status: "cortada" }).eq("id", id);
    if (error) {
      // Se o backend/trigger bloquear, mostra erro amigável
      if (/Impedido|insufficient_privilege|permission|RLS|row-level|policy|denied/i.test(error.message)) {
        setPermText("A operação foi bloqueada pelas regras de segurança.");
        setPermModalOpen(true);
        return;
      }
      setMsg({ kind: "err", text: `Falha ao atualizar: ${error.message}` });
      setTimeout(() => setMsg(null), 2200);
      return;
    }

    setRows((prev) => prev.filter((r) => r.id !== id));
    setMsg({ kind: "ok", text: "Papeleta marcada como CORTADA." });
    setTimeout(() => setMsg(null), 1800);
  }

  function renderImprimirCell(row: CorteRow) {
    if (!row.pdf_ordem_path) return "—";
    const { data } = supabase.storage.from("ordens-pdfs").getPublicUrl(row.pdf_ordem_path);
    const url = data?.publicUrl;
    if (!url) return <span className="text-slate-400 text-xs">Sem link</span>;
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
    if (val === true) {
      return (
        <span className="inline-flex items-center px-2 py-0.5 text-xs rounded-full ring-1 bg-emerald-600/20 text-emerald-200 ring-emerald-400/40 whitespace-nowrap">
          SIM
        </span>
      );
    }
    if (val === false) {
      return (
        <span className="inline-flex items-center px-2 py-0.5 text-xs rounded-full ring-1 bg-rose-600/20 text-rose-200 ring-rose-400/40 whitespace-nowrap">
          NÃO
        </span>
      );
    }
    return "—";
  }

  // ❗ Evita comentários/whitespace dentro do <colgroup> (elimina warnings do React)
  const colWidths = React.useMemo(
    () => ["w-28", "w-48", "w-[340px]", "w-[320px]", "w-56", "w-28", "w-40", "w-36"],
    []
  );
  const colEls = React.useMemo(
    () => colWidths.map((cls, i) => <col key={i} className={cls} />),
    [colWidths]
  );

  return (
    <div className="rounded-2xl bg-slate-900/50 ring-1 ring-white/10 p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="font-semibold">Cortes pendentes</h3>
          <p className="text-slate-400 text-sm">Somente status “Aguardando Corte”.</p>
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
          className={`mb-3 text-sm px-3 py-2 rounded-lg ${
            msg.kind === "ok" ? "bg-emerald-500/15 text-emerald-300" : "bg-rose-500/15 text-rose-300"
          }`}
        >
          {msg.text}
        </div>
      )}

      {/* SCROLL HORIZONTAL + colgroup com larguras base */}
      <div className="rounded-xl overflow-x-auto ring-1 ring-white/10">
        <table className="w-full text-sm table-auto">
          <colgroup>{colEls}</colgroup>

          <thead className="bg-white/5 text-slate-300">
            <tr>
              <th className="text-left font-medium py-2 px-3">Matrícula</th>
              <th className="text-left font-medium py-2 px-3">Bairro</th>
              <th className="text-left font-medium py-2 px-3">Rua e nº</th>
              <th className="text-left font-medium py-2 px-3">Ponto ref.</th>
              <th className="text-center font-medium py-2 px-3">Status / Marcar</th>
              <th className="text-center font-medium py-2 px-3">Ordem (PDF)</th>
              <th className="text-center font-medium py-2 px-3">Criado em</th>
              <th className="text-center font-medium py-2 px-3">Corte na rua?</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-white/10">
            {rows.map((r) => (
              <tr key={r.id} className="bg-slate-950/40 align-middle">
                <td className="py-2 px-3 font-mono whitespace-nowrap">{r.matricula}</td>

                <td className="py-2 px-3">
                  <div className="truncate max-w-[180px]" title={r.bairro}>
                    {r.bairro}
                  </div>
                </td>

                <td className="py-2 px-3">
                  <div className="truncate max-w-[300px]" title={`${r.rua}, ${r.numero}`}>
                    {r.rua}, {r.numero}
                  </div>
                </td>

                <td className="py-2 px-3">
                  <div className="truncate max-w-[280px]" title={r.ponto_referencia || "-"}>
                    {r.ponto_referencia || "-"}
                  </div>
                </td>

                <td className="py-2 px-3 text-center whitespace-nowrap">
                  <div className="inline-flex items-center gap-2">
                    <span className="inline-flex items-center px-2 py-0.5 text-xs rounded-full bg-amber-500/20 text-amber-300 ring-1 ring-amber-400/30 whitespace-nowrap">
                      Aguardando Corte
                    </span>

                    {canCut ? (
                      <button
                        onClick={() => marcarCortada(r.id)}
                        className="px-3 py-1.5 text-xs rounded-lg bg-rose-500/20 text-rose-200 ring-1 ring-rose-400/40 hover:bg-rose-500/30 whitespace-nowrap"
                      >
                        Cortar
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setPermText("Apenas TERCEIRIZADA e ADM podem marcar como CORTADA.");
                          setPermModalOpen(true);
                        }}
                        className="px-3 py-1.5 text-xs rounded-lg bg-rose-500/10 text-rose-300 ring-1 ring-rose-400/20 cursor-not-allowed opacity-75 whitespace-nowrap"
                        title="Sem permissão"
                      >
                        Cortar
                      </button>
                    )}
                  </div>
                </td>

                <td className="py-2 px-3 text-center">{renderImprimirCell(r)}</td>

                <td className="py-2 px-3 text-center whitespace-nowrap">{fmt(r.created_at)}</td>

                <td className="py-2 px-3 text-center">{renderCorteNaRua(r.corte_na_rua)}</td>
              </tr>
            ))}

            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="py-6 text-center text-slate-400">
                  Nenhuma papeleta pendente.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Modal de permissão negada */}
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
