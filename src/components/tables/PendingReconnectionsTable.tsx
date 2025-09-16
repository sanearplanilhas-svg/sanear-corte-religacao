import * as React from "react";
import supabase from "../../lib/supabase";
import ListFilterBar, { ListFilter } from "../../components/filters/ListFilterBar";

type PendRow = {
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
  precisa_troca_hidrometro: boolean | null; // “Trocar Hidômetro?”
  observacao: string | null;                 // usado nos modais
};

// normalização simples
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
  let cls = "bg-slate-500/20 text-slate-300 ring-slate-400/30";
  let label = status;

  if (s === "aguardando religacao" || s.startsWith("aguardando")) {
    cls = "bg-amber-500/20 text-amber-300 ring-amber-400/30";
    label = "Aguardando Religação"; // 🔹 capitalizado
  } else if (s === "ativa" || s === "ativo") {
    cls = "bg-emerald-500/20 text-emerald-300 ring-emerald-400/30";
    label = "Ativa";
  }
  return <span className={`px-2 py-0.5 text-xs rounded-full ring-1 ${cls}`}>{label}</span>;
}

function HidrometroBadge({ value }: { value: boolean | null }) {
  if (value === true) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 text-xs rounded-full ring-1 bg-emerald-600/20 text-emerald-200 ring-emerald-400/40">
        SIM
      </span>
    );
  }
  if (value === false) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 text-xs rounded-full ring-1 bg-rose-600/20 text-rose-200 ring-rose-400/40">
        NÃO
      </span>
    );
  }
  return <span className="text-slate-400 text-xs">—</span>;
}

export default function PendingReconnectionsTable() {
  const [rows, setRows] = React.useState<PendRow[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [msg, setMsg] = React.useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const [filter, setFilter] = React.useState<ListFilter>({
    q: "",
    startDate: null,
    endDate: null,
  });

  const fmtDateTime = (iso: string | null) =>
    iso ? new Date(iso).toLocaleString("pt-BR") : "—";

  // ====== MODAIS ======
  const [modalAtivarSim, setModalAtivarSim] = React.useState<{
    open: boolean;
    id?: string;
    matricula?: string;
    observacao?: string | null;
    novoNumero?: string;
    saving?: boolean;
  }>({ open: false });

  const [modalAtivarNao, setModalAtivarNao] = React.useState<{
    open: boolean;
    id?: string;
    matricula?: string;
    observacao?: string | null;
    saving?: boolean;
  }>({ open: false });

  const [modalImprimir, setModalImprimir] = React.useState<{
    open: boolean;
    matricula?: string;
    observacao?: string | null;
    pdfUrl?: string | null;
  }>({ open: false });

  // ====== CARREGAR LISTA ======
  async function load() {
    try {
      setLoading(true);

      let query = supabase
        .from("ordens_religacao")
        .select(
          [
            "id",
            "matricula",
            "bairro",
            "rua",
            "numero",
            "ponto_referencia",
            "prioridade",
            "status",
            "pdf_ordem_path",
            "created_at",
            "precisa_troca_hidrometro",
            "observacao",
          ].join(", ")
        )
        .eq("status", "aguardando_religacao");

      if (filter.q.trim() !== "") {
        const q = filter.q.trim();
        query = query.or(`matricula.ilike.%${q}%,bairro.ilike.%${q}%,rua.ilike.%${q}%`);
      }

      if (filter.startDate) query = query.gte("created_at", `${filter.startDate}T00:00:00`);
      if (filter.endDate) query = query.lte("created_at", `${filter.endDate}T23:59:59`);

      query = query.order("created_at", { ascending: false });

      const { data, error } = await query;

      if (error) {
        setMsg({ kind: "err", text: error.message });
      } else {
        setRows(((data ?? []) as unknown) as PendRow[]);
      }
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

  // ====== IMPRESSÃO (com modal de observação) ======
  function renderImprimirCell(row: PendRow) {
    if (!row.pdf_ordem_path) return "—";
    const { data } = supabase.storage.from("ordens-pdfs").getPublicUrl(row.pdf_ordem_path);
    const url = data?.publicUrl || null;

    return (
      <button
        type="button"
        onClick={() =>
          setModalImprimir({
            open: true,
            matricula: row.matricula,
            observacao: row.observacao,
            pdfUrl: url,
          })
        }
        className="px-3 py-1.5 text-xs rounded-lg bg-indigo-500/20 text-indigo-200 ring-1 ring-indigo-400/40 hover:bg-indigo-500/30"
        title="Imprimir PDF"
      >
        Imprimir
      </button>
    );
  }

  // ====== FLUXO ATIVAR ======
  function onClickAtivar(row: PendRow) {
    if (row.precisa_troca_hidrometro === true) {
      setModalAtivarSim({
        open: true,
        id: row.id,
        matricula: row.matricula,
        observacao: row.observacao,
        novoNumero: "",
        saving: false,
      });
    } else {
      setModalAtivarNao({
        open: true,
        id: row.id,
        matricula: row.matricula,
        observacao: row.observacao,
        saving: false,
      });
    }
  }

  async function confirmarAtivarSim() {
    if (!modalAtivarSim.id) return;
    const id = modalAtivarSim.id;
    const numeroNovo = (modalAtivarSim.novoNumero ?? "").trim();

    const baseObs = (modalAtivarSim.observacao ?? "").toUpperCase();
    const extra = numeroNovo ? (baseObs ? ` | NOVO HIDRÔMETRO: ${numeroNovo}` : `NOVO HIDRÔMETRO: ${numeroNovo}`) : "";
    const novaObs = (baseObs + extra).trim();

    try {
      setModalAtivarSim((m) => ({ ...m, saving: true }));
      const { error } = await supabase
        .from("ordens_religacao")
        .update({ status: "ativa", ativa_em: new Date().toISOString(), observacao: novaObs })
        .eq("id", id);

      if (error) {
        setMsg({ kind: "err", text: `Falha ao ativar: ${error.message}` });
        setModalAtivarSim((m) => ({ ...m, saving: false }));
        return;
      }
      setRows((prev) => prev.filter((r) => r.id !== id));
      setMsg({ kind: "ok", text: "Papeleta marcada como ATIVA." });
      setModalAtivarSim({ open: false });
    } catch (e: any) {
      setMsg({ kind: "err", text: e?.message ?? "Falha ao ativar." });
      setModalAtivarSim((m) => ({ ...m, saving: false }));
    }
  }

  async function confirmarAtivarNao() {
    if (!modalAtivarNao.id) return;
    const id = modalAtivarNao.id;
    try {
      setModalAtivarNao((m) => ({ ...m, saving: true }));
      const { error } = await supabase
        .from("ordens_religacao")
        .update({ status: "ativa", ativa_em: new Date().toISOString() })
        .eq("id", id);

      if (error) {
        setMsg({ kind: "err", text: `Falha ao ativar: ${error.message}` });
        setModalAtivarNao((m) => ({ ...m, saving: false }));
        return;
      }
      setRows((prev) => prev.filter((r) => r.id !== id));
      setMsg({ kind: "ok", text: "Papeleta marcada como ATIVA." });
      setModalAtivarNao({ open: false });
    } catch (e: any) {
      setMsg({ kind: "err", text: e?.message ?? "Falha ao ativar." });
      setModalAtivarNao((m) => ({ ...m, saving: false }));
    }
  }

  return (
    <div className="rounded-2xl bg-slate-900/50 ring-1 ring-white/10 p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="font-semibold">Religações pendentes</h3>
          <p className="text-slate-400 text-sm">Exibe as ordens com status “Aguardando Religação”.</p>
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

      <div className="rounded-xl overflow-hidden ring-1 ring-white/10">
        <table className="w-full text-sm">
          <thead className="bg-white/5 text-slate-300">
            <tr>
              <th className="text-left font-medium py-2 px-3">Matrícula</th>
              <th className="text-left font-medium py-2 px-3">Bairro</th>
              <th className="text-left font-medium py-2 px-3">Rua e nº</th>
              <th className="text-left font-medium py-2 px-3">Ponto ref.</th>
              <th className="text-left font-medium py-2 px-3">Prioridade</th>
              <th className="text-center font-medium py-2 px-3">Status / Marcar</th>
              <th className="text-center font-medium py-2 px-3">Ordem (PDF)</th>
              <th className="text-center font-medium py-2 px-3">Criado em</th>
              <th className="text-center font-medium py-2 px-3">Trocar Hidômetro?</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {rows.map((r) => (
              <tr key={r.id} className="bg-slate-950/40">
                <td className="py-2 px-3 font-mono">{r.matricula}</td>
                <td className="py-2 px-3">{r.bairro}</td>
                <td className="py-2 px-3">
                  {r.rua}, {r.numero}
                </td>
                <td className="py-2 px-3">{r.ponto_referencia || "-"}</td>
                <td className="py-2 px-3">
                  {r.prioridade ? (
                    <span className="inline-flex items-center px-2 py-0.5 text-xs rounded-full bg-fuchsia-500/20 text-fuchsia-300 ring-1 ring-fuchsia-400/30">
                      PRIORIDADE
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-2 py-0.5 text-xs rounded-full bg-slate-500/20 text-slate-300 ring-1 ring-slate-400/30">
                      Normal {/* 🔹 capitalizado */}
                    </span>
                  )}
                </td>
                <td className="py-2 px-3 text-center">
                  <div className="inline-flex items-center gap-2">
                    <StatusBadge status={r.status} />
                    <button
                      onClick={() => onClickAtivar(r)}
                      className="px-3 py-1.5 text-xs rounded-lg bg-emerald-600/20 text-emerald-200 ring-1 ring-emerald-400/40 hover:bg-emerald-600/30"
                      title="Marcar como ATIVA"
                    >
                      Ativar
                    </button>
                  </div>
                </td>
                <td className="py-2 px-3 text-center">{renderImprimirCell(r)}</td>
                <td className="py-2 px-3 text-center">{fmtDateTime(r.created_at)}</td>
                <td className="py-2 px-3 text-center">
                  <HidrometroBadge value={r.precisa_troca_hidrometro} />
                </td>
              </tr>
            ))}

            {rows.length === 0 && (
              <tr>
                <td colSpan={9} className="py-6 text-center text-slate-400">
                  Nenhuma papeleta pendente.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ===== Modal: Ativar (Troca SIM) ===== */}
      {modalAtivarSim.open && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-slate-800 p-6 rounded-xl shadow-2xl w-full max-w-md">
            <h3 className="text-lg font-semibold text-white mb-3">
              Ativar matrícula {modalAtivarSim.matricula}
            </h3>
            <div className="text-slate-300 text-sm mb-3">
              <div className="font-semibold mb-1">OBSERVAÇÃO:</div>
              <div className="whitespace-pre-wrap">
                {modalAtivarSim.observacao ? modalAtivarSim.observacao : "—"}
              </div>
            </div>

            <label className="block text-sm text-slate-300 mb-1">NOVO NÚMERO DO HIDRÔMETRO</label>
            <input
              value={modalAtivarSim.novoNumero ?? ""}
              onChange={(e) =>
                setModalAtivarSim((m) => ({ ...m, novoNumero: e.target.value.toUpperCase() }))
              }
              className="w-full rounded-xl bg-slate-900/60 border border-white/10 px-3 py-2 outline-none focus:ring-2 ring-emerald-400/40 text-white"
              placeholder="DIGITE AQUI…"
              autoFocus
            />

            <div className="mt-5 flex justify-end gap-3">
              <button
                onClick={() => setModalAtivarSim({ open: false })}
                className="px-4 py-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 text-slate-200"
                disabled={!!modalAtivarSim.saving}
              >
                Cancelar
              </button>
              <button
                onClick={confirmarAtivarSim}
                className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-60"
                disabled={!!modalAtivarSim.saving}
              >
                {modalAtivarSim.saving ? "Ativando…" : "Confirmar ativação"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== Modal: Ativar (Troca NÃO) ===== */}
      {modalAtivarNao.open && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-slate-800 p-6 rounded-xl shadow-2xl w-full max-w-md">
            <h3 className="text-lg font-semibold text-white mb-3">
              Ativar matrícula {modalAtivarNao.matricula}
            </h3>
            <p className="text-slate-300 text-sm">
              Não é necessário anexar novo hidrômetro para esta ordem.
            </p>
            <div className="text-slate-300 text-sm mt-3">
              <div className="font-semibold mb-1">OBSERVAÇÃO:</div>
              <div className="whitespace-pre-wrap">
                {modalAtivarNao.observacao ? modalAtivarNao.observacao : "—"}
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-3">
              <button
                onClick={() => setModalAtivarNao({ open: false })}
                className="px-4 py-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 text-slate-200"
                disabled={!!modalAtivarNao.saving}
              >
                Fechar
              </button>
              <button
                onClick={confirmarAtivarNao}
                className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-60"
                disabled={!!modalAtivarNao.saving}
              >
                {modalAtivarNao.saving ? "Ativando…" : "Ativar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== Modal: Observação antes de Imprimir ===== */}
      {modalImprimir.open && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-slate-800 p-6 rounded-xl shadow-2xl w-full max-w-md text-center">
            <h3 className="text-lg font-semibold text-white mb-3">
              Observação da matrícula {modalImprimir.matricula}
            </h3>
            <div className="text-slate-300 text-sm mb-4 whitespace-pre-wrap">
              {modalImprimir.observacao ? modalImprimir.observacao : "—"}
            </div>
            <div className="flex justify-center gap-3">
              <button
                onClick={() => setModalImprimir({ open: false })}
                className="px-4 py-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 text-slate-200"
              >
                Fechar
              </button>
              <button
                onClick={() => {
                  const url = modalImprimir.pdfUrl;
                  setModalImprimir({ open: false });
                  if (url) window.open(url, "_blank", "noopener,noreferrer");
                }}
                className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-60"
                disabled={!modalImprimir.pdfUrl}
              >
                OK, entendi
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
