
export type HalfKind = "TOP" | "BOTTOM";

export interface FoxfatMeta {
  ligacao?: string;       // apenas dígitos
  numeroOS?: string;      // apenas dígitos
  matricula?: string;     // apenas dígitos
  ligacaoRaw?: string;    // texto bruto capturado
  numeroOSRaw?: string;   // texto bruto capturado
  matriculaRaw?: string;  // texto bruto capturado
}

/** Remove tudo que não for dígito (preserva zeros à esquerda) */
export function onlyDigits(s?: string | null): string | undefined {
  if (!s) return undefined;
  const out = s.replace(/\D+/g, "");
  return out.length ? out : undefined;
}

/** Sanitize para nome de arquivo no Windows */
export function sanitizeFilename(input: string, maxLen = 180): string {
  return input
    .trim()
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\s+/g, "_")
    .slice(0, maxLen);
}

/** Letras com/sem acento (para “serviço”, “número”, etc.) */
const A_ACENTO = "aàáâãä";
const E_ACENTO = "eèéêë";
const I_ACENTO = "iìíîï";
const O_ACENTO = "oòóôõö";
const U_ACENTO = "uùúûü";
const C_ACENTO = "cç";

/** Regex robustos para variações comuns no layout FoxFAT */
export const RX_LIGACAO = new RegExp(
  // ligaçao / ligacao / lig. / lig
  String.raw`(?:\b(?:lig(?:a[c${C_ACENTO}]?[${A_ACENTO}]?o|\.?)|liga[${C_ACENTO}][${A_ACENTO}]o)\b)\s*[:\-]?\s*([0-9][0-9.\-\s]*)`,
  "i"
);

export const RX_NUM_OS = new RegExp(
  // "Ordem de serviço número", "OS Nº", "Ordem servico n°", etc.
  String.raw`(?:\b(?:ordem\s+de\s+servi[${C_ACENTO}][${O_ACENTO}]|os)\b)\s*(?:n[º°o\.]*|num(?:ero)?)?\s*[:\-]?\s*([0-9][0-9.\-\s]*)`,
  "i"
);

export const RX_MATRICULA = new RegExp(
  // "Matrícula:", "Matricula", "Matric."
  String.raw`\bmatr[ií]c(?:ula|\.?)\b\s*[:\-]?\s*([0-9][0-9.\-\s]*)`,
  "i"
);

/**
 * Extrai metadados da STRING de texto. Use quando você já tem o "textão"
 * (por exemplo, juntando todos os `items[i].str` do PDF.js).
 */
export function parseFoxfatText(text: string): FoxfatMeta {
  const ligRaw = text.match(RX_LIGACAO)?.[1]?.trim();
  const osRaw = text.match(RX_NUM_OS)?.[1]?.trim();
  const matRaw = text.match(RX_MATRICULA)?.[1]?.trim();

  return {
    ligacaoRaw: ligRaw,
    numeroOSRaw: osRaw,
    matriculaRaw: matRaw,
    ligacao: onlyDigits(ligRaw),
    numeroOS: onlyDigits(osRaw),
    matricula: onlyDigits(matRaw),
  };
}

/**
 * Concatena itens de texto (como retornado pelo PDF.js) em uma única string.
 */
export function itemsToText(items: any[]): string {
  return items.map((it: any) => it.str).join(" ");
}

/**
 * Separa os itens de texto em TOP/BOTTOM com base na coordenada Y e altura da página.
 * Útil quando cada página possui 2 ordens (metade superior e inferior).
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
 * Extrai metadados levando em conta a METADE da página.
 * Passe os `textItems` da página inteira e a `pageHeight` (viewport.height).
 */
export function parseFoxfatFromHalf(
  allTextItems: any[],
  pageHeight: number,
  half: HalfKind
): FoxfatMeta {
  const { topItems, bottomItems } = splitTextItemsByHalf(allTextItems, pageHeight);
  const items = half === "TOP" ? topItems : bottomItems;
  return parseFoxfatText(itemsToText(items));
}

/**
 * Gera um nome de arquivo sugerido, ex.:
 *   LIG_08561_OS_254651_p3_T.pdf
 *
 * Parâmetros:
 * - meta: resultado do parse (ligacao/numeroOS/matricula)
 * - pageIndex: índice da página (0-based)
 * - half: "TOP" | "BOTTOM"
 * - prefix: opcional (ex.: "RELIG" ou "CORTE") — não obrigatório
 */
export function buildSuggestedName(
  meta: FoxfatMeta,
  pageIndex: number,
  half: HalfKind,
  prefix?: string
): string {
  const p = pageIndex + 1;
  const halfTag = half === "TOP" ? "T" : "B";
  const parts = [
    prefix ? prefix.toUpperCase() : undefined,
    `LIG_${meta.ligacao ?? "X"}`,
    `OS_${meta.numeroOS ?? "X"}`,
    `p${p}_${halfTag}`,
  ].filter(Boolean);
  return sanitizeFilename(parts.join("_") + ".pdf");
}

/**
 * Conveniência: tenta montar um objeto de metadados mínimo
 * para gravar no banco (se decidir persistir no futuro).
 */
export function toMinimalRecord(meta: FoxfatMeta) {
  return {
    ligacao: meta.ligacao ?? null,
    numero_os: meta.numeroOS ?? null,
    matricula: meta.matricula ?? null,
  };
}
