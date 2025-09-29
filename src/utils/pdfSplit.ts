
import { PDFDocument } from "pdf-lib";

// Tipagem leve para o global do PDF.js carregado via CDN
declare global {
  interface Window {
    pdfjsLib?: any;
  }
}

export type HalfKind = "TOP" | "BOTTOM";

export interface SplitOptions {
  /** Proporção vertical de corte (0.5 = 50%/50%). Padrão: 0.5 */
  cutRatio?: number;
  /** Escala de renderização do PDF.js (2 é um bom equilíbrio). Padrão: 2 */
  scale?: number;
}

export interface HalfPageResult {
  /** Nome do arquivo de origem (para referência) */
  origemArquivo: string;
  /** Índice da página (0-based) no PDF original */
  pageIndex: number;
  /** Metade da página (TOP ou BOTTOM) */
  half: HalfKind;

  /** Largura em pixels da imagem gerada para a metade */
  width: number;
  /** Altura em pixels da imagem gerada para a metade */
  height: number;

  /** Pré-visualização em dataURL (PNG) */
  previewDataUrl: string;

  /** PDF (1 página) contendo somente esta metade */
  pdfBytes: Uint8Array;

  /** Itens de texto do PDF.js (para eventual extração de metadados) */
  textItems: any[];
}

/** CDN do PDF.js (versão estável e leve) */
const CDN_PDFJS = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.2.67/pdf.min.js";
const CDN_PDFJS_WORKER =
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.2.67/pdf.worker.min.js";

/**
 * Garante que PDF.js esteja carregado (via CDN) e retorna a instância pdfjsLib.
 */
export async function ensurePdfJs(): Promise<any> {
  if (window.pdfjsLib) return window.pdfjsLib;

  await new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = CDN_PDFJS;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Falha ao carregar PDF.js (CDN)."));
    document.head.appendChild(s);
  });

  const pdfjsLib = window.pdfjsLib!;
  pdfjsLib.GlobalWorkerOptions.workerSrc = CDN_PDFJS_WORKER;
  return pdfjsLib;
}

/**
 * Renderiza uma página do PDF em um canvas com PDF.js.
 */
export async function renderPdfPageToCanvas(
  pdfjsLib: any,
  fileBytes: Uint8Array,
  pageIndex: number,
  scale = 2
): Promise<{ canvas: HTMLCanvasElement; width: number; height: number; textItems: any[] }> {
  const loadingTask = pdfjsLib.getDocument({ data: fileBytes });
  const pdf = await loadingTask.promise;
  const page = await pdf.getPage(pageIndex + 1);

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

/**
 * Converte um canvas para PNG (bytes).
 */
export async function canvasToPngBytes(cnv: HTMLCanvasElement): Promise<Uint8Array> {
  return new Promise<Uint8Array>((resolve) => {
    cnv.toBlob((blob) => {
      if (!blob) return resolve(new Uint8Array());
      const fr = new FileReader();
      fr.onload = () => resolve(new Uint8Array(fr.result as ArrayBuffer));
      fr.readAsArrayBuffer(blob);
    }, "image/png");
  });
}

/**
 * Cria um PDF de 1 página a partir de um PNG (bytes).
 */
export async function pngToSinglePagePdf(pngBytes: Uint8Array): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const pngImage = await pdf.embedPng(pngBytes);
  const page = pdf.addPage([pngImage.width, pngImage.height]);
  page.drawImage(pngImage, {
    x: 0,
    y: 0,
    width: pngImage.width,
    height: pngImage.height,
  });
  return pdf.save();
}

/**
 * Divide um PDF (bytes) em metades por página (topo/baixo).
 * Retorna uma lista de resultados contendo preview + PDF individual de cada metade.
 */
export async function splitPdfBytesToHalves(
  fileName: string,
  fileBytes: Uint8Array,
  options: SplitOptions = {}
): Promise<HalfPageResult[]> {
  const { cutRatio = 0.5, scale = 2 } = options;

  const pdfjs = await ensurePdfJs();
  const loadingTask = pdfjs.getDocument({ data: fileBytes });
  const pdf = await loadingTask.promise;

  const results: HalfPageResult[] = [];

  for (let p = 0; p < pdf.numPages; p++) {
    const { canvas, width, height, textItems } = await renderPdfPageToCanvas(
      pdfjs,
      fileBytes,
      p,
      scale
    );

    // Cria canvases para as metades
    const topHeight = Math.floor(height * cutRatio);
    const botHeight = Math.ceil(height * (1 - cutRatio));

    const topCanvas = document.createElement("canvas");
    topCanvas.width = width;
    topCanvas.height = topHeight;
    const ctxTop = topCanvas.getContext("2d")!;
    ctxTop.drawImage(canvas, 0, 0, width, topHeight, 0, 0, width, topHeight);

    const bottomCanvas = document.createElement("canvas");
    bottomCanvas.width = width;
    bottomCanvas.height = botHeight;
    const ctxBottom = bottomCanvas.getContext("2d")!;
    ctxBottom.drawImage(
      canvas,
      0,
      topHeight,
      width,
      botHeight,
      0,
      0,
      width,
      botHeight
    );

    // Converte para PNG e depois para PDF
    const topPng = await canvasToPngBytes(topCanvas);
    const botPng = await canvasToPngBytes(bottomCanvas);
    const topPdf = await pngToSinglePagePdf(topPng);
    const botPdf = await pngToSinglePagePdf(botPng);

    results.push({
      origemArquivo: fileName,
      pageIndex: p,
      half: "TOP",
      width,
      height: topHeight,
      previewDataUrl: topCanvas.toDataURL("image/png"),
      pdfBytes: topPdf,
      textItems,
    });

    results.push({
      origemArquivo: fileName,
      pageIndex: p,
      half: "BOTTOM",
      width,
      height: botHeight,
      previewDataUrl: bottomCanvas.toDataURL("image/png"),
      pdfBytes: botPdf,
      textItems,
    });
  }

  return results;
}

/**
 * Divide um arquivo File (do input) em metades por página.
 */
export async function splitPdfFileToHalves(
  file: File,
  options?: SplitOptions
): Promise<HalfPageResult[]> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  return splitPdfBytesToHalves(file.name, bytes, options);
}
