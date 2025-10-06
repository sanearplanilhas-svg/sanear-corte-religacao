import * as React from "react";
import supabase from "../../lib/supabase";
import ListFilterBar, { ListFilter } from "../../components/filters/ListFilterBar";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

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
  precisa_troca_hidrometro: boolean | null;
  observacao: string | null;
  telefone: string | null;
  solicitante_nome: string | null;
  solicitante_documento: string | null;
};

const DEFAULT_EMPTY = "NÃO INFORMADO";
function getEmptyLabel(field?: string) {
  try {
    const raw = localStorage.getItem("emptyLabelMap");
    if (raw) {
      const map = JSON.parse(raw) as Record<string, string>;
      if (field && typeof map[field] === "string" && map[field].trim()) return map[field];
      if (typeof map["*"] === "string" && map["*"].trim()) return map["*"];
    }
  } catch {}
  return DEFAULT_EMPTY;
}
const withFallback = (v?: string | null, field?: string) =>
  v && v.toString().trim() !== "" ? v.toString() : getEmptyLabel(field);

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
    label = "Aguardando Religação";
  } else if (s === "ativa" || s === "ativo") {
    cls = "bg-emerald-500/20 text-emerald-300 ring-emerald-400/30";
    label = "Ativa";
  }
  return <span className={`px-2 py-0.5 text-xs rounded-full ring-1 ${cls} whitespace-nowrap`}>{label}</span>;
}

function HidrometroBadge({ value }: { value: boolean | null }) {
  if (value === true) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 text-xs rounded-full ring-1 bg-emerald-600/20 text-emerald-200 ring-emerald-400/40 whitespace-nowrap">
        SIM
      </span>
    );
  }
  if (value === false) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 text-xs rounded-full ring-1 bg-rose-600/20 text-rose-200 ring-rose-400/40 whitespace-nowrap">
        NÃO
      </span>
    );
  }
  return <span className="text-slate-400 text-xs whitespace-nowrap">{getEmptyLabel("numero_hidrometro")}</span>;
}

const ALLOWED_ACTIVATE = new Set(["ADM", "TERCEIRIZADA"]);
const SENHA_DIRETOR = "29101993";
type EditField = "bairro" | "rua_numero" | "ponto_referencia" | "telefone";

export default function PendingReconnectionsTable() {
  const [rows, setRows] = React.useState<PendRow[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [msg, setMsg] = React.useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const [filter, setFilter] = React.useState<ListFilter>({ q: "", startDate: null, endDate: null });
  const [over24h, setOver24h] = React.useState(false);

  const [editing, setEditing] = React.useState<
    | { id: string; field: "bairro" | "ponto_referencia" | "telefone"; value: string }
    | { id: string; field: "rua_numero"; value: string; value2: string }
    | null
  >(null);
  const [savingCell, setSavingCell] = React.useState(false);

  const fmtDateTime = (iso: string | null) => (iso ? new Date(iso).toLocaleString("pt-BR") : getEmptyLabel("datahora"));
  const fmtTel = (t?: string | null) => withFallback(t, "telefone");

  const [userRole, setUserRole] = React.useState<string>("VISITANTE");
  const canActivate = React.useMemo(() => ALLOWED_ACTIVATE.has((userRole || "VISITANTE").toUpperCase()), [userRole]);

  const [permModalOpen, setPermModalOpen] = React.useState(false);
  const [permText, setPermText] = React.useState("Apenas TERCEIRIZADA e ADM podem ativar papeletas.");

  React.useEffect(() => {
    (async () => {
      try {
        const { data: udata, error: uerr } = await supabase.auth.getUser();
        if (uerr) throw uerr;
        const user = (udata && "user" in udata ? (udata as any).user : undefined) as { id: string } | undefined;
        if (!user) {
          setUserRole("VISITANTE");
          return;
        }
        const { data, error } = await supabase.from("app_users").select("papel").eq("id", user.id).single();
        if (error) throw error;
        setUserRole((data?.papel || "VISITANTE").toUpperCase());
      } catch {
        setUserRole("VISITANTE");
      }
    })();
  }, []);

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
            "telefone",
            "solicitante_nome",
            "solicitante_documento",
          ].join(", ")
        )
        .eq("status", "aguardando_religacao");

      if (filter.q.trim() !== "") {
        const q = filter.q.trim();
        query = query.or(
          `matricula.ilike.%${q}%,bairro.ilike.%${q}%,rua.ilike.%${q}%,telefone.ilike.%${q}%,solicitante_nome.ilike.%${q}%,solicitante_documento.ilike.%${q}%`
        );
      }

      if (over24h) {
        const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        query = query.lte("created_at", cutoff);
      } else {
        if (filter.startDate) query = query.gte("created_at", `${filter.startDate}T00:00:00`);
        if (filter.endDate) query = query.lte("created_at", `${filter.endDate}T23:59:59`);
      }

      query = query.order("created_at", { ascending: false });

      const { data, error } = await query;

      if (error) {
        setMsg({ kind: "err", text: error.message });
        setTimeout(() => setMsg(null), 2200);
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
  React.useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [over24h]);

  function clearFilters() {
    setFilter({ q: "", startDate: null, endDate: null });
  }

  function startEdit(row: PendRow, field: EditField) {
    if (field === "rua_numero") {
      setEditing({ id: row.id, field: "rua_numero", value: row.rua, value2: row.numero });
    } else if (field === "bairro") {
      setEditing({ id: row.id, field: "bairro", value: row.bairro });
    } else if (field === "ponto_referencia") {
      setEditing({ id: row.id, field: "ponto_referencia", value: row.ponto_referencia ?? "" });
    } else if (field === "telefone") {
      setEditing({ id: row.id, field: "telefone", value: row.telefone ?? "" });
    }
  }

  async function saveEdit() {
    if (!editing || savingCell) return;
    setSavingCell(true);

    try {
      const id = editing.id;

      if (editing.field === "rua_numero") {
        const rua = (editing.value || "").toUpperCase().trim();
        const numero = (editing.value2 || "").toUpperCase().trim();
        const { error } = await supabase.from("ordens_religacao").update({ rua, numero }).eq("id", id);
        if (error) throw error;
        setRows((prev) => prev.map((r) => (r.id === id ? { ...r, rua, numero } : r)));
        setMsg({ kind: "ok", text: "Rua e número atualizados." });
      } else {
        const field = editing.field;
        const value = (editing.value || "").toUpperCase();
        const patch: any = { [field]: value };
        const { error } = await supabase.from("ordens_religacao").update(patch).eq("id", id);
        if (error) throw error;
        setRows((prev) => prev.map((r) => (r.id === id ? ({ ...r, [field]: value } as PendRow) : r)));
        setMsg({ kind: "ok", text: "Dados atualizados." });
      }
      setTimeout(() => setMsg(null), 1500);
      setEditing(null);
    } catch (e: any) {
      setMsg({ kind: "err", text: e?.message ?? "Falha ao salvar." });
      setTimeout(() => setMsg(null), 2200);
    } finally {
      setSavingCell(false);
    }
  }

  function onCellKeyDown(e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      saveEdit();
    } else if (e.key === "Escape") {
      setEditing(null);
    }
  }

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

  function onClickAtivar(row: PendRow) {
    if (!canActivate) {
      setPermText("Apenas TERCEIRIZADA e ADM podem ativar papeletas.");
      setPermModalOpen(true);
      return;
    }
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
    if (!canActivate) {
      setPermText("Apenas TERCEIRIZADA e ADM podem ativar papeletas.");
      setPermModalOpen(true);
      return;
    }

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
        if (/Impedido|insufficient_privilege|permission|RLS|row-level|policy|denied/i.test(error.message)) {
          setPermText("A operação foi bloqueada pelas regras de segurança.");
          setPermModalOpen(true);
          setModalAtivarSim((m) => ({ ...m, saving: false }));
          return;
        }
        setMsg({ kind: "err", text: `Falha ao ativar: ${error.message}` });
        setTimeout(() => setMsg(null), 2200);
        setModalAtivarSim((m) => ({ ...m, saving: false }));
        return;
      }

      await load();
      setMsg({ kind: "ok", text: "Papeleta marcada como ATIVA." });
      setTimeout(() => setMsg(null), 1800);
      setModalAtivarSim({ open: false });
    } catch (e: any) {
      setMsg({ kind: "err", text: e?.message ?? "Falha ao ativar." });
      setTimeout(() => setMsg(null), 2200);
      setModalAtivarSim((m) => ({ ...m, saving: false }));
    }
  }

  async function confirmarAtivarNao() {
    if (!modalAtivarNao.id) return;
    if (!canActivate) {
      setPermText("Apenas TERCEIRIZADA e ADM podem ativar papeletas.");
      setPermModalOpen(true);
      return;
    }

    const id = modalAtivarNao.id;
    try {
      setModalAtivarNao((m) => ({ ...m, saving: true }));
      const { error } = await supabase
        .from("ordens_religacao")
        .update({ status: "ativa", ativa_em: new Date().toISOString() })
        .eq("id", id);

      if (error) {
        if (/Impedido|insufficient_privilege|permission|RLS|row-level|policy|denied/i.test(error.message)) {
          setPermText("A operação foi bloqueada pelas regras de segurança.");
          setPermModalOpen(true);
          setModalAtivarNao((m) => ({ ...m, saving: false }));
          return;
        }
        setMsg({ kind: "err", text: `Falha ao ativar: ${error.message}` });
        setTimeout(() => setMsg(null), 2200);
        setModalAtivarNao((m) => ({ ...m, saving: false }));
        return;
      }

      await load();
      setMsg({ kind: "ok", text: "Papeleta marcada como ATIVA." });
      setTimeout(() => setMsg(null), 1800);
      setModalAtivarNao({ open: false });
    } catch (e: any) {
      setMsg({ kind: "err", text: e?.message ?? "Falha ao ativar." });
      setTimeout(() => setMsg(null), 2200);
      setModalAtivarNao((m) => ({ ...m, saving: false }));
    }
  }

  const [modalPrioridade, setModalPrioridade] = React.useState<{
    open: boolean;
    id?: string;
    atual?: boolean;
    senha?: string;
    saving?: boolean;
  }>({ open: false });

  function onDblClickPrioridade(row: PendRow) {
    setModalPrioridade({ open: true, id: row.id, atual: row.prioridade, senha: "", saving: false });
  }
  async function confirmarPrioridade() {
    if (!modalPrioridade.open || !modalPrioridade.id) return;
    if ((modalPrioridade.senha || "") !== SENHA_DIRETOR) {
      setMsg({ kind: "err", text: "Senha inválida." });
      setTimeout(() => setMsg(null), 1500);
      return;
    }
    try {
      setModalPrioridade((m) => ({ ...m, saving: true }));
      const novo = !modalPrioridade.atual;
      const { error } = await supabase.from("ordens_religacao").update({ prioridade: novo }).eq("id", modalPrioridade.id);
      if (error) throw error;
      setRows((prev) => prev.map((r) => (r.id === modalPrioridade.id ? { ...r, prioridade: novo } : r)));
      setMsg({ kind: "ok", text: "Prioridade atualizada." });
      setTimeout(() => setMsg(null), 1500);
      setModalPrioridade({ open: false });
    } catch (e: any) {
      setMsg({ kind: "err", text: e?.message ?? "Falha ao atualizar prioridade." });
      setTimeout(() => setMsg(null), 2200);
      setModalPrioridade((m) => ({ ...m, saving: false }));
    }
  }

  async function openPrintWindow(row: PendRow) {
    if (!row.pdf_ordem_path) {
      setMsg({ kind: "err", text: "PDF da ordem não encontrado." });
      setTimeout(() => setMsg(null), 1800);
      return;
    }
    const { data } = supabase.storage.from("ordens-pdfs").getPublicUrl(row.pdf_ordem_path);
    const pdfUrl = data?.publicUrl;
    if (!pdfUrl) {
      setMsg({ kind: "err", text: "Não foi possível obter o PDF para impressão." });
      setTimeout(() => setMsg(null), 2000);
      return;
    }
    const win = window.open("", "_blank", "width=1024,height=768");
    try { if (win) (win as any).opener = null; } catch {}
    const ab: ArrayBuffer = await fetch(pdfUrl).then((r) => r.arrayBuffer());
    const pdfDoc = await PDFDocument.load(ab);
    const pages = pdfDoc.getPages();
    if (pages.length === 0) {
      setMsg({ kind: "err", text: "PDF inválido: sem páginas." });
      setTimeout(() => setMsg(null), 2000);
      if (win) win.close();
      return;
    }
    const page = pages[0]!;
    const { width, height } = page.getSize();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const tel = withFallback(row.telefone, "telefone").trim();
    const nome = withFallback(row.solicitante_nome, "solicitante").trim();
    const doc = withFallback(row.solicitante_documento, "documento").trim();
    const pref = withFallback(row.ponto_referencia, "ponto_referencia").trim();
    const obs = withFallback(row.observacao, "observacao").trim();
    const dataHora = row.created_at ? new Date(row.created_at).toLocaleString("pt-BR") : getEmptyLabel("datahora");

    const boxW = Math.min(420, width - 72 * 2);
    const boxH = 130;
    const boxX = (width - boxW) / 2;
    const boxY = height * 0.5 - boxH / 2;

    page.drawRectangle({
      x: boxX,
      y: boxY,
      width: boxW,
      height: boxH,
      color: rgb(1, 1, 1),
      opacity: 0.96,
      borderColor: rgb(0.85, 0.88, 0.92),
      borderWidth: 1,
    });

    page.drawText("DADOS DO SOLICITANTE", {
      x: boxX + 12,
      y: boxY + boxH - 18,
      size: 12,
      font: fontBold,
      color: rgb(0, 0, 0),
    });

    let y = boxY + boxH - 36;
    const line = (label: string, value: string) => {
      page.drawText(label + ":", { x: boxX + 12, y, size: 10, font: fontBold, color: rgb(0, 0, 0) });
      page.drawText(value, { x: boxX + 120, y, size: 10, font, color: rgb(0, 0, 0) });
      y -= 14;
    };

    line("Solicitante", nome);
    line("Documento", doc);
    line("Telefone", tel);
    line("Ponto ref.", pref);
    line("Criada em", dataHora);

    const obsLabel = "Observações:";
    page.drawText(obsLabel, { x: boxX + 12, y, size: 10, font: fontBold, color: rgb(0, 0, 0) });
    const maxPerLine = 60;
    const obs1 = obs.slice(0, maxPerLine);
    const obs2 = obs.length > maxPerLine ? obs.slice(maxPerLine, maxPerLine * 2) : "";
    page.drawText(obs1, { x: boxX + 120, y, size: 10, font, color: rgb(0, 0, 0) });
    if (obs2) page.drawText(obs2, { x: boxX + 120, y: y - 12, size: 10, font, color: rgb(0, 0, 0) });

    const bytes = await pdfDoc.save();
    const abuf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    const blob = new Blob([abuf], { type: "application/pdf" });
    const blobUrl = URL.createObjectURL(blob);

    if (win) win.location.href = blobUrl;
    else window.open(blobUrl, "_blank", "noopener,noreferrer");
  }

  const colWidths = React.useMemo(
    () => ["w-32", "w-40", "w-[320px]", "w-[300px]", "w-40", "w-[260px]", "w-28", "w-56", "w-32", "w-40", "w-40"],
    []
  );
  const colEls = React.useMemo(() => colWidths.map((cls, i) => <col key={i} className={cls} />), [colWidths]);

  return (
    <div className="rounded-2xl bg-slate-900/50 ring-1 ring-white/10 p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="font-semibold">Religações pendentes</h3>
          <p className="text-slate-400 text-sm">Exibe as ordens com status “Aguardando Religação”.</p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setOver24h((v) => !v)}
            className={`px-3 py-1.5 rounded-lg border text-xs ${
              over24h ? "bg-rose-600 text-white border-rose-500 hover:bg-rose-500" : "bg-rose-600/90 text-white border-rose-500 hover:bg-rose-600"
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
        onClear={() => {
          clearFilters();
          setTimeout(load, 0);
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

      <div className="rounded-xl ring-1 ring-white/10 max-h-[60vh] overflow-x-auto overflow-y-auto">
        <table className="min-w-[1360px] w-max text-sm table-auto">
          <colgroup>{colEls}</colgroup>

          <thead className="sticky top-0 z-20 bg-slate-900/95 text-slate-100 backdrop-blur border-white/10">
            <tr>
              <th className="sticky left-0 z-30 bg-slate-900/95 backdrop-blur px-3 py-2 text-center font-medium border-r border-white/10">
                Matrícula
              </th>
              <th className="text-left font-medium py-2 px-3">Bairro</th>
              <th className="text-left font-medium py-2 px-3">Rua e nº</th>
              <th className="text-left font-medium py-2 px-3">Ponto ref.</th>
              <th className="text-left font-medium py-2 px-3">Telefone</th>
              <th className="text-left font-medium py-2 px-3">Solicitante</th>
              <th className="text-left font-medium py-2 px-3">Prioridade</th>
              <th className="text-center font-medium py-2 px-3">Status / Marcar</th>
              <th className="text-center font-medium py-2 px-3">Ordem (PDF)</th>
              <th className="text-center font-medium py-2 px-3">Criado em</th>
              <th className="text-center font-medium py-2 px-3">Trocar Hidrômetro?</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-white/10">
            {rows.map((r) => (
              <tr key={r.id} className="bg-slate-950/40 align-middle">
                <td className="sticky left-0 z-10 bg-slate-950/80 backdrop-blur px-3 py-2 font-mono whitespace-nowrap border-r border-white/10 text-center">
                  {r.matricula}
                </td>

                <td className="py-2 px-3" onDoubleClick={() => startEdit(r, "bairro")}>
                  {editing && editing.id === r.id && editing.field === "bairro" ? (
                    <input
                      autoFocus
                      value={editing.value}
                      onChange={(e) => setEditing({ id: r.id, field: "bairro", value: e.target.value })}
                      onBlur={saveEdit}
                      onKeyDown={onCellKeyDown}
                      className="w-full rounded-md bg-slate-900/60 border border-white/10 px-2 py-1 outline-none focus:ring-2 ring-emerald-400/40"
                    />
                  ) : (
                    <div className="truncate max-w-[160px]" title={withFallback(r.bairro, "bairro")}>{withFallback(r.bairro, "bairro")}</div>
                  )}
                </td>

                <td className="py-2 px-3" onDoubleClick={() => startEdit(r, "rua_numero")}>
                  {editing && editing.id === r.id && editing.field === "rua_numero" ? (
                    <div className="flex gap-2">
                      <input
                        autoFocus
                        placeholder="RUA"
                        value={editing.value}
                        onChange={(e) =>
                          setEditing({ id: r.id, field: "rua_numero", value: e.target.value, value2: (editing as any).value2 })
                        }
                        onKeyDown={onCellKeyDown}
                        onBlur={saveEdit}
                        className="w-full rounded-md bg-slate-900/60 border border-white/10 px-2 py-1 outline-none focus:ring-2 ring-emerald-400/40"
                      />
                      <input
                        placeholder="Nº"
                        value={(editing as any).value2}
                        onChange={(e) =>
                          setEditing({ id: r.id, field: "rua_numero", value: editing.value, value2: e.target.value })
                        }
                        onKeyDown={onCellKeyDown}
                        onBlur={saveEdit}
                        className="w-28 rounded-md bg-slate-900/60 border border-white/10 px-2 py-1 outline-none focus:ring-2 ring-emerald-400/40"
                      />
                    </div>
                  ) : (
                    <div className="truncate max-w-[280px]" title={`${withFallback(r.rua, "rua")}, ${withFallback(r.numero, "numero")}`}>
                      {withFallback(r.rua, "rua")}, {withFallback(r.numero, "numero")}
                    </div>
                  )}
                </td>

                <td className="py-2 px-3" onDoubleClick={() => startEdit(r, "ponto_referencia")}>
                  {editing && editing.id === r.id && editing.field === "ponto_referencia" ? (
                    <input
                      autoFocus
                      value={editing.value}
                      onChange={(e) => setEditing({ id: r.id, field: "ponto_referencia", value: e.target.value })}
                      onBlur={saveEdit}
                      onKeyDown={onCellKeyDown}
                      className="w-full rounded-md bg-slate-900/60 border border-white/10 px-2 py-1 outline-none focus:ring-2 ring-emerald-400/40"
                    />
                  ) : (
                    <div className="truncate max-w-[260px]" title={withFallback(r.ponto_referencia, "ponto_referencia")}>
                      {withFallback(r.ponto_referencia, "ponto_referencia")}
                    </div>
                  )}
                </td>

                <td className="py-2 px-3 whitespace-nowrap" onDoubleClick={() => startEdit(r, "telefone")}>
                  {editing && editing.id === r.id && editing.field === "telefone" ? (
                    <input
                      autoFocus
                      value={editing.value}
                      onChange={(e) => setEditing({ id: r.id, field: "telefone", value: e.target.value })}
                      onBlur={saveEdit}
                      onKeyDown={onCellKeyDown}
                      inputMode="tel"
                      className="w-full rounded-md bg-slate-900/60 border border-white/10 px-2 py-1 outline-none focus:ring-2 ring-emerald-400/40"
                    />
                  ) : (
                    fmtTel(r.telefone)
                  )}
                </td>

                <td className="py-2 px-3">
                  <div className="max-w-[240px]">
                    <div className="truncate font-medium" title={withFallback(r.solicitante_nome, "solicitante")}>
                      {withFallback(r.solicitante_nome, "solicitante")}
                    </div>
                    <div className="truncate text-xs text-slate-400" title={withFallback(r.solicitante_documento, "documento")}>
                      {withFallback(r.solicitante_documento, "documento")}
                    </div>
                  </div>
                </td>

                <td
                  className="py-2 px-3"
                  onDoubleClick={() => onDblClickPrioridade(r)}
                  title="Duplo clique para alternar (requer senha)"
                >
                  {r.prioridade ? (
                    <span className="inline-flex items-center px-2 py-0.5 text-xs rounded-full bg-fuchsia-500/20 text-fuchsia-300 ring-1 ring-fuchsia-400/30 whitespace-nowrap">PRIORIDADE</span>
                  ) : (
                    <span className="inline-flex items-center px-2 py-0.5 text-xs rounded-full bg-slate-500/20 text-slate-300 ring-1 ring-slate-400/30 whitespace-nowrap">Normal</span>
                  )}
                </td>

                <td className="py-2 px-3 text-center whitespace-nowrap">
                  <div className="inline-flex items-center gap-2">
                    <StatusBadge status={r.status} />
                    {canActivate ? (
                      <button
                        onClick={() => onClickAtivar(r)}
                        className="px-3 py-1.5 text-xs rounded-lg bg-emerald-600/20 text-emerald-200 ring-1 ring-emerald-400/40 hover:bg-emerald-600/30 whitespace-nowrap"
                      >
                        Ativar
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => { setPermText("Apenas TERCEIRIZADA e ADM podem ativar papeletas."); setPermModalOpen(true); }}
                        className="px-3 py-1.5 text-xs rounded-lg bg-emerald-600/10 text-emerald-300 ring-1 ring-emerald-400/20 cursor-not-allowed opacity-75 whitespace-nowrap"
                        title="Sem permissão"
                      >
                        Ativar
                      </button>
                    )}
                  </div>
                </td>

                <td className="py-2 px-3 text-center">
                  {r.pdf_ordem_path ? (
                    <button
                      onClick={() => openPrintWindow(r)}
                      className="px-3 py-1.5 text-xs rounded-lg bg-indigo-500/20 text-indigo-200 ring-1 ring-indigo-400/40 hover:bg-indigo-500/30 whitespace-nowrap"
                    >
                      Imprimir
                    </button>
                  ) : (
                    <span className="text-slate-400 text-xs">{getEmptyLabel("pdf")}</span>
                  )}
                </td>

                <td className="py-2 px-3 text-center whitespace-nowrap">{fmtDateTime(r.created_at)}</td>
                <td className="py-2 px-3 text-center"><HidrometroBadge value={r.precisa_troca_hidrometro} /></td>
              </tr>
            ))}

            {rows.length === 0 && (
              <tr>
                <td colSpan={11} className="py-6 text-center text-slate-400">
                  {getEmptyLabel("lista_vazia")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

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

      {modalAtivarSim.open && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-slate-800 p-6 rounded-xl shadow-2xl w-full max-w-md">
            <h3 className="text-lg font-semibold text-white mb-3">
              Ativar matrícula {modalAtivarSim.matricula}
            </h3>
            <div className="text-slate-300 text-sm mb-3">
              <div className="font-semibold mb-1">OBSERVAÇÃO:</div>
              <div className="whitespace-pre-wrap">{withFallback(modalAtivarSim.observacao, "observacao")}</div>
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

      {modalAtivarNao.open && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-slate-800 p-6 rounded-xl shadow-2xl w-full max-w-md">
            <h3 className="text-lg font-semibold text-white mb-3">
              Ativar matrícula {modalAtivarNao.matricula}
            </h3>
            <p className="text-slate-300 text-sm">Não é necessário informar novo hidrômetro para esta ordem.</p>
            <div className="text-slate-300 text-sm mt-3">
              <div className="font-semibold mb-1">OBSERVAÇÃO:</div>
              <div className="whitespace-pre-wrap">{withFallback(modalAtivarNao.observacao, "observacao")}</div>
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

      {modalPrioridade.open && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-slate-800 p-6 rounded-2xl shadow-2xl w-full max-w-sm">
            <h3 className="text-lg font-semibold text-white mb-2">Alterar Prioridade</h3>
            <p className="text-slate-300 text-sm mb-3">
              {modalPrioridade.atual ? "Remover prioridade desta ordem?" : "Definir prioridade para esta ordem?"}
            </p>
            <label className="block text-sm text-slate-300 mb-1">Senha do Diretor</label>
            <input
              type="password"
              value={modalPrioridade.senha ?? ""}
              onChange={(e) => setModalPrioridade((m) => ({ ...m, senha: e.target.value }))}
              onKeyDown={(e) => {
                if (e.key === "Enter") confirmarPrioridade();
              }}
              className="w-full rounded-xl bg-slate-900/60 border border-white/10 px-3 py-2 outline-none focus:ring-2 ring-fuchsia-400/40 text-white"
              placeholder="Digite a senha"
              autoFocus
            />
            <div className="mt-5 flex justify-end gap-3">
              <button
                onClick={() => setModalPrioridade({ open: false })}
                className="px-4 py-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 text-slate-200"
                disabled={!!modalPrioridade.saving}
              >
                Cancelar
              </button>
              <button
                onClick={confirmarPrioridade}
                className="px-4 py-2 rounded-lg bg-fuchsia-600 hover:bg-fuchsia-500 text-white disabled:opacity-60"
                disabled={!!modalPrioridade.saving}
              >
                {modalPrioridade.saving ? "Salvando…" : "Confirmar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
