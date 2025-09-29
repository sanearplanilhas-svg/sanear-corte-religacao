
import JSZip from "jszip";
import { saveAs } from "file-saver";
import { sanitizeFilename, ensurePdfExtension, dedupeAgainst } from "./filename";

// Tipagem leve para a File System Access API
declare global {
  interface Window {
    showDirectoryPicker?: any;
  }
}

export type SaveData = Uint8Array | ArrayBuffer | Blob | File;

export interface SaveItem {
  /** Nome do arquivo (será saneado/deduplicado) */
  name: string;
  /** Conteúdo do arquivo */
  data: SaveData;
  /** MIME type opcional, ex.: "application/pdf" */
  mime?: string;
}

export interface SaveFolderOptions {
  /** Se true, faz dedupe de nomes em memória (file_1.pdf, file_2.pdf, ...) */
  dedupe?: boolean;
  /** Se true, força extensão .pdf nos nomes */
  enforcePdfExtension?: boolean;
  /** Cria (ou usa) uma subpasta dentro da pasta escolhida */
  subfolder?: string;
}

export interface ZipOptions {
  /** Nome do ZIP (padrão: arquivos_YYYY-MM-DD.zip) */
  zipName?: string;
  /** Se true, força extensão .pdf nos nomes internos */
  enforcePdfExtension?: boolean;
  /** Se true, deduplica nomes dentro do ZIP */
  dedupe?: boolean;
}

/** Verifica suporte ao File System Access API */
export function canUseFileSystemAccess(): boolean {
  return typeof window !== "undefined" && typeof window.showDirectoryPicker === "function";
}

/**
 * Converte qualquer SaveData para Uint8Array (BufferSource aceito por writable.write).
 * Evita instanceof e faz detecção estrutural.
 */
async function toUint8(data: SaveData): Promise<Uint8Array> {
  const d: any = data;

  // 1) Tipos com buffer/offset/length (ex.: Uint8Array e outros ArrayBufferView)
  if (d && typeof d.byteLength === "number" && typeof d.byteOffset === "number" && d.buffer) {
    const ab = d.buffer.slice(d.byteOffset, d.byteOffset + d.byteLength);
    return new Uint8Array(ab);
  }

  // 2) Blob/File (tem .arrayBuffer())
  if (d && typeof d.arrayBuffer === "function") {
    const ab = await d.arrayBuffer();
    return new Uint8Array(ab);
  }

  // 3) ArrayBuffer "puro"
  if (typeof ArrayBuffer !== "undefined") {
    const tag = Object.prototype.toString.call(d);
    if (tag === "[object ArrayBuffer]") {
      return new Uint8Array(d as ArrayBuffer);
    }
  }

  // 4) Fallback defensivo (não deve ocorrer)
  const asString = String(d ?? "");
  const enc = new TextEncoder();
  return enc.encode(asString);
}

/** Normaliza nome (sanitiza + extensão opcional) */
function normalizeName(name: string, opts?: { enforcePdfExtension?: boolean }): string {
  let n = sanitizeFilename(name);
  if (opts?.enforcePdfExtension) n = ensurePdfExtension(n);
  return n;
}

/**
 * Abre o seletor de pasta e salva todos os arquivos usando File System Access API.
 * Retorna quantos foram salvos. Lança erro se algo falhar (exceto cancelamento do usuário).
 */
export async function saveAllToChosenFolder(
  items: SaveItem[],
  options: SaveFolderOptions = {}
): Promise<number> {
  if (!canUseFileSystemAccess()) {
    throw new Error(
      "File System Access API não suportada neste navegador. Use o download ZIP."
    );
  }

  // @ts-ignore
  const rootHandle = await window.showDirectoryPicker();
  const dirHandle = options.subfolder
    ? // @ts-ignore
      await rootHandle.getDirectoryHandle(sanitizeFilename(options.subfolder), { create: true })
    : rootHandle;

  let saved = 0;
  const seen = new Set<string>();

  for (const item of items) {
    let name = normalizeName(item.name, { enforcePdfExtension: options.enforcePdfExtension });
    if (options.dedupe) {
      name = dedupeAgainst(seen, name);
    } else {
      seen.add(name.toLowerCase());
    }

    const bytes = await toUint8(item.data);

    // @ts-ignore
    const fileHandle = await dirHandle.getFileHandle(name, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(bytes); // BufferSource
    await writable.close();
    saved++;
  }

  return saved;
}

/**
 * Faz o download de todos os arquivos como um único ZIP.
 * Retorna o Blob do ZIP (caso você queira manipular) — mas já dispara o download.
 */
export async function downloadAllAsZip(
  items: SaveItem[],
  options: ZipOptions = {}
): Promise<Blob> {
  const zip = new JSZip();
  const seen = new Set<string>();

  for (const item of items) {
    let name = normalizeName(item.name, { enforcePdfExtension: options.enforcePdfExtension });
    if (options.dedupe) {
      name = dedupeAgainst(seen, name);
    } else {
      seen.add(name.toLowerCase());
    }

    const bytes = await toUint8(item.data);
    zip.file(name, bytes);
  }

  const blob = await zip.generateAsync({ type: "blob" });
  const defaultName = `arquivos_${new Date().toISOString().slice(0, 10)}.zip`;
  saveAs(blob, sanitizeFilename(options.zipName || defaultName));
  return blob;
}

/** Faz download direto de um único arquivo (sem ZIP). */
export async function downloadSingle(
  name: string,
  data: SaveData,
  mime = "application/octet-stream"
): Promise<void> {
  const bytes = await toUint8(data);

  // Converte explicitamente para ArrayBuffer "puro" antes do Blob (evita TS2322/SharedArrayBuffer)
  const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;

  const blob = new Blob([ab], { type: mime });
  saveAs(blob, sanitizeFilename(name));
}

/** Conveniência: cria uma lista de SaveItem a partir de pares (nome, bytes) */
export function buildSaveItemsFromBytes(
  entries: Array<{ name: string; bytes: Uint8Array; mime?: string }>
): SaveItem[] {
  return entries.map((e) => ({ name: e.name, data: e.bytes, mime: e.mime || "application/pdf" }));
}
