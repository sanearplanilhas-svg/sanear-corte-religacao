
// Tipagem leve para o global do PDF.js carregado via CDN
declare global {
  interface Window {
    pdfjsLib?: any;
  }
}

export type HalfKind = "TOP" | "BOTTOM";

export const CDN_PDFJS =
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.2.67/pdf.min.js";
export const CDN_PDFJS_WORKER =
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.2.67/pdf.worker.min.js";

// Heurísticas de regex (ajuste conforme seu layout FoxFAT)
export const RX_LIGACAO = /liga[çc][aã]o\s*[:\-]?\s*([0-9]{3,})/i;
export const RX_NUM_OS =
  /ordem\s+de\s+servi[çc]o\s*n[uú]mero\s*[:\-]?\s*([0-9]{3,})/i;
export const RX_MATRICULA = /matr[ií]cula\s*[:\-]?\s*([0-9]{3,})/i;

/**
 * Garante que o PDF.js esteja carregado (via CDN) e retorna a instância.
 */
export async function ensurePdfJs(): Promise<any> {
  if (typeof window !== "undefined" && window.pdfjsLib) {
    return window.pdfjsLib;
  }

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
 * Extrai os itens de texto de uma página do PDF.
 * Retorna também a largura/altura do viewport (para usar como referência de corte).
 */
export async function extractPageText(
  fileBytes: Uint8Array,
  pageIndex: number,
  scale = 2
): Promise<{
  textItems: any[];
  fullText: string;
  width: number;
  height: number;
}> {
  const pdfjsLib = await ensurePdfJs();
  const loadingTask = pdfjsLib.getDocument({ data: fileBytes });
  const pdf = await loadingTask.promise;

  const page = await pdf.getPage(pageIndex + 1);
  const viewport = page.getViewport({ scale });

  const textContent = await page.getTextContent();
  const textItems = textContent.items || [];
  const fullText = textItems.map((it: any) => it.str).join(" ");

  return {
    textItems,
    fullText,
    width: Math.ceil(viewport.width),
    height: Math.ceil(viewport.height),
  };
}

/**
 * Separa os itens de texto em TOP/BOTTOM com base na coordenada Y e altura da página.
 */
export function splitTextItemsByHalf(
  allTextItems: any[],
  pageHeight: number
): { topItems: any[]; bottomItems: any[] } {
  const mid = pageHeight / 2;

  const isTop = (it: any) => {
    const tr = it.transform || [1, 0, 0, 1, 0, 0];
    const y = tr[5] ?? 0;
    return y >= mid;
  };

  const topItems = allTextItems.filter(isTop);
  const bottomItems = allTextItems.filter((it: any) => !isTop(it));

  return { topItems, bottomItems };
}

/**
 * Concatena itens de texto em uma única string.
 */
export function itemsToText(items: any[]): string {
  return items.map((it: any) => it.str).join(" ");
}

/**
 * Extrai metadados (Ligação, Nº OS, Matrícula) de um TEXTÃO.
 * Útil se você preferir extrair tudo de uma vez, sem dividir por metade.
 */
export function extractFoxfatMetaFromText(text: string): {
  ligacao?: string;
  numeroOS?: string;
  matricula?: string;
} {
  const ligacao = (text.match(RX_LIGACAO)?.[1] || "").trim() || undefined;
  const numeroOS = (text.match(RX_NUM_OS)?.[1] || "").trim() || undefined;
  const matricula = (text.match(RX_MATRICULA)?.[1] || "").trim() || undefined;
  return { ligacao, numeroOS, matricula };
}

/**
 * Extrai metadados (Ligação, Nº OS, Matrícula) considerando METADE da página.
 * Passe os textItems da página, a altura (viewportHeight) e qual metade deseja.
 */
export function extractMetaFromTextPerHalf(
  allTextItems: any[],
  pageHeight: number,
  half: HalfKind
): { ligacao?: string; numeroOS?: string; matricula?: string } {
  const { topItems, bottomItems } = splitTextItemsByHalf(allTextItems, pageHeight);
  const items = half === "TOP" ? topItems : bottomItems;
  return extractFoxfatMetaFromText(itemsToText(items));
}
