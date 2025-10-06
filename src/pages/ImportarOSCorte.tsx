// src/pages/ImportarOSCorte.tsx
// -------------------------------------------------------------
// Importador de OS de Corte (PDF com 2 ordens por página)
// - Divide cada página em TOP/BOTTOM
// - PREENCHE automaticamente "Ligação" de cada metade:
//     1) Texto PDF (pdf.js) -> acha "Ligação" e atribui à metade
//     2) OCR (fallback) na região superior-direita de cada metade,
//        carregando Tesseract.js via CDN (sem import local)
// - Visualização: **UMA matrícula por vez** (revisão sequencial)
//   • Salvar (marca e avança)   • Excluir (pula)
//   • Anterior/Próxima para navegação manual
// - Clique na imagem abre o PDF (sem download)
// - Exporta apenas as matrículas "salvas" (pasta/ZIP)
// - Modal de carregamento com progresso
// -------------------------------------------------------------

import React, { useCallback, useMemo, useState } from "react";
import JSZip from "jszip";
import { saveAs } from "file-saver";
import { PDFDocument } from "pdf-lib";
import pdfjsLib from "../utils/pdfjs";

declare global {
  interface Window {
    showDirectoryPicker?: any;
    Tesseract?: any; // injetado via CDN quando OCR é necessário
  }
}

type HalfKind = "TOP" | "BOTTOM";

type OrdemItem = {
  id: string;
  origemArquivo: string;
  pageIndex: number;
  half: HalfKind;
  width: number;
  height: number;
  ligacao?: string;
  previewDataUrl?: string;
  pdfBytes?: Uint8Array;
  suggestedName: string;
  selected: boolean;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const sanitizeFilename = (input: string) =>
  input.trim().replace(/[\\/:*?"<>|]/g, "_").replace(/\s+/g, "_").slice(0, 180);

const onlyDigits = (s: string) => s.replace(/\D+/g, "");
const norm = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

// ---------- PDF helpers ----------
const RENDER_SCALE = 3.2;

async function renderPdfPageToCanvasFromDoc(
  pdfDoc: any,
  pageIndex: number,
  scale = RENDER_SCALE
): Promise<{ canvas: HTMLCanvasElement; width: number; height: number; textItems: any[] }> {
  const page = await pdfDoc.getPage(pageIndex + 1);
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  await page.render({ canvasContext: ctx, viewport }).promise;
  const textContent = await page.getTextContent();
  const textItems = textContent.items || [];
  return { canvas, width: canvas.width, height: canvas.height, textItems };
}

async function pngToSinglePagePdf(pngBytes: Uint8Array): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const pngImage = await pdf.embedPng(pngBytes);
  const page = pdf.addPage([pngImage.width, pngImage.height]);
  page.drawImage(pngImage, { x: 0, y: 0, width: pngImage.width, height: pngImage.height });
  return pdf.save();
}

async function canvasToPngBytes(cnv: HTMLCanvasElement): Promise<Uint8Array> {
  return new Promise<Uint8Array>((resolve) => {
    cnv.toBlob((blob) => {
      if (!blob) return resolve(new Uint8Array());
      const fr = new FileReader();
      fr.onload = () => resolve(new Uint8Array(fr.result as ArrayBuffer));
      fr.readAsArrayBuffer(blob);
    }, "image/png");
  });
}

// ---------- Tokens / linhas ----------
type Tok = { x: number; y: number; str: string; norm: string };
type Line = { y: number; xMin: number; xMax: number; text: string; normText: string };

function buildTokens(textItems: any[]): Tok[] {
  return (textItems as any[]).map((it: any) => {
    const tr = it.transform || [1, 0, 0, 1, 0, 0];
    const x = Number(tr[4] ?? 0);
    const y = Number(tr[5] ?? 0);
    const str = String(it.str ?? "");
    return { x, y, str, norm: norm(str) };
  });
}

function groupLines(toks: Tok[], lineTol = 6): Line[] {
  const lines: { y: number; items: Tok[] }[] = [];
  for (const t of toks) {
    if (!t) continue;
    let found = false;
    for (const ln of lines) {
      if (Math.abs(ln.y - t.y) <= lineTol) {
        ln.items.push(t);
        ln.y = (ln.y * (ln.items.length - 1) + t.y) / ln.items.length;
        found = true;
        break;
      }
    }
    if (!found) lines.push({ y: t.y, items: [t] });
  }
  return lines
    .map((ln) => {
      ln.items.sort((a, b) => a.x - b.x);
      const text = ln.items.map((i) => i.str).join(" ").replace(/\s+/g, " ").trim();
      const normText = norm(text);
      const xMin = Math.min(...ln.items.map((i) => i.x));
      const xMax = Math.max(...ln.items.map((i) => i.x));
      return { y: ln.y, xMin, xMax, text, normText };
    })
    .sort((a, b) => a.y - b.y);
}

// ========== Estratégia 1: Texto PDF (global na página) ==========
function findLigacoesOnPage(textItems: any[]): Array<{ y: number; x: number; value: string }> {
  const toks = (textItems as any[]).map((it: any) => {
    const tr = it.transform || [1, 0, 0, 1, 0, 0];
    const x = Number(tr[4] ?? 0);
    const y = Number(tr[5] ?? 0);
    return { x, y, str: String(it.str ?? "") };
  }) as { x: number; y: number; str: string }[];

  const out: Array<{ y: number; x: number; value: string }> = [];
  const N = toks.length;

  for (let i = 0; i < N; i++) {
    const t = toks[i];
    if (!t) continue;
    const s = norm(t.str);
    if (!/\bliga[cç][aã]o\b:?/.test(s) && !/^lig\.?$/.test(s)) continue;

    const lineTol = 7;
    let best: { y: number; x: number; value: string } | null = null;

    for (let j = 0; j < N; j++) {
      const u = toks[j];
      if (!u) continue;
      if (Math.abs(u.y - t.y) > lineTol) continue;
      if (u.x <= t.x) continue;

      const m = u.str.match(/([0-9]{3,})/);
      if (m && m[1]) {
        const val = m[1];
        if (!best || u.x < best.x) best = { y: t.y, x: u.x, value: val };
      }
    }

    if (!best) {
      const m2 = t.str.match(/lig[aã]?[cç]?[aã]o\s*[:\-]?\s*([0-9]{3,})/i);
      if (m2 && m2[1]) best = { y: t.y, x: t.x, value: m2[1] };
    }
    if (best) out.push(best);
  }
  out.sort((a, b) => a.y - b.y || a.x - b.x);
  return out;
}

function assignLigacoesToHalves(
  candidates: Array<{ y: number; x: number; value: string }>,
  height: number,
  cutRatio: number
): { top?: string; bottom?: string } {
  if (candidates.length === 0) return {};
  const topCenterDown = (cutRatio * height) / 2;
  const bottomCenterDown = cutRatio * height + ((1 - cutRatio) * height) / 2;

  const map = (getY: (c: { y: number }) => number) => {
    let top: string | undefined;
    let bottom: string | undefined;
    let topCost = Infinity;
    let bottomCost = Infinity;

    for (const c of candidates) {
      const y = getY(c);
      const dTop = Math.abs(y - topCenterDown);
      const dBottom = Math.abs(y - bottomCenterDown);
      if (dTop <= dBottom) {
        if (dTop < topCost) {
          topCost = dTop;
          top = c.value;
        }
      } else {
        if (dBottom < bottomCost) {
          bottomCost = dBottom;
          bottom = c.value;
        }
      }
    }
    const cost =
      (isFinite(topCost) ? topCost : 1e9) + (isFinite(bottomCost) ? bottomCost : 1e9);
    return { top, bottom, cost };
  };

  const down = map((c) => c.y);
  const up = map((c) => height - c.y);
  return down.cost <= up.cost ? { top: down.top, bottom: down.bottom } : { top: up.top, bottom: up.bottom };
}

// ========== Estratégia 2: OCR via CDN (sem import local) ==========
async function lazyLoadTesseract(): Promise<any | undefined> {
  if (window.Tesseract) return window.Tesseract;
  const src = "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js";
  await new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Falha ao carregar Tesseract.js"));
    document.head.appendChild(s);
  }).catch(() => {});
  return window.Tesseract;
}

async function ocrDigitsFromHalfCanvas(
  halfCanvas: HTMLCanvasElement
): Promise<string | undefined> {
  const w = halfCanvas.width;
  const h = halfCanvas.height;
  // ROI: faixa superior-direita (ajuste fino conforme seu layout)
  const ROI = {
    x0: Math.floor(w * 0.58),
    y0: Math.floor(h * 0.08),
    x1: Math.floor(w * 0.98),
    y1: Math.floor(h * 0.55),
  };
  const roiW = Math.max(16, ROI.x1 - ROI.x0);
  const roiH = Math.max(16, ROI.y1 - ROI.y0);

  const roi = document.createElement("canvas");
  roi.width = roiW;
  roi.height = roiH;
  const ctx = roi.getContext("2d")!;
  ctx.drawImage(halfCanvas, ROI.x0, ROI.y0, roiW, roiH, 0, 0, roiW, roiH);

  // upscale leve para OCR
  const scale = 1.3;
  const scaled = document.createElement("canvas");
  scaled.width = Math.floor(roiW * scale);
  scaled.height = Math.floor(roiH * scale);
  const sctx = scaled.getContext("2d")!;
  sctx.imageSmoothingEnabled = true;
  sctx.drawImage(roi, 0, 0, scaled.width, scaled.height);

  const T = await lazyLoadTesseract();
  if (!T?.recognize) return undefined;

  try {
    const { data } = await T.recognize(scaled, "eng", {
      tessedit_char_whitelist: "0123456789",
    });
    const words: any[] = data?.words || [];
    let best: { text: string; conf: number } | null = null;
    for (const w of words) {
      const txt = onlyDigits(String(w.text || ""));
      if (txt.length >= 3) {
        const conf = Number((w as any).confidence ?? (w as any).conf ?? 0);
        if (!best || conf > best.conf || (conf === best.conf && txt.length > best.text.length)) {
          best = { text: txt, conf };
        }
      }
    }
    if (best) return best.text;

    const raw = onlyDigits(String(data?.text || ""));
    if (raw.length >= 3) return raw;
  } catch (e) {
    console.warn("OCR error:", e);
  }
  return undefined;
}

// ---------- Nome do arquivo ----------
const makeName = (it: OrdemItem) =>
  sanitizeFilename(`LIG_${it.ligacao ?? "X"}_${it.half === "TOP" ? "T" : "B"}_p${it.pageIndex + 1}.pdf`);

// ---------- TS helper ----------
function toArrayBuffer(u8: Uint8Array): ArrayBuffer {
  const ab = new ArrayBuffer(u8.byteLength);
  new Uint8Array(ab).set(u8);
  return ab;
}

// ---------- Modal ----------
function LoadingModal({
  open,
  phase, // "loading" | "done"
  total,
  processed,
  onClose,
}: {
  open: boolean;
  phase: "loading" | "done";
  total: number;
  processed: number;
  onClose: () => void;
}) {
  if (!open) return null;
  const pct = total > 0 ? Math.round((processed / total) * 100) : 0;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-2xl border bg-white p-6 shadow-xl">
        {phase === "loading" ? (
          <>
            <h2 className="text-lg font-semibold mb-2">Carregando arquivos…</h2>
            <p className="text-sm text-slate-600 mb-4">Dividindo páginas e detectando as ligações…</p>
            <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
              <div className="h-full bg-blue-600 transition-all" style={{ width: `${pct}%` }} />
            </div>
            <div className="mt-2 text-xs text-slate-500">
              {processed} / {total} páginas processadas
            </div>
          </>
        ) : (
          <>
            <h2 className="text-lg font-semibold mb-2">Pronto!</h2>
            <p className="text-sm text-slate-600 mb-4">Arquivos importados e matrículas geradas com sucesso.</p>
            <button onClick={onClose} className="px-4 py-2 rounded bg-blue-600 text-white">OK</button>
          </>
        )}
      </div>
    </div>
  );
}

// ---------- Componente ----------
export default function ImportarOSCorte() {
  const [cutRatio, setCutRatio] = useState<number>(0.5);
  const [processing, setProcessing] = useState(false);
  const [items, setItems] = useState<OrdemItem[]>([]);
  const [curIdx, setCurIdx] = useState(0); // índice do item atual
  const [loadingOpen, setLoadingOpen] = useState(false);
  const [loadingPhase, setLoadingPhase] = useState<"loading" | "done">("loading");
  const [pagesTotal, setPagesTotal] = useState(0);
  const [pagesProcessed, setPagesProcessed] = useState(0);

  // Importar
  const onFilesSelected = useCallback(
    async (files: FileList | null) => {
      if (!files?.length) return;
      setProcessing(true);
      setItems([]);
      setCurIdx(0);
      setLoadingOpen(true);
      setLoadingPhase("loading");
      setPagesProcessed(0);

      try {
        // total de páginas (para a barra)
        let total = 0;
        for (const file of Array.from(files)) {
          const u8 = new Uint8Array(await file.arrayBuffer());
          const doc = await pdfjsLib.getDocument({ data: u8 }).promise;
          total += doc.numPages;
          try { doc.cleanup?.(); doc.destroy?.(); } catch {}
        }
        setPagesTotal(total);

        const newItems: OrdemItem[] = [];
        let processed = 0;

        for (const file of Array.from(files)) {
          const u8 = new Uint8Array(await file.arrayBuffer());
          const doc = await pdfjsLib.getDocument({ data: u8 }).promise;

          for (let p = 0; p < doc.numPages; p++) {
            const { canvas, width, height, textItems } = await renderPdfPageToCanvasFromDoc(doc, p, RENDER_SCALE);

            // 1) TEXTO PDF (global) -> atribui a TOP/BOTTOM pela posição Y
            const candidates = findLigacoesOnPage(textItems);
            const assigned = assignLigacoesToHalves(candidates, height, cutRatio);
            let ligTopText = assigned.top;
            let ligBottomText = assigned.bottom;

            // 2) Split visual (canvases de cada metade)
            const topCanvas = document.createElement("canvas");
            topCanvas.width = width;
            topCanvas.height = Math.floor(height * cutRatio);
            topCanvas.getContext("2d")!.drawImage(
              canvas, 0, 0, width, Math.floor(height * cutRatio),
              0, 0, width, Math.floor(height * cutRatio)
            );

            const bottomCanvas = document.createElement("canvas");
            bottomCanvas.width = width;
            bottomCanvas.height = Math.ceil(height * (1 - cutRatio));
            bottomCanvas.getContext("2d")!.drawImage(
              canvas, 0, Math.floor(height * cutRatio), width, Math.ceil(height * (1 - cutRatio)),
              0, 0, width, Math.ceil(height * (1 - cutRatio))
            );

            // 3) Fallback OCR na região de cada metade (carrega via CDN)
            let ligTop = ligTopText;
            if (!ligTop) ligTop = await ocrDigitsFromHalfCanvas(topCanvas);
            let ligBottom = ligBottomText;
            if (!ligBottom) ligBottom = await ocrDigitsFromHalfCanvas(bottomCanvas);

            // 4) Gera PDFs e previews
            const topPdf = await pngToSinglePagePdf(await canvasToPngBytes(topCanvas));
            const botPdf = await pngToSinglePagePdf(await canvasToPngBytes(bottomCanvas));

            newItems.push({
              id: `${file.name}-p${p + 1}-T`,
              origemArquivo: file.name,
              pageIndex: p,
              half: "TOP",
              width,
              height: topCanvas.height,
              ligacao: ligTop ?? "",
              previewDataUrl: topCanvas.toDataURL("image/png"),
              pdfBytes: topPdf,
              suggestedName: "",
              selected: false,
            });
            newItems.push({
              id: `${file.name}-p${p + 1}-B`,
              origemArquivo: file.name,
              pageIndex: p,
              half: "BOTTOM",
              width,
              height: bottomCanvas.height,
              ligacao: ligBottom ?? "",
              previewDataUrl: bottomCanvas.toDataURL("image/png"),
              pdfBytes: botPdf,
              suggestedName: "",
              selected: false,
            });

            processed++;
            setPagesProcessed(processed);
            await sleep(1);
          }

          try { doc.cleanup?.(); doc.destroy?.(); } catch {}
        }

        setItems(newItems);
        setLoadingPhase("done");
      } finally {
        setProcessing(false);
      }
    },
    [cutRatio]
  );

  // Navegação
  const goPrev = () => setCurIdx((i) => Math.max(0, i - 1));
  const goNext = () => setCurIdx((i) => Math.min(items.length - 1, i + 1));

  // Ações (sequenciais)
  const handleSaveCurrent = () =>
    setItems((prev) => {
      if (!prev.length) return prev;
      const idx = curIdx;
      const it = prev[idx];
      if (!it?.ligacao?.trim()) {
        alert("Informe a Ligação antes de salvar.");
        return prev;
      }
      const arr = prev.map((item, i) =>
        i === idx ? { ...item, selected: true, suggestedName: makeName({ ...item }) } : item
      );
      // avança
      setCurIdx((i) => Math.min(arr.length - 1, i + 1));
      return arr;
    });

  const handleExcludeCurrent = () =>
    setItems((prev) => {
      if (!prev.length) return prev;
      const idx = curIdx;
      const arr = prev.map((item, i) => (i === idx ? { ...item, selected: false } : item));
      // avança
      setCurIdx((i) => Math.min(arr.length - 1, i + 1));
      return arr;
    });

  const updateLigacaoCurrent = (value: string) =>
    setItems((prev) => {
      if (!prev.length) return prev;
      const idx = curIdx;
      const arr = prev.map((item, i) =>
        i === idx ? { ...item, ligacao: onlyDigits(value) } : item
      );
      return arr;
    });

  // Abrir PDF (sem download)
  const openPdf = (idx: number) => {
    const it = items[idx];
    if (!it?.pdfBytes) return;
    const blob = new Blob([toArrayBuffer(it.pdfBytes)], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank", "noopener,noreferrer");
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  };

  const savedCount = useMemo(() => items.filter((i) => i.selected).length, [items]);
  const current = items[curIdx];

  // Exportações
  const saveToFolder = useCallback(async () => {
    const sel = items.filter((i) => i.selected && i.pdfBytes);
    if (!sel.length) return alert("Nenhuma matrícula salva.");
    if (!window.showDirectoryPicker) return alert("Navegador não suporta salvar em pasta.");
    const dir = await window.showDirectoryPicker();
    for (const it of sel) {
      const name = it.suggestedName || makeName(it);
      // @ts-ignore
      const file = await dir.getFileHandle(name, { create: true });
      const w = await file.createWritable();
      await w.write(it.pdfBytes!);
      await w.close();
    }
    alert("Arquivos salvos!");
  }, [items]);

  const downloadZip = useCallback(async () => {
    const sel = items.filter((i) => i.selected && i.pdfBytes);
    if (!sel.length) return alert("Nenhuma matrícula salva.");
    const zip = new JSZip();
    sel.forEach((i) => zip.file(i.suggestedName || makeName(i), i.pdfBytes!));
    const blob = await zip.generateAsync({ type: "blob" });
    saveAs(blob, `ordens_corte_${new Date().toISOString().slice(0, 10)}.zip`);
  }, [items]);

  // ---------- JSX ----------
  return (
    <div className="p-6 max-w-7xl mx-auto">
      <LoadingModal
        open={loadingOpen}
        phase={loadingPhase}
        total={pagesTotal}
        processed={pagesProcessed}
        onClose={() => setLoadingOpen(false)}
      />

      <h1 className="text-2xl font-semibold mb-2">Importar OS de corte (PDF)</h1>
      <p className="text-sm text-slate-600 mb-4">
        Revise <strong>uma matrícula por vez</strong>. A <em>Ligação</em> já vem preenchida. Clique na imagem para abrir o PDF.
      </p>

      {/* Barra de ações */}
      <div className="rounded-lg border p-4 mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-4 flex-wrap">
          <input type="file" accept="application/pdf" multiple onChange={(e) => onFilesSelected(e.target.files)} disabled={processing} />
          <label className="text-sm">
            Linha de corte:{" "}
            <input
              type="range"
              min={35}
              max={65}
              value={Math.round(cutRatio * 100)}
              onChange={(e) => setCutRatio(Number(e.target.value) / 100)}
              disabled={processing}
            />{" "}
            {Math.round(cutRatio * 100)}% / {100 - Math.round(cutRatio * 100)}%
          </label>
        </div>

        <div className="flex items-center gap-2">
          <button
            className="px-3 py-2 rounded bg-blue-600 text-white disabled:opacity-50"
            onClick={saveToFolder}
            disabled={processing || savedCount === 0}
            title="Salvar diretamente numa pasta do seu PC (Chrome/Edge)"
          >
            Salvar em pasta
          </button>
          <button
            className="px-3 py-2 rounded bg-emerald-600 text-white disabled:opacity-50"
            onClick={downloadZip}
            disabled={processing || savedCount === 0}
          >
            Baixar tudo (.zip)
          </button>
          <button
            className="px-3 py-2 rounded bg-slate-200"
            onClick={() => {
              setItems([]);
              setCurIdx(0);
              setPagesProcessed(0);
              setPagesTotal(0);
            }}
            disabled={processing}
          >
            Limpar
          </button>
        </div>
      </div>

      {/* Status geral */}
      <div className="text-xs text-slate-500 mb-4">
        {processing
          ? "Processando…"
          : `Total: ${items.length} | Salvas: ${savedCount} | ${
              items.length ? `Item ${curIdx + 1} de ${items.length}` : "nenhuma matrícula"
            }`}
      </div>

      {/* Visualização UNA POR VEZ */}
      {current ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Preview grande */}
          <div className="lg:col-span-9">
            <div className="rounded-xl overflow-hidden border bg-slate-900/40">
              <div className="p-2 bg-slate-900/60 text-xs text-slate-400">
                {current.origemArquivo} · pág {current.pageIndex + 1} · {current.half} ·{" "}
                {current.selected ? (
                  <span className="text-emerald-400">SALVA</span>
                ) : (
                  <span className="text-amber-400">NÃO SALVA</span>
                )}
              </div>
              <button
                type="button"
                onClick={() => openPdf(curIdx)}
                className="w-full max-h-[90vh] min-h-[70vh] grid place-items-center bg-black/30"
                title="Clique para abrir o PDF"
              >
                {current.previewDataUrl ? (
                  <img
                    src={current.previewDataUrl}
                    alt="preview"
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <div className="p-10 text-slate-400">Sem preview</div>
                )}
              </button>
            </div>
          </div>

          {/* Form + controles */}
          <div className="lg:col-span-3 space-y-4">
            <div className="rounded-xl border p-4 bg-slate-900/40">
              <div className="mb-3">
                <label className="text-xs text-slate-400">Ligação</label>
                <input
                  className={`mt-1 w-full border rounded px-3 py-2 text-base ${current.ligacao ? "" : "border-rose-400"}`}
                  value={current.ligacao ?? ""}
                  onChange={(e) => updateLigacaoCurrent(e.target.value)}
                  placeholder="ligação"
                />
              </div>

              <div className="flex gap-2">
                <button
                  onClick={handleSaveCurrent}
                  className="flex-1 px-3 py-2 rounded bg-emerald-600 text-white"
                >
                  Salvar (e próxima)
                </button>
                <button
                  onClick={handleExcludeCurrent}
                  className="px-3 py-2 rounded bg-rose-600 text-white"
                >
                  Excluir (pular)
                </button>
              </div>
            </div>

            <div className="rounded-xl border p-3 bg-slate-900/40 flex items-center justify-between">
              <button
                onClick={goPrev}
                className="px-3 py-2 rounded bg-slate-700 text-white disabled:opacity-50"
                disabled={curIdx === 0}
              >
                ⟵ Anterior
              </button>
              <div className="text-sm text-slate-300">
                {curIdx + 1} / {items.length}
              </div>
              <button
                onClick={goNext}
                className="px-3 py-2 rounded bg-slate-700 text-white disabled:opacity-50"
                disabled={curIdx >= items.length - 1}
              >
                Próxima ⟶
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="text-sm text-slate-500">Nenhuma matrícula selecionada.</div>
      )}

      <div className="text-xs text-slate-500 mt-4">
        Apenas as matrículas <strong>salvas</strong> entram no ZIP ou na pasta.
      </div>
    </div>
  );
}
