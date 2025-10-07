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
  observacao: string | null;
  telefone: string | null;
  solicitante_nome: string | null;
  solicitante_documento: string | null;
  created_by?: string | null;
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

const ALLOWED_ACTIVATE = new Set(["ADM", "TERCEIRIZADA"]);

export default function PendingReconnectionsTable() {
  const [rows, setRows] = React.useState<PendRow[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [msg, setMsg] = React.useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const [filter, setFilter] = React.useState<ListFilter>({ q: "", startDate: null, endDate: null });
  const [over24h, setOver24h] = React.useState(false);

  // edição por célula (duplo clique)
  const [editing, setEditing] = React.useState<
    | { id: string; field: "bairro" | "ponto_referencia" | "telefone"; value: string }
    | { id: string; field: "rua_numero"; value: string; value2: string }
    | null
  >(null);
  const [savingCell, setSavingCell] = React.useState(false);

  const fmtDateTime = (iso: string | null) => (iso ? new Date(iso).toLocaleString("pt-BR") : getEmptyLabel("datahora"));
  const fmtTel = (t?: string | null) => withFallback(t, "telefone");

  // papel
  const [userRole, setUserRole] = React.useState<string>("VISITANTE");
  const [userId, setUserId] = React.useState<string | null>(null);
  const canActivate = React.useMemo(() => ALLOWED_ACTIVATE.has((userRole || "VISITANTE").toUpperCase()), [userRole]);

  const [permModalOpen, setPermModalOpen] = React.useState(false);
  const [permText, setPermText] = React.useState("Apenas TERCEIRIZADA e ADM podem ativar papeletas.");

  // pode editar? (ADM sempre pode; senão, apenas o criador)
  const canEditRow = React.useCallback(
    (row: PendRow) => {
      if ((userRole || "").toUpperCase() === "ADM") return true;
      return (row.created_by || null) === (userId || null);
    },
    [userRole, userId]
  );

  React.useEffect(() => {
    (async () => {
      try {
        const { data: udata, error: uerr } = await supabase.auth.getUser();
        if (uerr) throw uerr;
        const user = (udata && "user" in udata ? (udata as any).user : undefined) as { id: string } | undefined;
        if (!user) {
          setUserRole("VISITANTE");
          setUserId(null);
          return;
        }
        setUserId(user.id);
        const { data, error } = await supabase.from("app_users").select("papel").eq("id", user.id).single();
        if (error) throw error;
        setUserRole((data?.papel || "VISITANTE").toUpperCase());
      } catch {
        setUserRole("VISITANTE");
        setUserId(null);
      }
    })();
  }, []);

  // ====== carregar lista ======
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
            "observacao",
            "telefone",
            "solicitante_nome",
            "solicitante_documento",
            "created_by",
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
  React.useEffect(() => { load(); /* eslint-disable-next-line */ }, []);
  React.useEffect(() => { load(); /* eslint-disable-next-line */ }, [over24h]);

  function clearFilters() {
    setFilter({ q: "", startDate: null, endDate: null });
  }

  // ====== edição por célula (duplo clique) ======
  function startEdit(row: PendRow, field: "bairro" | "rua_numero" | "ponto_referencia" | "telefone") {
    if (!canEditRow(row)) {
      setPermText("Você não pode editar essa papeleta. Apenas o criador (ou ADM) pode editar campos.");
      setPermModalOpen(true);
      return;
    }
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
        const numero = (editing as any).value2 ? (editing as any).value2.toUpperCase().trim() : "";
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
    if (e.key === "Enter") { e.preventDefault(); saveEdit(); }
    else if (e.key === "Escape") { setEditing(null); }
  }

  // ====== ATIVAR ======
  const [confirmOpen, setConfirmOpen] = React.useState<{ open: boolean; id?: string; matricula?: string; saving?: boolean }>({
    open: false,
  });

  function onClickAtivar(row: PendRow) {
    if (!canActivate) {
      setPermText("Apenas TERCEIRIZADA e ADM podem ativar papeletas.");
      setPermModalOpen(true);
      return;
    }
    setConfirmOpen({ open: true, id: row.id, matricula: row.matricula, saving: false });
  }

  async function confirmarAtivar() {
    if (!confirmOpen.open || !confirmOpen.id) return;
    if (!canActivate) {
      setPermText("Apenas TERCEIRIZADA e ADM podem ativar papeletas.");
      setPermModalOpen(true);
      return;
    }
    try {
      setConfirmOpen((m) => ({ ...m, saving: true }));
      const { data, error } = await supabase
        .from("ordens_religacao")
        .update({ status: "ativa" })
        .eq("id", confirmOpen.id)
        .select("id,status,ativa_em")
        .single();

      if (error) {
        if (/Impedido|insufficient_privilege|permission|RLS|row-level|policy|denied/i.test(error.message)) {
          setPermText("A operação foi bloqueada pelas regras de segurança.");
          setPermModalOpen(true);
          setConfirmOpen({ open: false });
          return;
        }
        setMsg({ kind: "err", text: `Falha ao ativar: ${error.message}` });
        setTimeout(() => setMsg(null), 2200);
        setConfirmOpen({ open: false });
        return;
      }

      await load();
      setMsg({
        kind: "ok",
        text: `Papeleta ATIVADA. ${data?.ativa_em ? `(${new Date(data.ativa_em).toLocaleString("pt-BR")})` : ""}`,
      });
      setTimeout(() => setMsg(null), 1800);
      setConfirmOpen({ open: false });
    } catch (e: any) {
      setMsg({ kind: "err", text: e?.message ?? "Falha ao ativar." });
      setTimeout(() => setMsg(null), 2200);
      setConfirmOpen({ open: false });
    }
  }

  // ====== MODAL "EDITAR" (inclui troca de PDF) ======
  const [editModal, setEditModal] = React.useState<{
    open: boolean;
    saving?: boolean;
    row?: PendRow;
    form?: {
      bairro: string;
      rua: string;
      numero: string;
      ponto_referencia: string;
      telefone: string;
      newPdfFile?: File | null;
      newPdfName?: string | null;
    };
  }>({ open: false });

  const fileRef = React.useRef<HTMLInputElement | null>(null);

  function openEditModal(row: PendRow) {
    if (!canEditRow(row)) {
      setPermText("Você não pode editar essa papeleta. Apenas o criador (ou ADM) pode editar campos.");
      setPermModalOpen(true);
      return;
    }
    setEditModal({
      open: true,
      saving: false,
      row,
      form: {
        bairro: row.bairro || "",
        rua: row.rua || "",
        numero: row.numero || "",
        ponto_referencia: row.ponto_referencia || "",
        telefone: row.telefone || "",
        newPdfFile: null,
        newPdfName: null,
      },
    });
  }

  function onPickPdfClick() {
    fileRef.current?.click();
  }

  function onPdfFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] || null;
    if (!f) return;
    if (f.type !== "application/pdf") {
      setMsg({ kind: "err", text: "Selecione um arquivo PDF válido." });
      setTimeout(() => setMsg(null), 2000);
      return;
    }
    setEditModal((m) =>
      m.open && m.form
        ? { ...m, form: { ...m.form, newPdfFile: f, newPdfName: f.name } }
        : m
    );
  }

  async function salvarEditModal() {
    if (!editModal.open || !editModal.row || !editModal.form) return;
    try {
      setEditModal((m) => ({ ...m, saving: true }));
      const id = editModal.row.id;

      // monta patch de campos textuais
      const patch: Record<string, any> = {
        bairro: (editModal.form.bairro || "").toUpperCase().trim(),
        rua: (editModal.form.rua || "").toUpperCase().trim(),
        numero: (editModal.form.numero || "").toUpperCase().trim(),
        ponto_referencia: (editModal.form.ponto_referencia || "").toUpperCase().trim(),
        telefone: (editModal.form.telefone || "").toUpperCase().trim(),
      };

      // se houver novo PDF, faz upload e inclui no patch
      if (editModal.form.newPdfFile) {
        const safeMat = (editModal.row.matricula || "SEM_MATRICULA").toString().replace(/[^\w\-]+/g, "");
        const ts = Date.now();
        const path = `religacoes/${safeMat}_${id}_${ts}.pdf`;

        const { error: upErr } = await supabase
          .storage
          .from("ordens-pdfs")
          .upload(path, editModal.form.newPdfFile, { upsert: true, contentType: "application/pdf" });

        if (upErr) throw upErr;

        patch.pdf_ordem_path = path;
      }

      const { error } = await supabase.from("ordens_religacao").update(patch).eq("id", id);
      if (error) throw error;

      // atualiza estado local
      setRows((prev) =>
        prev.map((r) =>
          r.id === id ? { ...r, ...patch } : r
        )
      );

      setMsg({ kind: "ok", text: "Dados da papeleta atualizados." });
      setTimeout(() => setMsg(null), 1800);
      setEditModal({ open: false });
    } catch (e: any) {
      setMsg({ kind: "err", text: e?.message ?? "Falha ao salvar alterações." });
      setTimeout(() => setMsg(null), 2200);
      setEditModal({ open: false });
    }
  }

  // ====== impressão ======
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

    page.drawText("Observações:", { x: boxX + 12, y, size: 10, font: fontBold, color: rgb(0, 0, 0) });
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

  // colgroup
  const colWidths = React.useMemo(
    () => [
      "w-32", "w-40", "w-[320px]", "w-[300px]", "w-40",
      "w-[260px]", "w-28", "w-56", "w-32", "w-40", "w-32", // + “Editar”
    ],
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
      />

      {over24h && (
        <div className="mb-3 text-xs px-3 py-2 rounded-lg bg-rose-500/15 text-rose-300 border-rose-400/30 border">
          Filtro <strong>+24h</strong> ativo: mostrando apenas papeletas criadas há mais de 24h.
        </div>
      )}

      {msg && (
        <div className={`mb-3 text-sm px-3 py-2 rounded-lg ${
          msg.kind === "ok" ? "bg-emerald-500/15 text-emerald-300" : "bg-rose-500/15 text-rose-300"
        }`}>
          {msg.text}
        </div>
      )}

      <div className="rounded-xl ring-1 ring-white/10 max-h-[60vh] overflow-x-auto overflow-y-auto">
        <table className="min-w-[1520px] w-max text-sm table-auto">
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
              <th className="text-center font-medium py-2 px-3">Editar</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-white/10">
            {rows.map((r) => {
              const canEdit = canEditRow(r);
              return (
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
                      <div className="truncate max-w-[160px]" title={withFallback(r.bairro, "bairro")}>
                        {withFallback(r.bairro, "bairro")}
                      </div>
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

                  <td className="py-2 px-3" title="Prioridade">
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

                  <td className="py-2 px-3 text-center whitespace-nowrap">
                    <div className="inline-flex items-center gap-2">
                      <StatusBadge status={r.status} />
                      <button
                        onClick={() => onClickAtivar(r)}
                        className="px-3 py-1.5 text-xs rounded-lg bg-emerald-600/20 text-emerald-200 ring-1 ring-emerald-400/40 hover:bg-emerald-600/30 whitespace-nowrap"
                      >
                        Ativar
                      </button>
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

                  {/* COLUNA: EDITAR */}
                  <td className="py-2 px-3 text-center">
                    <button
                      onClick={() => (canEdit ? openEditModal(r) : (setPermText("Você não pode editar essa papeleta. Apenas o criador (ou ADM) pode editar campos."), setPermModalOpen(true)))}
                      className={`px-3 py-1.5 text-xs rounded-lg border whitespace-nowrap ${
                        canEdit
                          ? "bg-white/5 border-white/10 hover:bg-white/10"
                          : "bg-white/5 border-white/10 opacity-50 cursor-not-allowed"
                      }`}
                    >
                      Editar
                    </button>
                  </td>
                </tr>
              );
            })}

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

      {/* Modal de permissão */}
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

      {/* Modal confirmar ativação */}
      {confirmOpen.open && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-slate-800 p-6 rounded-2xl shadow-2xl w-full max-w-sm">
            <h3 className="text-lg font-semibold text-white mb-2">Ativar papeleta</h3>
            <p className="text-slate-300 text-sm mb-4">Confirmar ativação da matrícula <b>{confirmOpen.matricula}</b>?</p>
            <div className="mt-3 flex justify-end gap-3">
              <button
                onClick={() => setConfirmOpen({ open: false })}
                className="px-4 py-2 rounded-lg bg-white/10 border border-white/20 hover:bg-white/20 text-white text-sm"
                disabled={!!confirmOpen.saving}
              >
                Cancelar
              </button>
              <button
                onClick={confirmarAtivar}
                className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm disabled:opacity-60"
                disabled={!!confirmOpen.saving}
              >
                {confirmOpen.saving ? "Ativando…" : "Ativar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal EDITAR (com troca de PDF) */}
      {editModal.open && editModal.row && editModal.form && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-slate-800 p-6 rounded-2xl shadow-2xl w-full max-w-lg">
            <h3 className="text-lg font-semibold text-white mb-2">Editar papeleta</h3>
            <p className="text-slate-300 text-sm mb-4">
              Matrícula <b>{editModal.row.matricula}</b>
            </p>

            <div className="grid grid-cols-2 gap-3">
              <label className="text-sm text-slate-300">
                Bairro
                <input
                  value={editModal.form.bairro}
                  onChange={(e) => setEditModal((m) => m.open ? { ...m, form: { ...m.form!, bairro: e.target.value } } : m)}
                  className="mt-1 w-full rounded-md bg-slate-900/60 border border-white/10 px-2 py-1 outline-none focus:ring-2 ring-emerald-400/40"
                />
              </label>

              <label className="text-sm text-slate-300">
                Telefone
                <input
                  value={editModal.form.telefone}
                  onChange={(e) => setEditModal((m) => m.open ? { ...m, form: { ...m.form!, telefone: e.target.value } } : m)}
                  className="mt-1 w-full rounded-md bg-slate-900/60 border border-white/10 px-2 py-1 outline-none focus:ring-2 ring-emerald-400/40"
                />
              </label>

              <label className="text-sm text-slate-300 col-span-2">
                Rua
                <input
                  value={editModal.form.rua}
                  onChange={(e) => setEditModal((m) => m.open ? { ...m, form: { ...m.form!, rua: e.target.value } } : m)}
                  className="mt-1 w-full rounded-md bg-slate-900/60 border border-white/10 px-2 py-1 outline-none focus:ring-2 ring-emerald-400/40"
                />
              </label>

              <label className="text-sm text-slate-300">
                Número
                <input
                  value={editModal.form.numero}
                  onChange={(e) => setEditModal((m) => m.open ? { ...m, form: { ...m.form!, numero: e.target.value } } : m)}
                  className="mt-1 w-full rounded-md bg-slate-900/60 border border-white/10 px-2 py-1 outline-none focus:ring-2 ring-emerald-400/40"
                />
              </label>

              <label className="text-sm text-slate-300 col-span-2">
                Ponto de referência
                <input
                  value={editModal.form.ponto_referencia}
                  onChange={(e) => setEditModal((m) =>
                    m.open ? { ...m, form: { ...m.form!, ponto_referencia: e.target.value } } : m
                  )}
                  className="mt-1 w-full rounded-md bg-slate-900/60 border border-white/10 px-2 py-1 outline-none focus:ring-2 ring-emerald-400/40"
                />
              </label>

              {/* Seção de PDF */}
              <div className="col-span-2 mt-2">
                <div className="text-sm text-slate-300 mb-1">PDF da ordem</div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={onPickPdfClick}
                    className="px-3 py-1.5 text-xs rounded-lg bg-indigo-600/90 text-white hover:bg-indigo-500"
                  >
                    {editModal.form.newPdfName ? "Trocar PDF" : (editModal.row.pdf_ordem_path ? "Trocar PDF" : "Enviar PDF")}
                  </button>
                  <span className="text-xs text-slate-400 truncate max-w-[260px]">
                    {editModal.form.newPdfName
                      ? editModal.form.newPdfName
                      : (editModal.row.pdf_ordem_path || "Nenhum arquivo selecionado")}
                  </span>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="application/pdf"
                    className="hidden"
                    onChange={onPdfFileChange}
                  />
                </div>
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-3">
              <button
                onClick={() => setEditModal({ open: false })}
                className="px-4 py-2 rounded-lg bg-white/10 border border-white/20 hover:bg-white/20 text-white text-sm"
                disabled={!!editModal.saving}
              >
                Cancelar
              </button>
              <button
                onClick={salvarEditModal}
                className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm disabled:opacity-60"
                disabled={!!editModal.saving}
              >
                {editModal.saving ? "Salvando…" : "Salvar alterações"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {msg && (
        <div
          className={`fixed bottom-5 right-5 px-4 py-2 rounded-lg shadow-lg text-sm z-50 ${
            msg.kind === "ok" ? "bg-emerald-600 text-white" : "bg-rose-600 text-white"
          }`}
        >
          {msg.text}
        </div>
      )}
    </div>
  );
}
