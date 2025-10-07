// src/pages/Relatorios.tsx
import * as React from "react";
import supabase from "../lib/supabase";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

/** ===== Tipos ===== */
type Base = "religacao" | "corte";

type Campo = {
  id: string;
  label: string;
  db: string; // coluna no banco
  width?: string;
  align?: "left" | "center" | "right";
};

/** ===== Campos disponíveis ===== */
const CAMPOS_RELI: Campo[] = [
  { id: "created_at", label: "Criado em", db: "created_at", width: "w-44", align: "center" },
  { id: "ativa_em", label: "Ativa em", db: "ativa_em", width: "w-44", align: "center" },
  { id: "matricula", label: "Matrícula", db: "matricula", width: "w-28", align: "center" },
  { id: "bairro", label: "Bairro", db: "bairro", width: "w-48" },
  { id: "rua", label: "Rua", db: "rua", width: "w-64" },
  { id: "numero", label: "Nº", db: "numero", width: "w-20", align: "center" },
  { id: "ponto_referencia", label: "Ponto ref.", db: "ponto_referencia", width: "w-64" },
  { id: "telefone", label: "Telefone", db: "telefone", width: "w-40", align: "center" },
  { id: "prioridade", label: "Prioridade", db: "prioridade", width: "w-28", align: "center" },
  { id: "status", label: "Status", db: "status", width: "w-40", align: "center" },
  { id: "observacao", label: "Observação", db: "observacao", width: "w-[28rem]" },
  { id: "solicitante_nome", label: "Solicitante — Nome", db: "solicitante_nome", width: "w-64" },
  { id: "solicitante_doc", label: "Solicitante — Doc.", db: "solicitante_doc", width: "w-56", align: "center" },
];

const CAMPOS_CORTE: Campo[] = [
  { id: "created_at", label: "Criado em", db: "created_at", width: "w-44", align: "center" },
  { id: "matricula", label: "Matrícula", db: "matricula", width: "w-28", align: "center" },
  { id: "bairro", label: "Bairro", db: "bairro", width: "w-48" },
  { id: "rua", label: "Rua", db: "rua", width: "w-64" },
  { id: "numero", label: "Nº", db: "numero", width: "w-20", align: "center" },
  { id: "ponto_referencia", label: "Ponto ref.", db: "ponto_referencia", width: "w-64" },
  { id: "telefone", label: "Telefone", db: "telefone", width: "w-40", align: "center" },
  { id: "status", label: "Status", db: "status", width: "w-40", align: "center" },
  { id: "observacao", label: "Observação", db: "observacao", width: "w-[28rem]" },
];

/** ===== Utils ===== */
const UPPER = (v: unknown) => (v == null ? "" : String(v)).toUpperCase();

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

// reordenação segura
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

  // Campos e mapa por base
  const campos: Campo[] = React.useMemo(
    () => (base === "religacao" ? CAMPOS_RELI : CAMPOS_CORTE),
    [base]
  );
  const camposMap: Record<string, Campo> = React.useMemo(() => {
    const m: Record<string, Campo> = {};
    for (const c of campos) m[c.id] = c;
    return m;
  }, [campos]);

  // ordem de TODOS os campos e seleção (SEM nada marcado por padrão)
  const [order, setOrder] = React.useState<string[]>(() => CAMPOS_RELI.map((c) => c.id));
  const [selected, setSelected] = React.useState<string[]>([]);

  // quando troca a base, reseta ordem e limpa seleção
  React.useEffect(() => {
    setOrder(campos.map((c) => c.id));
    setSelected([]);
  }, [base]); // eslint-disable-line react-hooks/exhaustive-deps

  // filtros
  const [start, setStart] = React.useState<string>("");
  const [end, setEnd] = React.useState<string>("");
  const [q, setQ] = React.useState<string>("");

  // dados
  const [rows, setRows] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [msg, setMsg] = React.useState<string>("");

  // drag state
  const [dragSrcId, setDragSrcId] = React.useState<string | null>(null);

  const orderedSelectedIds = React.useMemo(
    () => order.filter((id) => selected.includes(id)),
    [order, selected]
  );

  // garante que selectedCampos NUNCA tenha undefined
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

  /** ===== Carregar prévia do Supabase ===== */
  async function handleGenerate() {
    if (selectedCampos.length === 0) {
      setRows([]);
      setMsg("Selecione pelo menos um campo.");
      setTimeout(() => setMsg(""), 1500);
      return;
    }

    try {
      setLoading(true);
      setMsg("");

      const table = base === "religacao" ? "ordens_religacao" : "ordens_corte";
      const colsDB = selectedCampos.map((c) => c.db);
      let query = supabase.from(table).select(colsDB.join(", ")).order("created_at", { ascending: false });

      if (start) query = query.gte("created_at", `${start}T00:00:00`);
      if (end) query = query.lte("created_at", `${end}T23:59:59`);
      if (q.trim()) {
        const like = `%${q.trim()}%`;
        const ors = [`matricula.ilike.${like}`, `bairro.ilike.${like}`, `rua.ilike.${like}`];
        query = query.or(ors.join(","));
      }

      const { data, error } = await query.limit(1000);
      if (error) throw error;
      setRows((data ?? []) as any[]);
    } catch (e: any) {
      setMsg(e?.message ?? "Falha ao gerar prévia.");
      setTimeout(() => setMsg(""), 2000);
    } finally {
      setLoading(false);
    }
  }

  /** ===== helpers PDF: quebra de texto, grade e alinhamento ===== */
  function wrapTextByWidth(
    font: any,
    text: string,
    fontSize: number,
    maxWidth: number
  ): string[] {
    const words = text.split(/\s+/g);
    const lines: string[] = [];
    let current = "";

    for (const w of words) {
      const candidate = current ? current + " " + w : w;
      const width = font.widthOfTextAtSize(candidate, fontSize);
      if (width <= maxWidth) {
        current = candidate;
      } else {
        if (current) lines.push(current);
        // se a palavra sozinha for maior que a largura, quebra “forçada”
        let chunk = w;
        while (font.widthOfTextAtSize(chunk, fontSize) > maxWidth && chunk.length > 1) {
          // tenta diminuir até caber
          let cut = chunk.length - 1;
          while (cut > 1 && font.widthOfTextAtSize(chunk.slice(0, cut) + "-", fontSize) > maxWidth) cut--;
          lines.push(chunk.slice(0, cut) + "-");
          chunk = chunk.slice(cut);
        }
        current = chunk;
      }
    }
    if (current) lines.push(current);
    return lines;
  }

  /** ===== Imprimir PDF (usa /icons/folha-timbrada.pdf) ===== */
  async function handlePrint() {
    if (selectedCampos.length === 0) {
      setMsg("Selecione pelo menos um campo para imprimir.");
      setTimeout(() => setMsg(""), 1600);
      return;
    }
    if (rows.length === 0) {
      setMsg("Gere a prévia antes de imprimir.");
      setTimeout(() => setMsg(""), 1600);
      return;
    }

    try {
      setLoading(true);
      setMsg("");

      // 1) Template — nome SEM espaços na pasta /public/icons
      const TEMPLATE_PATH = "/icons/folha-timbrada.pdf";
      const TEMPLATE_URL = encodeURI(TEMPLATE_PATH);

      const resp = await fetch(TEMPLATE_URL, { cache: "no-store" });
      if (!resp.ok) {
        throw new Error(`Template não encontrado (${resp.status}) em ${TEMPLATE_URL}`);
      }
      const ct = (resp.headers.get("content-type") || "").toLowerCase();
      if (!ct.includes("pdf")) {
        throw new Error(
          `O recurso em ${TEMPLATE_URL} não é PDF (content-type: ${ct}). Verifique se o arquivo está em /public/icons e sem espaços no nome.`
        );
      }

      const tplAb: ArrayBuffer = await resp.arrayBuffer();

      let pdfDoc: PDFDocument;
      try {
        pdfDoc = await PDFDocument.load(tplAb);
      } catch {
        throw new Error(
          "Falha ao abrir o template PDF (pode estar corrompido ou não ser um PDF válido). Tente reexportar o arquivo e manter sem espaços no nome."
        );
      }

      // 2) fontes
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

      // 3) títulos
      const title = base === "religacao" ? "RELATÓRIO DE RELIGAÇÕES" : "RELATÓRIO DE CORTES";
      const subt = `DE ${UPPER(start || "-")} ATÉ ${UPPER(end || "-")}  —  SISTEMA DE RELIGAÇÃO E CORTE DE ÁGUA — SANEAR COLATINA`;

      // 4) primeira página (ou cria)
      let page = pdfDoc.getPage(0) ?? pdfDoc.addPage();

      // 5) layout
      const pageMarginX = 36;
      const pageMarginTop = 140; // abaixo do timbre do template
      const pageMarginBottom = 40;

      const headerHeight = 18;
      const rowLineHeight = 12; // altura de uma linha de texto
      const cellPadX = 4;
      const cellPadY = 3;

      const fontSizeTitle = 14;
      const fontSizeSub = 10;
      const fontSizeHeader = 9.5;
      const fontSizeBody = 9;
      const textColor = rgb(0, 0, 0);
      const gridColor = rgb(0.8, 0.82, 0.86);
      const headerBg = rgb(0.93, 0.95, 0.98);

      // 6) títulos (centralizados horizontalmente na área útil)
      const usableWidth = page.getWidth() - pageMarginX * 2;
      const titleW = fontBold.widthOfTextAtSize(UPPER(title), fontSizeTitle);
      const subtW = font.widthOfTextAtSize(UPPER(subt), fontSizeSub);
      page.drawText(UPPER(title), {
        x: pageMarginX + (usableWidth - titleW) / 2,
        y: page.getHeight() - pageMarginTop,
        size: fontSizeTitle,
        font: fontBold,
        color: textColor,
      });
      page.drawText(UPPER(subt), {
        x: pageMarginX + (usableWidth - subtW) / 2,
        y: page.getHeight() - pageMarginTop - 18,
        size: fontSizeSub,
        font,
        color: textColor,
      });

      // 7) calcular larguras escaladas para caber na página
      const naturalWidths = selectedCampos.map((c) => widthToPx(c.width, 120));
      const sumNatural = naturalWidths.reduce((a, b) => a + b, 0);
      const scale = sumNatural > 0 ? Math.min(1, usableWidth / sumNatural) : 1;
      const colWidths = naturalWidths.map((w) => Math.floor(w * scale));

      const startX = pageMarginX;
      let cursorY = page.getHeight() - pageMarginTop - 40;

      function drawTableHeader(currentPage: any) {
        // fundo do header
        let colX = startX;
        currentPage.drawRectangle({
          x: startX,
          y: cursorY - headerHeight + 2,
          width: colWidths.reduce((a, b) => a + b, 0),
          height: headerHeight,
          color: headerBg,
          opacity: 1,
        });

        // textos do header
        selectedCampos.forEach((c, idx) => {
          const cw = colWidths[idx] ?? 120;
          const text = UPPER(c.label);
          const tw = fontBold.widthOfTextAtSize(text, fontSizeHeader);
          let dx = colX + cellPadX;
          if (c.align === "center" || !c.align) {
            dx = colX + Math.max(cellPadX, (cw - tw) / 2);
          } else if (c.align === "right") {
            dx = colX + Math.max(cellPadX, cw - cellPadX - tw);
          }
          currentPage.drawText(text, {
            x: dx,
            y: cursorY - headerHeight + 5,
            size: fontSizeHeader,
            font: fontBold,
            color: textColor,
          });
          // linhas verticais
          currentPage.drawLine({
            start: { x: colX, y: cursorY - headerHeight + 2 },
            end: { x: colX, y: cursorY - headerHeight + 2 - 6 }, // pequeno traço
            color: gridColor,
            thickness: 0.5,
          });
          colX += cw;
        });
        // borda embaixo do header
        currentPage.drawLine({
          start: { x: startX, y: cursorY - headerHeight + 2 },
          end: { x: startX + colWidths.reduce((a, b) => a + b, 0), y: cursorY - headerHeight + 2 },
          color: gridColor,
          thickness: 0.8,
        });

        cursorY -= headerHeight + 4;
      }

      function newPageWithHeader() {
        page = pdfDoc.addPage();
        // títulos novamente
        page.drawText(UPPER(title), {
          x: pageMarginX + (usableWidth - titleW) / 2,
          y: page.getHeight() - pageMarginTop,
          size: fontSizeTitle,
          font: fontBold,
          color: textColor,
        });
        page.drawText(UPPER(subt), {
          x: pageMarginX + (usableWidth - subtW) / 2,
          y: page.getHeight() - pageMarginTop - 18,
          size: fontSizeSub,
          font,
          color: textColor,
        });
        cursorY = page.getHeight() - pageMarginTop - 40;
        drawTableHeader(page);
      }

      // header inicial
      drawTableHeader(page);

      const minY = pageMarginBottom;

      // desenha linhas com quebra de texto e grade
      for (const r of rows) {
        // 1) para cada coluna, quebrar texto e descobrir altura necessária
        const linesPerCell: string[][] = [];
        let maxLines = 1;

        selectedCampos.forEach((c, idx) => {
          const cw = (colWidths[idx] ?? 120) - cellPadX * 2;
          const raw = (r as any)[c.db];
          const value =
            raw == null
              ? "—"
              : c.db.endsWith("_at")
              ? new Date(raw).toLocaleString("pt-BR")
              : String(raw);

          const wrapped = wrapTextByWidth(font, UPPER(value), fontSizeBody, Math.max(20, cw));
          linesPerCell.push(wrapped);
          if (wrapped.length > maxLines) maxLines = wrapped.length;
        });

        const rowHeight = Math.max(rowLineHeight * maxLines + cellPadY * 2, rowLineHeight + cellPadY * 2);

        // 2) quebra de página se necessário
        if (cursorY - rowHeight < minY) {
          newPageWithHeader();
        }

        // 3) fundo e grade horizontal da linha
        page.drawLine({
          start: { x: startX, y: cursorY },
          end: { x: startX + colWidths.reduce((a, b) => a + b, 0), y: cursorY },
          color: gridColor,
          thickness: 0.5,
        });

        // 4) desenhar cada célula
        let colX = startX;
        selectedCampos.forEach((c, idx) => {
          const cw = colWidths[idx] ?? 120;
          // borda vertical da célula
          page.drawLine({
            start: { x: colX, y: cursorY },
            end: { x: colX, y: cursorY - rowHeight },
            color: gridColor,
            thickness: 0.5,
          });

          const contentLines = linesPerCell[idx];
          const contentWidth = cw - cellPadX * 2;

          // alinhar horizontalmente cada linha
          let textY = cursorY - cellPadY - rowLineHeight; // primeira linha
          contentLines.forEach((ln) => {
            const tw = font.widthOfTextAtSize(ln, fontSizeBody);
            let dx = colX + cellPadX;
            const align: "left" | "center" | "right" = c.align || "center"; // default centralizado
            if (align === "center") {
              dx = colX + Math.max(cellPadX, (cw - tw) / 2);
            } else if (align === "right") {
              dx = colX + Math.max(cellPadX, cw - cellPadX - tw);
            }
            page.drawText(ln, {
              x: dx,
              y: textY,
              size: fontSizeBody,
              font,
              color: textColor,
              maxWidth: contentWidth,
            });
            textY -= rowLineHeight;
          });

          colX += cw;
        });

        // borda final direita da linha
        page.drawLine({
          start: { x: startX + colWidths.reduce((a, b) => a + b, 0), y: cursorY },
          end: { x: startX + colWidths.reduce((a, b) => a + b, 0), y: cursorY - rowHeight },
          color: gridColor,
          thickness: 0.5,
        });

        // 5) avança cursor
        cursorY -= rowHeight;
      }

      // linha inferior da tabela
      page.drawLine({
        start: { x: startX, y: cursorY },
        end: { x: startX + colWidths.reduce((a, b) => a + b, 0), y: cursorY },
        color: gridColor,
        thickness: 0.8,
      });

      // 9) salva e IMPRIME (sem download)
      const bytes = await pdfDoc.save(); // Uint8Array
      const ab =
        bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength
          ? (bytes.buffer as ArrayBuffer)
          : (bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
      const blob = new Blob([new Uint8Array(ab)], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);

      // iframe oculto para acionar print()
      const iframe = document.createElement("iframe");
      iframe.style.position = "fixed";
      iframe.style.right = "0";
      iframe.style.bottom = "0";
      iframe.style.width = "0";
      iframe.style.height = "0";
      iframe.style.border = "0";
      iframe.src = url;
      document.body.appendChild(iframe);

      iframe.onload = () => {
        try {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
        } finally {
          setTimeout(() => {
            URL.revokeObjectURL(url);
            document.body.removeChild(iframe);
          }, 1000);
        }
      };
    } catch (e: any) {
      setMsg(e?.message ?? "Falha ao gerar/abrir o PDF.");
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

            <div>
              <label className="block text-sm text-slate-300 mb-1">Busca rápida</label>
              <input
                placeholder="matrícula, bairro, rua…"
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
                <button
                  className="text-xs px-2 py-1 rounded bg-white/10 hover:bg-white/20"
                  onClick={() => setSelected([])}
                >
                  Limpar
                </button>
                <button
                  className="text-xs px-2 py-1 rounded bg-white/10 hover:bg-white/20"
                  onClick={() => setSelected(campos.map((c) => c.id))}
                >
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
              onClick={handlePrint}
              className="px-4 py-2 rounded-lg bg-indigo-600/20 text-indigo-200 ring-1 ring-indigo-400/40 hover:bg-indigo-600/30"
              disabled={loading || selectedCampos.length === 0 || rows.length === 0}
              title={rows.length === 0 ? "Gere a prévia primeiro" : "Imprimir PDF"}
            >
              Imprimir PDF
            </button>
          </div>

          {!!msg && (
            <div className="text-xs mt-2 px-3 py-2 rounded bg-rose-500/15 text-rose-300 border border-rose-400/30">
              {msg}
            </div>
          )}
        </div>

        {/* Prévia (direita) */}
        <div className="lg:col-span-2 space-y-4">
          <div className="rounded-2xl bg-slate-900/60 ring-1 ring-white/10 overflow-auto">
            <table className="min-w-[900px] w-max text-sm">
              <thead className="bg-white/5 text-slate-300 sticky top-0">
                <tr>
                  {selectedCampos.map((c) => (
                    <th
                      key={c.id}
                      className={`font-medium py-2 px-3 ${c.align === "center" ? "text-center" : c.align === "right" ? "text-right" : "text-left"}`}
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
                      Selecione os campos e clique em <b>Gerar prévia</b>. Depois use <b>Imprimir PDF</b>.
                    </td>
                  </tr>
                ) : (
                  rows.map((r, i) => (
                    <tr key={i} className="bg-slate-950/40">
                      {selectedCampos.map((c) => {
                        const raw = (r as any)[c.db];
                        const val =
                          raw == null
                            ? "—"
                            : c.db.endsWith("_at")
                            ? new Date(raw).toLocaleString("pt-BR")
                            : String(raw);
                        return (
                          <td
                            key={c.id}
                            className={`py-2 px-3 ${c.align === "center" ? "text-center" : c.align === "right" ? "text-right" : "text-left"}`}
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
