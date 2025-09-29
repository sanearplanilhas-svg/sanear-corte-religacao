import * as React from "react";
import supabase from "../../lib/supabase";
import ListFilterBar, { ListFilter } from "../../components/filters/ListFilterBar";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

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
  solicitante_nome?: string | null;
  solicitante_documento?: string | null;
  telefone?: string | null;
  precisa_troca_hidrometro?: boolean | null; // <- novo
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

// normalização
const norm = (s?: string | null) =>
  (s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString("pt-BR") : getEmptyLabel("datahora"));
const fmtOrDash = (iso: string | null) => (iso ? new Date(iso).toLocaleString("pt-BR") : "-"); // <- para “Ativa em”
const fmtTel = (t?: string | null) => withFallback(t, "telefone");

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

const ALLOWED_DELETE = new Set(["ADM", "DIRETOR", "COORDENADOR"]);

export default function AllReconnectionsTable() {
  const [rows, setRows] = React.useState<ReligRow[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [msg, setMsg] = React.useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const [filter, setFilter] = React.useState<ListFilter>({ q: "", startDate: null, endDate: null });
  const [statusFilter, setStatusFilter] = React.useState<StatusFilter>("all");
  const [over24h, setOver24h] = React.useState(false);

  const [userRole, setUserRole] = React.useState<string>("VISITANTE");
  const canDelete = React.useMemo(
    () => ALLOWED_DELETE.has((userRole || "VISITANTE").toUpperCase()),
    [userRole]
  );

  const [permModalOpen, setPermModalOpen] = React.useState(false);
  const [permText, setPermText] = React.useState("Apenas ADM, DIRETOR e COORDENADOR podem excluir papeletas.");

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

  // ====== Delete em lote ======
  const [deleteMode, setDeleteMode] = React.useState(false);
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());
  const [confirmDeleteOpen, setConfirmDeleteOpen] = React.useState(false);

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function guardedToggleDeleteMode() {
    if (!canDelete) {
      setPermText("Apenas ADM, DIRETOR e COORDENADOR podem excluir papeletas.");
      setPermModalOpen(true);
      return;
    }
    setDeleteMode((v) => !v);
    setSelectedIds(new Set());
  }

  function askConfirmBulkDelete() {
    if (!canDelete) {
      setPermText("Apenas ADM, DIRETOR e COORDENADOR podem excluir papeletas.");
      setPermModalOpen(true);
      return;
    }
    if (selectedIds.size === 0) {
      setMsg({ kind: "err", text: "Nenhuma papeleta selecionada para excluir." });
      setTimeout(() => setMsg(null), 2200);
      return;
    }
    setConfirmDeleteOpen(true);
  }

  async function handleBulkDeletePerform() {
    if (!canDelete) return;
    const ids = Array.from(selectedIds);
    const { error } = await supabase.from("ordens_religacao").delete().in("id", ids);
    if (error) {
      if (/Impedido|insufficient_privilege|permission|RLS|row-level|policy|denied/i.test(error.message)) {
        setPermText("A operação foi bloqueada pelas regras de segurança.");
        setPermModalOpen(true);
      } else {
        setMsg({ kind: "err", text: `Falha ao excluir: ${error.message}` });
        setTimeout(() => setMsg(null), 2200);
      }
      return;
    }
    setRows((prev) => prev.filter((r) => !selectedIds.has(r.id)));
    setSelectedIds(new Set());
    setDeleteMode(false);
    setConfirmDeleteOpen(false);
    setMsg({ kind: "ok", text: "Papeletas excluídas com sucesso." });
    setTimeout(() => setMsg(null), 1800);
  }

  // ====== Carregar ======
  async function load() {
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
          "ativa_em",
          "created_at",
          "observacao",
          "solicitante_nome",
          "solicitante_documento",
          "telefone",
          "precisa_troca_hidrometro", // <- novo
        ].join(", ")
      );

    if ((filter.q || "").trim() !== "") {
      const q = (filter.q || "").trim();
      query = query.or(
        `matricula.ilike.%${q}%,bairro.ilike.%${q}%,rua.ilike.%${q}%,telefone.ilike.%${q}%,solicitante_nome.ilike.%${q}%,solicitante_documento.ilike.%${q}%`
      );
    }

    if (over24h) {
      const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      query = query.lte("created_at", cutoff);
    } else {
      if (filter.startDate) query = query.gte("ativa_em", `${filter.startDate}T00:00:00`);
      if (filter.endDate) query = query.lte("ativa_em", `${filter.endDate}T23:59:59`);
    }

    query = query.order("created_at", { ascending: false });

    const { data, error } = await query;
    if (error) {
      setMsg({ kind: "err", text: error.message });
      setTimeout(() => setMsg(null), 2200);
    } else {
      setRows(((data || []) as unknown) as ReligRow[]);
    }
    setLoading(false);
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

  const filteredRows = React.useMemo(() => {
    if (statusFilter === "all") return rows;
    return rows.filter((r) => {
      const s = norm(r.status);
      if (statusFilter === "liberacao_pendente") return s === "liberacao pendente";
      if (statusFilter === "aguardando") return s === "aguardando religacao" || s.startsWith("aguardando");
      if (statusFilter === "ativa") return s === "ativa" || s === "ativo";
      return true;
    });
  }, [rows, statusFilter]);

  // ---------- util: extrai nº do hidrômetro da observação ----------
  function extractNovoHidrometro(obs?: string | null): string | undefined {
    if (!obs) return undefined;
    const m = obs.match(/NOVO HIDR[ÔO]METRO:\s*([^\s|]+.*?)(?=$|\s*\|)/i);
    return m && m[1] ? m[1].trim() : undefined;
  }

  // ---------- IMPRESSÃO (carimbo no PDF) ----------
  async function openStampedPdf(info: {
    pdfUrl: string;
    solicitante: string;
    documento: string;
    telefone: string;
    pontoRef: string;
    criadaEm: string;
    observacoes: string;
  }) {
    const win = window.open("", "_blank", "width=1024,height=768");
    try {
      if (win) (win as any).opener = null;
    } catch {}

    const ab: ArrayBuffer = await fetch(info.pdfUrl).then((r) => r.arrayBuffer());
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

    const LINE_H = 12;
    const SIZE = 10;
    const SIZE_TITLE = 12;
    const MARGIN = 36;
    const PAD = 10;

    function wrap(text: string, maxWidth: number, fnt: any, size: number): string[] {
      const words = (text || "").split(/\s+/);
      const lines: string[] = [];
      let cur = "";
      for (const w of words) {
        const maybe = cur ? cur + " " + w : w;
        const wid = fnt.widthOfTextAtSize(maybe, size);
        if (wid <= maxWidth) {
          cur = maybe;
        } else {
          if (cur) lines.push(cur);
          if (fnt.widthOfTextAtSize(w, size) > maxWidth) {
            let buf = "";
            for (const ch of w) {
              const test = buf + ch;
              if (fnt.widthOfTextAtSize(test, size) > maxWidth) {
                if (buf) lines.push(buf);
                buf = ch;
              } else {
                buf = test;
              }
            }
            cur = buf;
          } else {
            cur = w;
          }
        }
      }
      if (cur) lines.push(cur);
      return lines.length ? lines : [""];
    }

    const maxBoxW = Math.min(440, width - MARGIN * 2);
    const boxX = (width - maxBoxW) / 2;

    const fixedItems = [
      { label: "Solicitante", value: info.solicitante },
      { label: "Documento", value: info.documento },
      { label: "Telefone", value: info.telefone },
      { label: "Ponto ref.", value: info.pontoRef },
      { label: "Criada em", value: info.criadaEm },
    ];

    const labelW = fontBold.widthOfTextAtSize("Documento:", SIZE);
    const sep = 8;
    const valueW = maxBoxW - PAD - labelW - sep - PAD;

    const prepared = fixedItems.map((it) => ({
      ...it,
      lines: wrap(it.value, valueW, font, SIZE),
    }));

    const title = "DADOS DO SOLICITANTE";
    const titleBlockH = SIZE_TITLE + 6;

    let obsLines = wrap(info.observacoes, valueW, font, SIZE);

    const fixedLines = prepared.reduce((a, it) => a + it.lines.length, 0);
    const LINE_PAD_AFTER_TITLE = 10;
    let boxH =
      PAD + titleBlockH + LINE_PAD_AFTER_TITLE + (fixedLines + 1 + obsLines.length) * LINE_H + PAD;

    const maxBoxH = height - MARGIN * 2;
    if (boxH > maxBoxH) {
      const rest =
        maxBoxH -
        (PAD + titleBlockH + LINE_PAD_AFTER_TITLE + fixedLines * LINE_H + PAD + LINE_H /* label Obs. */);
      const maxObsLines = Math.max(0, Math.floor(rest / LINE_H));
      if (obsLines.length > maxObsLines) {
        obsLines = obsLines.slice(0, Math.max(0, maxObsLines));
        if (obsLines.length > 0) {
          const lastIdx = obsLines.length - 1;
          obsLines[lastIdx] = obsLines[lastIdx]!.replace(/.*$/, "") + " …";
        }
      }
      boxH =
        PAD + titleBlockH + LINE_PAD_AFTER_TITLE + (fixedLines + 1 + obsLines.length) * LINE_H + PAD;
    }

    const boxY = (height - boxH) / 2;

    page.drawRectangle({
      x: boxX,
      y: boxY,
      width: maxBoxW,
      height: boxH,
      color: rgb(1, 1, 1),
      opacity: 0.96,
      borderColor: rgb(0.85, 0.88, 0.92),
      borderWidth: 1,
    });

    page.drawText(title, {
      x: boxX + PAD,
      y: boxY + boxH - (SIZE_TITLE + 4),
      size: SIZE_TITLE,
      font: fontBold,
      color: rgb(0, 0, 0),
    });

    let y = boxY + boxH - (SIZE_TITLE + 4) - LINE_PAD_AFTER_TITLE;
    for (const it of prepared) {
      page.drawText(it.label + ":", {
        x: boxX + PAD,
        y: y - SIZE,
        size: SIZE,
        font: fontBold,
        color: rgb(0, 0, 0),
      });
      let vy = y - SIZE;
      for (const line of it.lines) {
        page.drawText(line, {
          x: boxX + PAD + labelW + sep,
          y: vy,
          size: SIZE,
          font,
          color: rgb(0, 0, 0),
        });
        vy -= LINE_H;
      }
      y -= Math.max(LINE_H, it.lines.length * LINE_H);
    }

    page.drawText("Observações:", {
      x: boxX + PAD,
      y: y - SIZE,
      size: SIZE,
      font: fontBold,
      color: rgb(0, 0, 0),
    });

    let oy = y - SIZE;
    for (const line of obsLines) {
      page.drawText(line, {
        x: boxX + PAD + labelW + sep,
        y: oy,
        size: SIZE,
        font,
        color: rgb(0, 0, 0),
      });
      oy -= LINE_H;
    }

    const bytes = await pdfDoc.save();
    const abuf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    const blob = new Blob([abuf], { type: "application/pdf" });
    const blobUrl = URL.createObjectURL(blob);

    if (win) {
      win.location.href = blobUrl;
    } else {
      window.open(blobUrl, "_blank", "noopener,noreferrer");
    }
  }

  function renderImprimirCell(row: ReligRow) {
    const s = norm(row.status);
    const isPendente = s === "liberacao pendente";
    if (!row.pdf_ordem_path) return withFallback(null, "pdf");

    const { data } = supabase.storage.from("ordens-pdfs").getPublicUrl(row.pdf_ordem_path);
    const url = data?.publicUrl;

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

    return (
      <button
        type="button"
        onClick={() =>
          setModalPrint({
            open: true,
            matricula: row.matricula,
            telefone: row.telefone ?? null,
            solicitanteNome: row.solicitante_nome ?? null,
            solicitanteDoc: row.solicitante_documento ?? null,
            observacao: row.observacao ?? null,
            pdfUrl: url ?? null,
          })
        }
        className="px-3 py-1.5 text-xs rounded-lg bg-indigo-500/20 text-indigo-200 ring-1 ring-indigo-400/40 hover:bg-indigo-500/30 whitespace-nowrap"
        title="Visualizar dados e abrir PDF"
      >
        Imprimir
      </button>
    );
  }

  // ---------- regra para a coluna “Número do Hidrômetro” ----------
  function numeroHidrometroText(r: ReligRow): string {
    const needSwap = r.precisa_troca_hidrometro;
    if (needSwap === false) return "MANTIDO HIDRÔMETRO";
    if (needSwap === true) {
      if (!r.ativa_em) return "-";
      const num = extractNovoHidrometro(r.observacao);
      return num ? num : "-";
    }
    // quando não informado
    return "-";
  }

  // Larguras das colunas (sem “Observação”)
  const colWidths = React.useMemo(() => {
    const arr: string[] = [];
    if (deleteMode) arr.push("w-10"); // checkbox
    arr.push(
      "w-32",        // matrícula
      "w-40",        // bairro
      "w-[320px]",   // rua e nº
      "w-[300px]",   // ponto ref
      "w-36",        // telefone
      "w-[260px]",   // solicitante
      "w-28",        // prioridade
      "w-48",        // status
      "w-28",        // pdf
      "w-40",        // criado em
      "w-40",        // ativa em
      "w-48",        // nº hidrômetro
    );
    return arr;
  }, [deleteMode]);

  const colEls = React.useMemo(() => colWidths.map((cls, i) => <col key={i} className={cls} />), [colWidths]);

  // ==== Modais auxiliares ====
  const [modalBloqueio, setModalBloqueio] = React.useState<{ open: boolean; matricula?: string }>({ open: false });

  const [modalPrint, setModalPrint] = React.useState<{
    open: boolean;
    matricula?: string;
    telefone?: string | null;
    solicitanteNome?: string | null;
    solicitanteDoc?: string | null;
    observacao?: string | null;
    pdfUrl?: string | null;
  }>({ open: false });

  return (
    <div className="rounded-2xl bg-slate-900/50 ring-1 ring-white/10 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div>
          <h3 className="font-semibold">Todas as papeletas</h3>
          <p className="text-slate-400 text-sm">Lista completa das papeletas de religação.</p>
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
              onClick={() => setStatusFilter("liberacao_pendente")}
              className={`px-3 py-1.5 text-xs rounded-lg ${
                statusFilter === "liberacao_pendente" ? "bg-white/10" : "hover:bg-white/5"
              }`}
            >
              Liberação Pendente
            </button>
            <button
              onClick={() => setStatusFilter("aguardando")}
              className={`px-3 py-1.5 text-xs rounded-lg ${statusFilter === "aguardando" ? "bg-white/10" : "hover:bg-white/5"}`}
            >
              Aguardando Religação
            </button>
            <button
              onClick={() => setStatusFilter("ativa")}
              className={`px-3 py-1.5 text-xs rounded-lg ${statusFilter === "ativa" ? "bg-white/10" : "hover:bg-white/5"}`}
            >
              Ativa
            </button>
          </div>

          <button
            type="button"
            onClick={() => setOver24h((v) => !v)}
            className={`px-3 py-1.5 rounded-lg border text-xs ${
              over24h
                ? "bg-rose-600 text-white border-rose-500 hover:bg-rose-500"
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
        onClear={() => {
          clearFilters();
          setTimeout(load, 0);
        }}
        deletable={canDelete}
        deleteMode={deleteMode}
        selectedCount={selectedIds.size}
        onToggleDeleteMode={guardedToggleDeleteMode}
        onConfirmDelete={askConfirmBulkDelete}
      />

      {over24h && (
        <div className="mb-3 text-xs px-3 py-2 rounded-lg bg-rose-500/15 text-rose-300 border border-rose-400/30">
          Filtro <strong>+24h</strong> ativo: mostrando apenas papeletas criadas há mais de 24h.
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

      {/* >>> Container com rolagem vertical e horizontal */}
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

              <th
                className={`py-2 px-3 font-medium text-center sticky z-30 bg-slate-900/95 backdrop-blur border-r border-white/10 ${
                  deleteMode ? "left-10" : "left-0"
                }`}
              >
                Matrícula
              </th>

              <th className="text-left font-medium py-2 px-3">Bairro</th>
              <th className="text-left font-medium py-2 px-3">Rua e nº</th>
              <th className="text-left font-medium py-2 px-3">Ponto ref.</th>
              <th className="text-left font-medium py-2 px-3">Telefone</th>
              <th className="text-left font-medium py-2 px-3">Solicitante</th>
              <th className="text-left font-medium py-2 px-3">Prioridade</th>
              <th className="text-center font-medium py-2 px-3">Status</th>
              <th className="text-center font-medium py-2 px-3">Ordem (PDF)</th>
              <th className="text-center font-medium py-2 px-3">Criado em</th>
              <th className="text-center font-medium py-2 px-3">Ativa em</th>
              <th className="text-center font-medium py-2 px-3">Número do Hidrômetro</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-white/10">
            {filteredRows.map((r) => {
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
                  <td
                    className={`py-2 px-3 font-mono whitespace-nowrap text-center sticky z-10 bg-slate-950/80 backdrop-blur border-r border-white/10 ${
                      deleteMode ? "left-10" : "left-0"
                    }`}
                  >
                    {r.matricula}
                  </td>

                  <td className="py-2 px-3">
                    <div className="truncate max-w-[160px]" title={withFallback(r.bairro, "bairro")}>
                      {withFallback(r.bairro, "bairro")}
                    </div>
                  </td>

                  <td className="py-2 px-3">
                    <div
                      className="truncate max-w-[280px]"
                      title={`${withFallback(r.rua, "rua")}, ${withFallback(r.numero, "numero")}`}
                    >
                      {withFallback(r.rua, "rua")}, {withFallback(r.numero, "numero")}
                    </div>
                  </td>

                  <td className="py-2 px-3">
                    <div className="truncate max-w-[260px]" title={withFallback(r.ponto_referencia, "ponto_referencia")}>
                      {withFallback(r.ponto_referencia, "ponto_referencia")}
                    </div>
                  </td>

                  {/* Telefone */}
                  <td className="py-2 px-3 whitespace-nowrap">{fmtTel(r.telefone)}</td>

                  {/* Solicitante */}
                  <td className="py-2 px-3">
                    <div className="max-w-[240px]">
                      <div className="truncate font-medium" title={withFallback(r.solicitante_nome, "solicitante")}>
                        {withFallback(r.solicitante_nome, "solicitante")}
                      </div>
                      <div
                        className="truncate text-xs text-slate-400"
                        title={withFallback(r.solicitante_documento, "documento")}
                      >
                        {withFallback(r.solicitante_documento, "documento")}
                      </div>
                    </div>
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

                  <td className="py-2 px-3 text-center whitespace-nowrap">
                    <StatusBadge status={r.status} />
                  </td>

                  <td className="py-2 px-3 text-center">{renderImprimirCell(r)}</td>

                  <td className="py-2 px-3 text-center whitespace-nowrap">{fmt(r.created_at)}</td>
                  <td className="py-2 px-3 text-center whitespace-nowrap">{fmtOrDash(r.ativa_em)}</td>

                  <td className="py-2 px-3 text-center whitespace-nowrap">{numeroHidrometroText(r)}</td>
                </tr>
              );
            })}

            {filteredRows.length === 0 && (
              <tr>
                <td colSpan={deleteMode ? 13 : 12} className="py-6 text-center text-slate-400">
                  {withFallback(null, "lista_vazia")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ==== Modais ==== */}

      {/* Confirmação de exclusão (recolocado) */}
      {confirmDeleteOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-slate-800 p-6 rounded-xl shadow-2xl w-full max-w-sm text-center">
            <h3 className="text-lg font-semibold text-white mb-2">Excluir papeletas selecionadas?</h3>
            <p className="text-slate-300 text-sm">
              Você está prestes a excluir <strong>{selectedIds.size}</strong> item(ns). Essa ação não pode ser desfeita.
            </p>
            <div className="mt-5 flex justify-center gap-3">
              <button
                onClick={() => setConfirmDeleteOpen(false)}
                className="px-4 py-2 rounded-lg bg-white/10 border border-white/20 hover:bg-white/20 text-white"
              >
                Cancelar
              </button>
              <button
                onClick={handleBulkDeletePerform}
                className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white"
              >
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Impressão bloqueada */}
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
              <button
                onClick={() => setModalBloqueio({ open: false })}
                className="px-4 py-2 rounded-lg bg-white/10 border border-white/20 hover:bg-white/20 text-white"
              >
                Ok, entendi
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal do botão Imprimir (dados + abrir PDF carimbado) */}
      {modalPrint.open && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-slate-800 p-6 rounded-xl shadow-2xl w-full max-w-lg">
            <h3 className="text-lg font-semibold text-white mb-2">
              Dados para impressão — Matrícula {modalPrint.matricula}
            </h3>

            <div className="mt-3 space-y-2 text-sm text-slate-200">
              <div><span className="text-slate-400">Solicitante: </span>{withFallback(modalPrint.solicitanteNome, "solicitante")}</div>
              <div><span className="text-slate-400">Documento: </span>{withFallback(modalPrint.solicitanteDoc, "documento")}</div>
              <div><span className="text-slate-400">Telefone: </span>{fmtTel(modalPrint.telefone)}</div>
              <div className="pt-2">
                <div className="text-slate-400">Observações:</div>
                <div className="mt-1 whitespace-pre-wrap">{withFallback(modalPrint.observacao, "observacao")}</div>
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-3">
              <button
                onClick={() => setModalPrint({ open: false })}
                className="px-4 py-2 rounded-lg bg-white/10 border border-white/20 hover:bg-white/20 text-white"
              >
                Fechar
              </button>

              <button
                disabled={!modalPrint.pdfUrl}
                onClick={() => {
                  const url = modalPrint.pdfUrl;
                  if (!url) return;
                  openStampedPdf({
                    pdfUrl: url,
                    solicitante: withFallback(modalPrint.solicitanteNome, "solicitante"),
                    documento: withFallback(modalPrint.solicitanteDoc, "documento"),
                    telefone: fmtTel(modalPrint.telefone),
                    pontoRef: withFallback(
                      rows.find(r => r.matricula === modalPrint.matricula)?.ponto_referencia,
                      "ponto_referencia"
                    ),
                    criadaEm: fmt(
                      rows.find(r => r.matricula === modalPrint.matricula)?.created_at ?? null
                    ),
                    observacoes: withFallback(modalPrint.observacao, "observacao"),
                  });
                }}
                className={`px-4 py-2 rounded-lg ${modalPrint.pdfUrl ? "bg-indigo-600 hover:bg-indigo-500" : "bg-slate-600 opacity-60 cursor-not-allowed"} text-white`}
                title={modalPrint.pdfUrl ? "Abrir PDF carimbado" : "PDF não disponível"}
              >
                Abrir PDF
              </button>
            </div>
          </div>
        </div>
      )}

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
