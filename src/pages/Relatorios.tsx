// src/pages/Relatorios.tsx
import * as React from "react";
import supabase from "../lib/supabase";
import { PDFDocument, PDFPage, StandardFonts, rgb } from "pdf-lib";

/** Tipos do File System Access API (fallback para browsers sem typings) */
declare global {
  interface Window {
    showSaveFilePicker?: (options?: any) => Promise<any>;
  }
}

/** ===== Tipos ===== */
type Base = "religacao" | "corte";

type Campo = {
  id: string;
  label: string;
  db: string; // coluna no banco
  width?: string;
  align?: "left" | "center" | "right";
};

/** ===== Colunas ===== */
const CAMPOS_RELI: Campo[] = [
  { id: "matricula", label: "Matrícula", db: "matricula", width: "w-28", align: "center" },
  { id: "bairro", label: "Bairro", db: "bairro", width: "w-48" },
  { id: "rua", label: "Rua", db: "rua", width: "w-64" },
  { id: "numero", label: "Nº", db: "numero", width: "w-20", align: "center" },
  { id: "os", label: "OS", db: "os", width: "w-28", align: "center" }, // pode não existir em ordens_religacao
  { id: "ponto_referencia", label: "Ponto de referência", db: "ponto_referencia", width: "w-64" },
  { id: "telefone", label: "Telefone", db: "telefone", width: "w-40", align: "center" },
  { id: "ativa_em", label: "Ativa em", db: "ativa_em", width: "w-44", align: "center" },
];

const CAMPOS_CORTE: Campo[] = [
  { id: "matricula", label: "Matrícula", db: "matricula", width: "w-28", align: "center" },
  { id: "bairro", label: "Bairro", db: "bairro", width: "w-48" },
  { id: "rua", label: "Rua", db: "rua", width: "w-64" },
  { id: "numero", label: "Nº", db: "numero", width: "w-20", align: "center" },
  { id: "os", label: "OS", db: "os", width: "w-28", align: "center" },
  { id: "ponto_referencia", label: "Ponto de referência", db: "ponto_referencia", width: "w-64" },
  { id: "telefone", label: "Telefone", db: "telefone", width: "w-40", align: "center" },
  { id: "created_at", label: "Criado em", db: "created_at", width: "w-44", align: "center" },
];

/** ===== Status por aba ===== */
const STATUS_RELI = [
  { id: "aguardando_religacao", value: "aguardando_religacao", label: "Aguardando religação" },
  { id: "ativa", value: "ativa", label: "Ativa" },
] as const;

const STATUS_CORTE = [
  { id: "aguardando_corte", value: "aguardando_corte", label: "Aguardando corte" },
  { id: "cortada", value: "cortada", label: "Cortada" },
] as const;

/** ===== Utils ===== */
const UPPER = (v: unknown) => (v == null ? "" : String(v)).toUpperCase();
const DATE_FIELDS = new Set<string>(["created_at", "ativa_em", "cortada_em"]);

const TW_WIDTH_PX: Record<string, number> = {
  "w-20": 80,
  "w-28": 112,
  "w-40": 160,
  "w-44": 176,
  "w-48": 192,
  "w-56": 224,
  "w-64": 256,
  "w-[28rem]": 448,
};

function widthToPx(w?: string, fallback = 120): number {
  if (!w) return fallback;
  return TW_WIDTH_PX[w] ?? fallback;
}

function fmtDateTime(value: any): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function reorder(list: string[], fromId: string, toId: string) {
  const srcIdx = list.indexOf(fromId);
  const dstIdx = list.indexOf(toId);
  if (srcIdx === -1 || dstIdx === -1 || srcIdx === dstIdx) return list;
  const next = [...list];
  const movedItem = next[srcIdx];
  next.splice(srcIdx, 1);
  next.splice(dstIdx, 0, movedItem!);
  return next;
}

// normalização e variações de status
const rmDiacritics = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const canonical = (s: string) =>
  rmDiacritics(String(s ?? "").trim().toLowerCase().replace(/_/g, " ").replace(/\s+/g, " "));
function statusVariantsDB(values: string[]): string[] {
  const out = new Set<string>();
  for (const raw of values) {
    const base = String(raw ?? "").trim();
    const forms = [base, base.replace(/_/g, " "), base.replace(/\s+/g, "_")];
    for (const f of forms) {
      const f1 = f.trim();
      const variations = [
        f1,
        f1.toLowerCase(),
        f1.toUpperCase(),
        rmDiacritics(f1),
        rmDiacritics(f1).toUpperCase(),
      ];
      variations.forEach((v) => out.add(v));
    }
  }
  return Array.from(out);
}

/** Item da lista (checkbox + drag) */
function CampoRow({
  campo,
  checked,
  onToggle,
  onDragStart,
  onDragOver,
  onDrop,
}: {
  campo: Campo;
  checked: boolean;
  onToggle: () => void;
  onDragStart: (id: string) => void;
  onDragOver: (id: string, e: React.DragEvent) => void;
  onDrop: (id: string) => void;
}) {
  return (
    <label
      className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 cursor-move"
      draggable
      onDragStart={() => onDragStart(campo.id)}
      onDragOver={(e) => onDragOver(campo.id, e)}
      onDrop={() => onDrop(campo.id)}
      title="Arraste para reordenar"
    >
      <div className="flex items-center gap-3 overflow-hidden">
        <span className="text-slate-400 select-none">⠿</span>
        <span className="text-sm text-slate-200 truncate">{campo.label}</span>
      </div>
      <input type="checkbox" className="w-4 h-4" checked={checked} onChange={onToggle} />
    </label>
  );
}

/** ===== Página ===== */
export default function ReportsPage() {
  const [base, setBase] = React.useState<Base>("religacao");

  const campos: Campo[] = React.useMemo(
    () => (base === "religacao" ? CAMPOS_RELI : CAMPOS_CORTE),
    [base]
  );
  const camposMap: Record<string, Campo> = React.useMemo(() => {
    const m: Record<string, Campo> = {};
    for (const c of campos) m[c.id] = c;
    return m;
  }, [campos]);

  const [order, setOrder] = React.useState<string[]>(() => CAMPOS_RELI.map((c) => c.id));
  const [selected, setSelected] = React.useState<string[]>(() => CAMPOS_RELI.map((c) => c.id));

  const [start, setStart] = React.useState<string>("");
  const [end, setEnd] = React.useState<string>("");
  const [q, setQ] = React.useState<string>("");

  const [statusReli, setStatusReli] = React.useState<Record<string, boolean>>({
    aguardando_religacao: true,
    ativa: true,
  });
  const [statusCorte, setStatusCorte] = React.useState<Record<string, boolean>>({
    aguardando_corte: true,
    cortada: true,
  });

  const [rows, setRows] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [msg, setMsg] = React.useState<string>("");

  const [dragSrcId, setDragSrcId] = React.useState<string | null>(null);

  React.useEffect(() => {
    const ids = campos.map((c) => c.id);
    setOrder(ids);
    setSelected(ids);
    setRows([]);
  }, [base, campos]);

  const orderedSelectedIds = React.useMemo(
    () => order.filter((id) => selected.includes(id)),
    [order, selected]
  );

  const selectedCampos: Campo[] = React.useMemo(
    () =>
      orderedSelectedIds
        .map((id) => camposMap[id])
        .filter((c): c is Campo => typeof c !== "undefined"),
    [orderedSelectedIds, camposMap]
  );

  function toggleField(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }
  function handleDragStart(id: string) {
    setDragSrcId(id);
  }
  function handleDragOver(_id: string, e: React.DragEvent) {
    e.preventDefault();
  }
  function handleDrop(id: string) {
    if (!dragSrcId || dragSrcId === id) return;
    const src: string = dragSrcId;
    setOrder((prev) => reorder(prev, src, id));
    setDragSrcId(null);
  }

  // TIPAGEM EXPLÍCITA para não virar never[]
  const activeStatusValues = React.useMemo<string[]>(() => {
    if (base === "religacao") {
      return STATUS_RELI.filter((s) => statusReli[s.id]).map((s) => s.value);
    }
    return STATUS_CORTE.filter((s) => statusCorte[s.id]).map((s) => s.value);
  }, [base, statusReli, statusCorte]);

  /** ===== Helpers de consulta por status ===== */
  const toStart = (s: string) => (s ? `${s}T00:00:00` : undefined);
  const toEnd = (s: string) => (s ? `${s}T23:59:59` : undefined);
  const inList = (vals: string[]) => `(${vals.map((v) => `"${v.replace(/"/g, '\\"')}"`).join(",")})`;

  function applyQuickSearch(qb: any, availableCols: Set<string>, like: string) {
    const searchables = ["matricula", "bairro", "rua", "os"].filter((c) => availableCols.has(c));
    if (searchables.length > 0) {
      const ors = searchables.map((c) => `${c}.ilike.${like}`);
      return qb.or(ors.join(","));
    }
    return qb;
  }

  async function probeColumns(table: string): Promise<Set<string>> {
    const { data } = await supabase.from(table).select("*").limit(1);
    return new Set<string>(data && data[0] ? Object.keys(data[0]) : []);
  }

  /** ===== Prévia (por status com data correta) ===== */
  async function handleGenerate() {
    if (selectedCampos.length === 0) {
      setRows([]);
      setMsg("Selecione pelo menos um campo.");
      setTimeout(() => setMsg(""), 1500);
      return;
    }
    if (activeStatusValues.length === 0) {
      setRows([]);
      setMsg("Selecione pelo menos um status.");
      setTimeout(() => setMsg(""), 1500);
      return;
    }

    try {
      setLoading(true);
      setMsg("");

      const table = base === "corte" ? "ordens_corte" : "ordens_religacao";
      const availableCols = await probeColumns(table);

      // colunas seguras
      const wanted = selectedCampos.map((c) => c.db);
      const safeCols = wanted.filter((c) => availableCols.has(c));
      if (availableCols.has("status") && !safeCols.includes("status")) safeCols.push("status");
      if (availableCols.has("ativa_em") && !safeCols.includes("ativa_em")) safeCols.push("ativa_em");
      if (availableCols.has("cortada_em") && !safeCols.includes("cortada_em")) safeCols.push("cortada_em");
      if (availableCols.has("created_at") && !safeCols.includes("created_at")) safeCols.push("created_at");

      const ignored = wanted.filter((c) => !availableCols.has(c));
      if (ignored.length > 0) {
        setMsg(`Ignorado (não existe nesta aba): ${ignored.join(", ")}`);
        setTimeout(() => setMsg(""), 3000);
      }

      const like = q.trim() ? `%${q.trim()}%` : null;
      const startAt = toStart(start);
      const endAt = toEnd(end);
      const pick = (arr: any[] | null | undefined) => (Array.isArray(arr) ? arr : []);

      // acumulador único (evita TS2451)
      const outRows: any[] = [];
      const pushWithGroup = (arr: any[], group: string) =>
        arr.forEach((r) => outRows.push({ ...r, __group: group }));

      // ====== RELIGAÇÃO ======
      if (base === "religacao") {
        const hasAtivaEm = availableCols.has("ativa_em");
        const vAtiva = statusVariantsDB(["ativa"]);

        // ATIVA
        if (activeStatusValues.includes("ativa")) {
          let q1 = supabase.from(table).select(safeCols.join(", "));
          if (hasAtivaEm) {
            if (startAt) q1 = q1.gte("ativa_em", startAt);
            if (endAt) q1 = q1.lte("ativa_em", endAt);
          } else {
            if (startAt) q1 = q1.gte("created_at", startAt);
            if (endAt) q1 = q1.lte("created_at", endAt);
          }
          q1 = q1.in("status", vAtiva);
          if (like) q1 = applyQuickSearch(q1, availableCols, like);

          const { data, error } = await q1
            .order(hasAtivaEm ? "ativa_em" : "created_at", { ascending: false })
            .limit(1000);
          if (error) throw error;
          pushWithGroup(pick(data), "ativa");
        }

        // AGUARDANDO RELIGAÇÃO
        if (activeStatusValues.includes("aguardando_religacao")) {
          let q2 = supabase.from(table).select(safeCols.join(", "));
          if (startAt) q2 = q2.gte("created_at", startAt);
          if (endAt) q2 = q2.lte("created_at", endAt);
          if (hasAtivaEm) q2 = q2.is("ativa_em", null);
          q2 = q2.not("status", "in", inList(vAtiva));
          if (like) q2 = applyQuickSearch(q2, availableCols, like);

          const { data, error } = await q2.order("created_at", { ascending: false }).limit(1000);
          if (error) throw error;
          pushWithGroup(pick(data), "aguardando religacao");
        }
      }

      // ====== CORTE ======
      if (base === "corte") {
        const hasCortadaEm = availableCols.has("cortada_em");
        const vCortada = statusVariantsDB(["cortada"]);

        // CORTADA
        if (activeStatusValues.includes("cortada")) {
          let q1 = supabase.from(table).select(safeCols.join(", "));
          if (hasCortadaEm) {
            if (startAt) q1 = q1.gte("cortada_em", startAt);
            if (endAt) q1 = q1.lte("cortada_em", endAt);
          } else {
            if (startAt) q1 = q1.gte("created_at", startAt);
            if (endAt) q1 = q1.lte("created_at", endAt);
          }
          q1 = q1.in("status", vCortada);
          if (like) q1 = applyQuickSearch(q1, availableCols, like);

          const { data, error } = await q1
            .order(hasCortadaEm ? "cortada_em" : "created_at", { ascending: false })
            .limit(1000);
          if (error) throw error;
          pushWithGroup(pick(data), "cortada");
        }

        // AGUARDANDO CORTE
        if (activeStatusValues.includes("aguardando_corte")) {
          let q2 = supabase.from(table).select(safeCols.join(", "));
          if (startAt) q2 = q2.gte("created_at", startAt);
          if (endAt) q2 = q2.lte("created_at", endAt);
          if (hasCortadaEm) q2 = q2.is("cortada_em", null);
          q2 = q2.not("status", "in", inList(vCortada));
          if (like) q2 = applyQuickSearch(q2, availableCols, like);

          const { data, error } = await q2.order("created_at", { ascending: false }).limit(1000);
          if (error) throw error;
          pushWithGroup(pick(data), "aguardando corte");
        }
      }

      // ordenar preview: por grupo e data relevante desc
      const orderReli = ["aguardando religacao", "ativa"];
      const orderCorte = ["aguardando corte", "cortada"];
      const orderCanon = base === "religacao" ? orderReli : orderCorte;

      const getRowDate = (r: any) => {
        if (base === "religacao") return r.ativa_em ?? r.created_at ?? null;
        if (base === "corte") return r.cortada_em ?? r.created_at ?? null;
        return r.created_at ?? null;
      };

      outRows.sort((a, b) => {
        const gi = orderCanon.indexOf(String(a.__group));
        const gj = orderCanon.indexOf(String(b.__group));
        if (gi !== gj) return gi - gj;
        const da = getRowDate(a) ? new Date(getRowDate(a)).getTime() : 0;
        const db = getRowDate(b) ? new Date(getRowDate(b)).getTime() : 0;
        return db - da;
      });

      setRows(outRows);
    } catch (e: any) {
      setMsg(e?.message ?? "Falha ao gerar prévia.");
      setTimeout(() => setMsg(""), 3000);
    } finally {
      setLoading(false);
    }
  }

  /** ===== helper de quebra ===== */
  function wrapTextByWidth(font: any, text: string, fontSize: number, maxWidth: number): string[] {
    if (!text) return [""];
    const words = text.split(/\s+/g);
    const lines: string[] = [];
    let current = "";
    const fits = (s: string) => font.widthOfTextAtSize(s, fontSize) <= maxWidth;

    for (const w of words) {
      const candidate = current ? current + " " + w : w;
      if (fits(candidate)) current = candidate;
      else {
        if (current) lines.push(current);
        let chunk = w;
        while (!fits(chunk) && chunk.length > 1) {
          let cut = chunk.length - 1;
          while (cut > 1 && !fits(chunk.slice(0, cut))) cut--;
          lines.push(chunk.slice(0, cut));
          chunk = chunk.slice(cut);
        }
        current = chunk;
      }
    }
    if (current) lines.push(current);
    return lines;
  }

  /** ===== Agrupar por status (para PDF) ===== */
  type Group = { key: string; label: string; items: any[] };
  function buildGroups(allRows: any[]): Group[] {
    const orderReli = ["aguardando religacao", "ativa"];
    const orderCorte = ["aguardando corte", "cortada"];
    const order = base === "religacao" ? orderReli : orderCorte;

    const labelMap: Record<string, string> = {
      "aguardando religacao": "AGUARDANDO RELIGAÇÃO",
      "ativa": "ATIVA",
      "aguardando corte": "AGUARDANDO CORTE",
      "cortada": "CORTADA",
    };

    const groups: Group[] = [];
    for (const key of order) {
      const items = allRows.filter((r) => (r.__group ? canonical(r.__group) : "") === key);
      if (items.length > 0) groups.push({ key, label: labelMap[key] || key.toUpperCase(), items });
    }
    return groups;
  }

  /** ===== Nome sugerido do arquivo ===== */
  function suggestFilename(): string {
    const tipo = base === "religacao" ? "relatorio-religacoes" : "relatorio-cortes";
    const a = start || "inicio";
    const b = end || "fim";
    return `${tipo}-${a}-a-${b}.pdf`.replace(/[^a-zA-Z0-9._-]+/g, "_");
  }

  /** ===== Gerar e BAIXAR PDF ===== */
  async function handleDownload() {
    if (selectedCampos.length === 0) {
      setMsg("Selecione pelo menos um campo para baixar.");
      setTimeout(() => setMsg(""), 1600);
      return;
    }
    if (rows.length === 0) {
      setMsg("Gere a prévia antes de baixar.");
      setTimeout(() => setMsg(""), 1600);
      return;
    }

    // identificar cancelamento do usuário (sem fallback)
    const isAbort = (err: any) =>
      err &&
      (
        err.name === "AbortError" ||
        err.name === "NotAllowedError" ||
        err.code === 20 ||
        /aborted|abortado|cancel/i.test(String(err.message || ""))
      );

    try {
      setLoading(true);
      setMsg("");

      const TEMPLATE_PATH = "/icons/folha-timbrada.pdf";
      const resp = await fetch(encodeURI(TEMPLATE_PATH), { cache: "no-store" });
      if (!resp.ok) throw new Error(`Template não encontrado (${resp.status}) em ${TEMPLATE_PATH}`);
      const ct = (resp.headers.get("content-type") || "").toLowerCase();
      if (!ct.includes("pdf")) throw new Error(`Recurso em ${TEMPLATE_PATH} não é PDF (${ct}).`);
      const tplAb: ArrayBuffer = await resp.arrayBuffer();

      const tplDoc = await PDFDocument.load(tplAb);
      const pdfDoc = await PDFDocument.create();

      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

      const title = base === "religacao" ? "RELATÓRIO DE RELIGAÇÕES" : "RELATÓRIO DE CORTES";
      const subt = `DE ${UPPER(start || "-")} ATÉ ${UPPER(end || "-")}  —  SISTEMA DE RELIGAÇÃO E CORTE DE ÁGUA — SANEAR COLATINA`;

      // margens e respiros
      const pageMarginX = 36;
      const innerGutterX = 10;
      const pageMarginTop = 160;
      const bottomMargin = 32;
      const footerReserve = 56;
      const minY = bottomMargin + footerReserve;

      const headerHeight = 18;
      const rowLineHeight = 12;
      const groupHeaderHeight = 16;
      const cellPadX = 4;
      const cellPadY = 3;

      const fontSizeTitle = 14;
      const fontSizeSub = 10;
      const fontSizeHeader = 9.5;
      const fontSizeBody = 9;
      const fontSizeGroup = 10.5;

      const textColor = rgb(0, 0, 0);
      const gridColor = rgb(0.8, 0.82, 0.86);
      const headerBg = rgb(0.93, 0.95, 0.98);
      const groupBg = rgb(0.88, 0.91, 0.95);

      const naturalWidths = selectedCampos.map((c) => widthToPx(c.width, 120));
      const sumNatural = naturalWidths.reduce((a, b) => a + b, 0);

      const addPageWithTemplate = async (): Promise<PDFPage> => {
        const copiedPages = await pdfDoc.copyPages(tplDoc, [0]);
        const copied = copiedPages[0];
        if (!copied) throw new Error("Template PDF sem página 0.");
        pdfDoc.addPage(copied);
        return copied;
      };

      const drawTitles = (page: PDFPage, usableWidth: number, titleW: number, subtW: number) => {
        page.drawText(UPPER(title), {
          x: pageMarginX + innerGutterX + (usableWidth - titleW) / 2,
          y: page.getHeight() - pageMarginTop,
          size: fontSizeTitle,
          font: fontBold,
          color: textColor,
        });
        page.drawText(UPPER(subt), {
          x: pageMarginX + innerGutterX + (usableWidth - subtW) / 2,
          y: page.getHeight() - pageMarginTop - 18,
          size: fontSizeSub,
          font,
          color: textColor,
        });
      };

      const drawTableHeader = (
        page: PDFPage,
        colWidths: number[],
        startX: number,
        tableWidth: number,
        cursorY: number
      ) => {
        let colX = startX;

        page.drawRectangle({
          x: startX,
          y: cursorY - headerHeight + 2,
          width: tableWidth,
          height: headerHeight,
          color: headerBg,
        });

        selectedCampos.forEach((c, idx) => {
          const cw = colWidths[idx] ?? 120;
          const text = UPPER(c.label);
          const tw = fontBold.widthOfTextAtSize(text, fontSizeHeader);

        const align: "left" | "center" | "right" = c.align ?? "left";
          let dx = colX + cellPadX;
          if (align === "center") dx = colX + Math.max(cellPadX, (cw - tw) / 2);
          else if (align === "right") dx = colX + Math.max(cellPadX, cw - cellPadX - tw);

          page.drawText(text, {
            x: dx,
            y: cursorY - headerHeight + 5,
            size: fontSizeHeader,
            font: fontBold,
            color: textColor,
          });

          page.drawLine({
            start: { x: colX, y: cursorY - headerHeight + 2 },
            end: { x: colX, y: cursorY - headerHeight - 4 },
            color: gridColor,
            thickness: 0.5,
          });

          colX += cw;
        });

        page.drawLine({
          start: { x: startX, y: cursorY - headerHeight + 2 },
          end: { x: startX + tableWidth, y: cursorY - headerHeight + 2 },
          color: gridColor,
          thickness: 0.8,
        });

        return cursorY - headerHeight - 4;
      };

      const drawGroupHeader = (
        page: PDFPage,
        startX: number,
        tableWidth: number,
        cursorY: number,
        label: string
      ) => {
        page.drawRectangle({
          x: startX,
          y: cursorY - groupHeaderHeight + 2,
          width: tableWidth,
          height: groupHeaderHeight,
          color: groupBg,
        });
        const tw = fontBold.widthOfTextAtSize(label, fontSizeGroup);
        page.drawText(label, {
          x: startX + Math.max(cellPadX, (tableWidth - tw) / 2),
          y: cursorY - groupHeaderHeight + 5,
          size: fontSizeGroup,
          font: fontBold,
          color: textColor,
        });
        page.drawLine({
          start: { x: startX, y: cursorY - groupHeaderHeight + 2 },
          end: { x: startX + tableWidth, y: cursorY - groupHeaderHeight + 2 },
          color: gridColor,
          thickness: 0.8,
        });
        return cursorY - groupHeaderHeight - 6;
      };

      // primeira página
      let page: PDFPage = await addPageWithTemplate();

      const usableWidth = page.getWidth() - (pageMarginX + innerGutterX) * 2;
      const titleW = fontBold.widthOfTextAtSize(UPPER(title), fontSizeTitle);
      const subtW = font.widthOfTextAtSize(UPPER(subt), fontSizeSub);

      const scale = sumNatural > 0 ? Math.min(1, usableWidth / sumNatural) : 1;
      const colWidths = naturalWidths.map((w) => Math.floor(w * scale));
      const tableWidth = colWidths.reduce((a, b) => a + b, 0);

      drawTitles(page, usableWidth, titleW, subtW);

      const startX = pageMarginX + innerGutterX;
      let cursorY = page.getHeight() - pageMarginTop - 40;
      cursorY = drawTableHeader(page, colWidths, startX, tableWidth, cursorY);

      // grupos
      const groups = buildGroups(rows);

      for (const g of groups) {
        if (cursorY - (groupHeaderHeight + 8) < minY) {
          page = await addPageWithTemplate();
          const usableW2 = page.getWidth() - (pageMarginX + innerGutterX) * 2;
          drawTitles(page, usableW2, titleW, subtW);
          cursorY = page.getHeight() - pageMarginTop - 40;
          cursorY = drawTableHeader(page, colWidths, startX, tableWidth, cursorY);
        }
        cursorY = drawGroupHeader(page, startX, tableWidth, cursorY, `STATUS: ${g.label}`);

        for (const r of g.items) {
          const linesPerCell: string[][] = [];
          let maxLines = 1;

          selectedCampos.forEach((c, idx) => {
            const cw = (colWidths[idx] ?? 120) - cellPadX * 2;
            const raw = (r as any)[c.db];
            const value = raw == null ? "—" : DATE_FIELDS.has(c.db) ? fmtDateTime(raw) : String(raw);
            const wrapped = wrapTextByWidth(font, UPPER(value), 9, Math.max(20, cw));
            linesPerCell.push(wrapped);
            if (wrapped.length > maxLines) maxLines = wrapped.length;
          });

          const rowHeight = Math.max(rowLineHeight * maxLines + cellPadY * 2, rowLineHeight + cellPadY * 2);

          if (cursorY - rowHeight < minY) {
            page = await addPageWithTemplate();
            const usableW2 = page.getWidth() - (pageMarginX + innerGutterX) * 2;
            drawTitles(page, usableW2, titleW, subtW);
            cursorY = page.getHeight() - pageMarginTop - 40;
            cursorY = drawTableHeader(page, colWidths, startX, tableWidth, cursorY);
            if (cursorY - (groupHeaderHeight + 8) >= minY) {
              cursorY = drawGroupHeader(page, startX, tableWidth, cursorY, `STATUS: ${g.label}`);
            }
          }

          // linha superior
          page.drawLine({
            start: { x: startX, y: cursorY },
            end: { x: startX + tableWidth, y: cursorY },
            color: gridColor,
            thickness: 0.5,
          });

          // células
          let colX = startX;
          selectedCampos.forEach((c, idx) => {
            const cw = colWidths[idx] ?? 120;

            page.drawLine({
              start: { x: colX, y: cursorY },
              end: { x: colX, y: cursorY - rowHeight },
              color: gridColor,
              thickness: 0.5,
            });

            const contentLines = linesPerCell[idx] ?? [""];
            const contentWidth = cw - cellPadX * 2;
            const align: "left" | "center" | "right" = c.align ?? "left";

            let textY = cursorY - cellPadY - 12;
            contentLines.forEach((ln) => {
              const tw = font.widthOfTextAtSize(ln, 9);
              let dx = colX + cellPadX;
              if (align === "center") dx = colX + Math.max(cellPadX, (cw - tw) / 2);
              else if (align === "right") dx = colX + Math.max(cellPadX, cw - cellPadX - tw);

              page.drawText(ln, {
                x: dx,
                y: textY,
                size: 9,
                font,
                color: textColor,
                maxWidth: contentWidth,
              });
              textY -= 12;
            });

            colX += cw;
          });

          // borda direita
          page.drawLine({
            start: { x: startX + tableWidth, y: cursorY },
            end: { x: startX + tableWidth, y: cursorY - rowHeight },
            color: gridColor,
            thickness: 0.5,
          });

          cursorY -= rowHeight;
        }
      }

      // linha inferior final
      page.drawLine({
        start: { x: startX, y: cursorY },
        end: { x: startX + tableWidth, y: cursorY },
        color: gridColor,
        thickness: 0.8,
      });

      // Numeração X de Y
      const pages = pdfDoc.getPages();
      const total = pages.length;
      const pagerText = (i: number) => `${i + 1} de ${total}`;
      const pagerPadX = 4;
      const pagerY = minY + 6;

      pages.forEach((p, i) => {
        const text = pagerText(i);
        const tw = font.widthOfTextAtSize(text, 9);
        const x = p.getWidth() - (pageMarginX + innerGutterX) - pagerPadX - tw;
        p.drawText(text, { x, y: pagerY, size: 9, font, color: textColor });
      });

      // salvar bytes
      const bytes = await pdfDoc.save();

      // ArrayBuffer “puro”
      const ab =
        bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength
          ? (bytes.buffer as ArrayBuffer)
          : (bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);

      const filename = suggestFilename();

      // Preferir File System Access API (abre diálogo do sistema)
      if (typeof window.showSaveFilePicker === "function") {
        try {
          const handle = await window.showSaveFilePicker({
            suggestedName: filename,
            types: [{ description: "Documento PDF", accept: { "application/pdf": [".pdf"] } }],
          });
          const writable = await handle.createWritable();
          await writable.write(new Blob([ab], { type: "application/pdf" }));
          await writable.close();
          setMsg("PDF salvo com sucesso.");
          setTimeout(() => setMsg(""), 1800);
          return;
        } catch (err: any) {
          // Se o usuário cancelou, não fazer fallback (não baixa nada).
          if (isAbort(err)) {
            setMsg("Operação cancelada.");
            setTimeout(() => setMsg(""), 1600);
            return;
          }
          // Qualquer outro erro: cai no fallback de download automático
        }
      }

      // Fallback: download automático (para browsers sem showSaveFilePicker OU erro não-abort)
      const blob = new Blob([ab], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setMsg("Download iniciado.");
      setTimeout(() => setMsg(""), 1800);
    } catch (e: any) {
      setMsg(e?.message ?? "Falha ao gerar/baixar o PDF.");
      setTimeout(() => setMsg(""), 2200);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-6xl mx-auto w-full p-4">
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Painel esquerdo */}
        <div className="lg:col-span-1 space-y-4">
          {/* Tipo */}
          <div className="rounded-2xl bg-slate-900/60 ring-1 ring-white/10 p-4">
            <h2 className="text-slate-200 font-semibold mb-3">Tipo de relatório</h2>
            <div className="flex gap-2">
              <button
                className={`px-3 py-1.5 rounded-lg text-sm border ${
                  base === "religacao"
                    ? "bg-emerald-500/20 text-emerald-200 border-emerald-400/40"
                    : "bg-white/5 text-slate-300 border-white/10 hover:bg-white/10"
                }`}
                onClick={() => setBase("religacao")}
              >
                Religações
              </button>
              <button
                className={`px-3 py-1.5 rounded-lg text-sm border ${
                  base === "corte"
                    ? "bg-rose-600/20 text-rose-200 border-rose-400/40"
                    : "bg-white/5 text-slate-300 border-white/10 hover:bg-white/10"
                }`}
                onClick={() => setBase("corte")}
              >
                Cortes
              </button>
            </div>
          </div>

          {/* Filtros */}
          <div className="rounded-2xl bg-slate-900/60 ring-1 ring-white/10 p-4 space-y-3">
            <h3 className="text-slate-200 font-semibold">Período</h3>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="date"
                value={start}
                onChange={(e) => setStart(e.target.value)}
                className="rounded-lg bg-slate-950/60 border border-white/10 px-3 py-2 outline-none focus:ring-2 ring-emerald-400/40 text-slate-100"
              />
              <input
                type="date"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
                className="rounded-lg bg-slate-950/60 border border-white/10 px-3 py-2 outline-none focus:ring-2 ring-emerald-400/40 text-slate-100"
              />
            </div>

            {/* Status por aba */}
            <div className="space-y-2">
              <h4 className="text-slate-200 font-semibold">Status</h4>
              {base === "religacao" ? (
                <div className="flex flex-col gap-2">
                  {STATUS_RELI.map((s) => (
                    <label key={s.id} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={!!statusReli[s.id]}
                        onChange={(e) =>
                          setStatusReli((prev) => ({ ...prev, [s.id]: e.target.checked }))
                        }
                      />
                      <span className="text-slate-300 text-sm">{s.label}</span>
                    </label>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {STATUS_CORTE.map((s) => (
                    <label key={s.id} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={!!statusCorte[s.id]}
                        onChange={(e) =>
                          setStatusCorte((prev) => ({ ...prev, [s.id]: e.target.checked }))
                        }
                      />
                      <span className="text-slate-300 text-sm">{s.label}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            {/* Busca rápida */}
            <div>
              <label className="block text-sm text-slate-300 mb-1">Busca rápida</label>
              <input
                placeholder="matrícula, bairro, rua, OS…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="w-full rounded-lg bg-slate-950/60 border border-white/10 px-3 py-2 outline-none focus:ring-2 ring-emerald-400/40 text-slate-100"
              />
            </div>
          </div>

          {/* Campos (drag + check) */}
          <div className="rounded-2xl bg-slate-900/60 ring-1 ring-white/10 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-slate-200 font-semibold">Campos</h3>
              <div className="flex gap-2">
                <button className="text-xs px-2 py-1 rounded bg-white/10 hover:bg-white/20" onClick={() => setSelected([])}>
                  Limpar
                </button>
                <button className="text-xs px-2 py-1 rounded bg-white/10 hover:bg-white/20" onClick={() => setSelected(campos.map((c) => c.id))}>
                  Marcar todos
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-2 max-h-[46vh] overflow-auto pr-1">
              {order.map((id) => {
                const c = camposMap[id];
                if (!c) return null;
                return (
                  <CampoRow
                    key={c.id}
                    campo={c}
                    checked={selected.includes(c.id)}
                    onToggle={() => toggleField(c.id)}
                    onDragStart={handleDragStart}
                    onDragOver={handleDragOver}
                    onDrop={handleDrop}
                  />
                );
              })}
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleGenerate}
              className="px-4 py-2 rounded-lg bg-emerald-600/20 text-emerald-200 ring-1 ring-emerald-400/40 hover:bg-emerald-600/30"
              disabled={loading}
            >
              {loading ? "Carregando…" : "Gerar prévia"}
            </button>
            <button
              onClick={handleDownload}
              className="px-4 py-2 rounded-lg bg-indigo-600/20 text-indigo-200 ring-1 ring-indigo-400/40 hover:bg-indigo-600/30"
              disabled={loading || selectedCampos.length === 0 || rows.length === 0}
              title={rows.length === 0 ? "Gere a prévia primeiro" : "Baixar PDF"}
            >
              Baixar PDF
            </button>
          </div>

          {!!msg && (
            <div className="text-xs mt-2 px-3 py-2 rounded bg-rose-500/15 text-rose-300 border border-rose-400/30">
              {msg}
            </div>
          )}
        </div>

        {/* Prévia */}
        <div className="lg:col-span-2 space-y-4">
          <div className="rounded-2xl bg-slate-900/60 ring-1 ring-white/10 overflow-auto">
            <table className="min-w-[900px] w-max text-sm">
              <thead className="bg-white/5 text-slate-300 sticky top-0">
                <tr>
                  {selectedCampos.map((c) => (
                    <th
                      key={c.id}
                      className={`font-medium py-2 px-3 ${
                        c.align === "center" ? "text-center" : c.align === "right" ? "text-right" : "text-left"
                      }`}
                    >
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {rows.length === 0 ? (
                  <tr>
                    <td className="p-6 text-slate-400" colSpan={selectedCampos.length || 1}>
                      Selecione os <b>Status</b>, os <b>campos</b> e clique em <b>Gerar prévia</b>. Depois use <b>Baixar PDF</b>.
                    </td>
                  </tr>
                ) : (
                  rows.map((r, i) => (
                    <tr key={i} className="bg-slate-950/40">
                      {selectedCampos.map((c) => {
                        const raw = (r as any)[c.db];
                        const val = raw == null ? "—" : DATE_FIELDS.has(c.db) ? fmtDateTime(raw) : String(raw);
                        return (
                          <td
                            key={c.id}
                            className={`py-2 px-3 ${
                              c.align === "center" ? "text-center" : c.align === "right" ? "text-right" : "text-left"
                            }`}
                            title={val}
                          >
                            {val}
                          </td>
                        );
                      })}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
