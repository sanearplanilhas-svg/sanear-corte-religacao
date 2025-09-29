
export type HalfKind = "TOP" | "BOTTOM";

export interface MetaMinimal {
  ligacao?: string;   // somente dígitos (se possível)
  numeroOS?: string;  // somente dígitos (se possível)
  matricula?: string; // opcional
}

/** Remove tudo que não pode em nomes de arquivo no Windows e normaliza espaços. */
export function sanitizeFilename(input: string, maxLen = 180): string {
  // 1) troca caracteres proibidos por "_"
  // 2) colapsa espaços, troca por "_"
  // 3) remove pontos/espaços no fim (Windows não permite)
  // 4) limita comprimento para evitar problemas em FS antigos
  let out = (input ?? "")
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\s+/g, "_")
    .replace(/_{2,}/g, "_")
    .trim();

  // Evita nomes reservados do Windows (CON, PRN, AUX, NUL, COM1.., LPT1..)
  const reserved = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;
  if (reserved.test(out)) out = `_${out}`;

  // Tira pontos/espaços no final
  out = out.replace(/[.\s]+$/g, "");

  if (!out) out = "arquivo";
  if (out.length > maxLen) out = out.slice(0, maxLen);
  return out;
}

/** Garante que o nome tenha a extensão .pdf (minúscula). */
export function ensurePdfExtension(name: string): string {
  const n = name.trim();
  if (n.toLowerCase().endsWith(".pdf")) return n;
  return `${n}.pdf`;
}

/** Mantém somente dígitos (preserva zeros à esquerda). */
export function onlyDigits(s?: string | null): string | undefined {
  if (!s) return undefined;
  const out = s.replace(/\D+/g, "");
  return out.length ? out : undefined;
}

/**
 * Gera um nome de arquivo PDF sugerido no padrão:
 *   [PREFIX]_LIG_{ligacao}_OS_{numeroOS}_p{pageIndex+1}_{T|B}.pdf
 *
 * Ex.:  CORTE_LIG_08561_OS_254651_p3_T.pdf
 *       LIG_08561_OS_254651_p3_T.pdf (se não passar prefix)
 */
export function buildSuggestedPdfName(
  meta: MetaMinimal,
  pageIndex: number,
  half: HalfKind,
  prefix?: string
): string {
  const lig = onlyDigits(meta.ligacao) ?? "X";
  const os = onlyDigits(meta.numeroOS) ?? "X";
  const p = pageIndex + 1;
  const halfTag = half === "TOP" ? "T" : "B";

  const parts = [
    prefix ? sanitizeFilename(prefix.toUpperCase()) : undefined,
    `LIG_${lig}`,
    `OS_${os}`,
    `p${p}_${halfTag}`,
  ].filter(Boolean);

  return ensurePdfExtension(sanitizeFilename(parts.join("_")));
}

/**
 * Deduplicador de nomes em memória.
 * Se já existe "nome.pdf", vira "nome_1.pdf", "nome_2.pdf", ...
 */
export function makeUniqueInMemory(names: string[]): string[] {
  const seen = new Set<string>(); // usa lowercase para evitar colisão case-insensitive no Windows
  const out: string[] = [];

  for (const original of names) {
    const safe = sanitizeFilename(original);
    const { base, ext } = splitExt(safe);

    let candidate = safe;
    let k = 1;
    while (seen.has(candidate.toLowerCase())) {
      candidate = `${base}_${k}${ext}`;
      k++;
    }
    seen.add(candidate.toLowerCase());
    out.push(candidate);
  }

  return out;
}

/** Dado um conjunto já existente, deduplica um ÚNICO nome. */
export function dedupeAgainst(
  existingLowercase: Set<string>,
  name: string
): string {
  const safe = sanitizeFilename(name);
  const { base, ext } = splitExt(safe);

  let candidate = safe;
  let k = 1;
  while (existingLowercase.has(candidate.toLowerCase())) {
    candidate = `${base}_${k}${ext}`;
    k++;
  }
  existingLowercase.add(candidate.toLowerCase());
  return candidate;
}

/** Adiciona sufixo de timestamp (YYYYMMDD_HHMMSS) antes da extensão. */
export function withTimestamp(name: string, date = new Date()): string {
  const { base, ext } = splitExt(name);
  const ts = [
    date.getFullYear().toString().padStart(4, "0"),
    (date.getMonth() + 1).toString().padStart(2, "0"),
    date.getDate().toString().padStart(2, "0"),
  ].join("");
  const hm = [
    date.getHours().toString().padStart(2, "0"),
    date.getMinutes().toString().padStart(2, "0"),
    date.getSeconds().toString().padStart(2, "0"),
  ].join("");
  return sanitizeFilename(`${base}_${ts}_${hm}${ext}`);
}

/** Split seguro de nome+ext (último ponto conta). */
export function splitExt(name: string): { base: string; ext: string } {
  const i = name.lastIndexOf(".");
  if (i > 0 && i < name.length - 1) {
    return { base: name.slice(0, i), ext: name.slice(i) };
  }
  return { base: name, ext: "" };
}

/** Junta diretório + arquivo sem depender de libs (evita "//"). */
export function joinPath(dir: string, file: string): string {
  return `${dir.replace(/[\\\/]+$/,"")}/${file.replace(/^[\\\/]+/,"")}`;
}
