// src/pages/ImportarOSCorte.tsx
// -------------------------------------------------------------
// Importador em lote de OS de Corte (PDF com 2 ordens por página)
// -------------------------------------------------------------

import React, { useCallback, useMemo, useState } from "react";
import JSZip from "jszip";
import { saveAs } from "file-saver";
import { PDFDocument } from "pdf-lib";
import pdfjsLib from "../utils/pdfjs";

declare global {
  interface Window {
    showDirectoryPicker?: any;
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
  numeroOS?: string;
  matricula?: string;
  previewDataUrl?: string;
  pdfBytes?: Uint8Array;
  suggestedName: string;
  selected: boolean;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function sanitizeFilename(input: string) {
  return input.trim().replace(/[\\/:*?"<>|]/g, "_").replace(/\s+/g, "_").slice(0, 180);
}

// 🔎 Regex mais estrita para LIGAÇÃO (4–8 dígitos) + bordas de palavra
const RX_LIGACAO = /\bliga[çc][aã]o\b\s*[:\-]?\s*([0-9]{4,8})\b/i;
// Mantemos as outras (não usadas se você só quer Ligação, mas deixei para compatibilidade)
const RX_NUM_OS = /ordem\s+de\s+servi[çc]o\s*n[uú]mero\s*[:\-]?\s*([0-9]{3,})/i;
const RX_MATRICULA = /matr[ií]cula\s*[:\-]?\s*([0-9]{3,})/i;

async function ensurePdfJs(): Promise<any> {
  return pdfjsLib;
}

async function renderPdfPageToCanvasFromDoc(
  pdfDoc: any,
  pageIndex: number,
  scale = 2
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

// 🧠 Extração por metade com correção do eixo Y (topo = y <= mid)
function extractMetaFromTextPerHalf(
  allTextItems: any[],
  canvasHeight: number,
  half: HalfKind
): { ligacao?: string; numeroOS?: string; matricula?: string } {
  const isTop = half === "TOP";
  const mid = canvasHeight / 2;

  const itemsForHalf = allTextItems.filter((it: any) => {
    const tr = it.transform || [1, 0, 0, 1, 0, 0];
    const y = tr[5] ?? 0;
    return isTop ? y <= mid : y > mid;
  });

  const text = itemsForHalf.map((it: any) => it.str).join(" ");

  // Primeiro buscamos LIGAÇÃO com a regex mais estrita
  const ligacao = (text.match(RX_LIGACAO)?.[1] || "").trim() || undefined;

  // As demais ficam opcionais (você disse que não precisa delas)
  const numeroOS = (text.match(RX_NUM_OS)?.[1] || "").trim() || undefined;

  // Se quiser, pode desativar a matrícula completamente; mantive opcional + fallback
  let matricula = (text.match(RX_MATRICULA)?.[1] || "").trim() || undefined;

  return { ligacao, numeroOS, matricula };
}

export default function ImportarOSCorte() {
  const [cutRatio, setCutRatio] = useState<number>(0.5);
  const [useLigAsMatricula, setUseLigAsMatricula] = useState<boolean>(true); // opcional
  const [processing, setProcessing] = useState(false);
  const [items, setItems] = useState<OrdemItem[]>([]);
  const [log, setLog] = useState<string>("");

  const appendLog = useCallback((msg: string) => {
    setLog((old) => `${old}${old ? "\n" : ""}${msg}`);
  }, []);

  const onFilesSelected = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;
      setProcessing(true);
      setItems([]);
      setLog("");

      try {
        const pdfjs = await ensurePdfJs();
        const newItems: OrdemItem[] = [];

        for (const file of Array.from(files)) {
          appendLog(`Lendo arquivo: ${file.name}`);
          const u8 = new Uint8Array(await file.arrayBuffer());

          // Abre uma vez por arquivo
          const loadingTask = pdfjs.getDocument({ data: u8 });
          const doc = await loadingTask.promise;
          const numPages = doc.numPages;

          for (let p = 0; p < numPages; p++) {
            const { canvas, width, height, textItems } = await renderPdfPageToCanvasFromDoc(doc, p, 2);

            // Cortes top/bottom
            const topCanvas = document.createElement("canvas");
            topCanvas.width = width;
            topCanvas.height = Math.floor(height * cutRatio);
            topCanvas.getContext("2d")!.drawImage(
              canvas,
              0, 0, width, Math.floor(height * cutRatio),
              0, 0, width, Math.floor(height * cutRatio)
            );

            const bottomCanvas = document.createElement("canvas");
            bottomCanvas.width = width;
            bottomCanvas.height = Math.ceil(height * (1 - cutRatio));
            bottomCanvas.getContext("2d")!.drawImage(
              canvas,
              0, Math.floor(height * cutRatio), width, Math.ceil(height * (1 - cutRatio)),
              0, 0, width, Math.ceil(height * (1 - cutRatio))
            );

            // PNG->PDF
            const topPdf = await pngToSinglePagePdf(await canvasToPngBytes(topCanvas));
            const botPdf = await pngToSinglePagePdf(await canvasToPngBytes(bottomCanvas));

            // Previews
            const topPrev = topCanvas.toDataURL("image/png");
            const botPrev = bottomCanvas.toDataURL("image/png");

            // 🔎 Metadados por metade (com correção do half)
            const topMeta = extractMetaFromTextPerHalf(textItems, height, "TOP");
            const botMeta = extractMetaFromTextPerHalf(textItems, height, "BOTTOM");

            // Fallback opcional da Matrícula
            const topMatricula = topMeta.matricula || (useLigAsMatricula ? topMeta.ligacao : undefined);
            const botMatricula = botMeta.matricula || (useLigAsMatricula ? botMeta.ligacao : undefined);

            const topName = sanitizeFilename(
              `LIG_${topMeta.ligacao ?? "X"}_OS_${topMeta.numeroOS ?? "X"}_p${p + 1}_T.pdf`
            );
            const botName = sanitizeFilename(
              `LIG_${botMeta.ligacao ?? "X"}_OS_${botMeta.numeroOS ?? "X"}_p${p + 1}_B.pdf`
            );

            newItems.push({
              id: `${file.name}-p${p + 1}-T`,
              origemArquivo: file.name,
              pageIndex: p,
              half: "TOP",
              width,
              height: Math.floor(height * cutRatio),
              ligacao: topMeta.ligacao,
              numeroOS: topMeta.numeroOS,
              matricula: topMatricula,
              previewDataUrl: topPrev,
              pdfBytes: topPdf,
              suggestedName: topName,
              selected: true,
            });

            newItems.push({
              id: `${file.name}-p${p + 1}-B`,
              origemArquivo: file.name,
              pageIndex: p,
              half: "BOTTOM",
              width,
              height: Math.ceil(height * (1 - cutRatio)),
              ligacao: botMeta.ligacao,
              numeroOS: botMeta.numeroOS,
              matricula: botMatricula,
              previewDataUrl: botPrev,
              pdfBytes: botPdf,
              suggestedName: botName,
              selected: true,
            });

            appendLog(`Página ${p + 1}/${numPages} dividida em 2 ordens.`);
            await sleep(10);
          }

          try {
            doc.cleanup?.();
            doc.destroy?.();
          } catch {}
        }

        setItems(newItems);
        appendLog(`Concluído: ${newItems.length} ordens preparadas.`);
      } catch (err: any) {
        console.error(err);
        appendLog(`Erro: ${err?.message || err}`);
      } finally {
        setProcessing(false);
      }
    },
    [appendLog, cutRatio, useLigAsMatricula]
  );

  const updateItem = useCallback((id: string, patch: Partial<OrdemItem>) => {
    setItems((prev) =>
      prev.map((it) => {
        if (it.id !== id) return it;
        const next = { ...it, ...patch };
        next.suggestedName = sanitizeFilename(
          `LIG_${next.ligacao ?? "X"}_OS_${next.numeroOS ?? "X"}_${next.half === "TOP" ? "T" : "B"}_p${
            next.pageIndex + 1
          }.pdf`
        );
        return next;
      })
    );
  }, []);

  const saveToFolder = useCallback(async () => {
    const selected = items.filter((i) => i.selected && i.pdfBytes);
    if (selected.length === 0) return alert("Selecione ao menos uma ordem.");
    if (!("showDirectoryPicker" in window) || typeof window.showDirectoryPicker !== "function") {
      return alert("Salvar em pasta requer Chrome/Edge com File System Access API. Use 'Baixar tudo (ZIP)'.");
    }
    const dirHandle = await window.showDirectoryPicker();
    let saved = 0;
    for (const it of selected) {
      const u8 = it.pdfBytes!;
      const ab = u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);
      const data = new Uint8Array(ab);
      // @ts-ignore
      const fileHandle = await dirHandle.getFileHandle(it.suggestedName, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(data);
      await writable.close();
      saved++;
    }
    alert(`Salvo(s) ${saved} arquivo(s) na pasta escolhida.`);
  }, [items]);

  const downloadZip = useCallback(async () => {
    const selected = items.filter((i) => i.selected && i.pdfBytes);
    if (selected.length === 0) return alert("Selecione ao menos uma ordem.");
    const zip = new JSZip();
    selected.forEach((it) => zip.file(it.suggestedName, it.pdfBytes!));
    const blob = await zip.generateAsync({ type: "blob" });
    saveAs(blob, `ordens_corte_${new Date().toISOString().slice(0, 10)}.zip`);
  }, [items]);

  const totalSelected = useMemo(() => items.filter((i) => i.selected).length, [items]);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <h1 className="text-2xl font-semibold mb-2">Importar OS de corte (PDF)</h1>
      <p className="text-sm text-slate-600 mb-4">
        Envie um ou mais PDFs onde <strong>cada página contém 2 ordens</strong>. O sistema divide em topo/baixo e
        tenta extrair <em>Ligação</em> (e, opcionalmente, Nº OS / Matrícula).
      </p>

      <div className="rounded-lg border p-4 mb-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
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
              />{" "}
              {Math.round(cutRatio * 100)}% / {100 - Math.round(cutRatio * 100)}%
            </label>

            <label className="text-sm inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={useLigAsMatricula}
                onChange={(e) => setUseLigAsMatricula(e.target.checked)}
              />
              Usar <strong>Ligação</strong> como <strong>Matrícula</strong> quando não houver
            </label>
          </div>

          <div className="flex gap-2">
            <button
              className="px-3 py-2 rounded bg-blue-600 text-white disabled:opacity-50"
              onClick={saveToFolder}
              disabled={processing || items.length === 0}
            >
              Salvar em pasta
            </button>
            <button
              className="px-3 py-2 rounded bg-emerald-600 text-white disabled:opacity-50"
              onClick={downloadZip}
              disabled={processing || items.length === 0}
            >
              Baixar tudo (.zip)
            </button>
            <button
              className="px-3 py-2 rounded bg-slate-200"
              onClick={() => {
                setItems([]);
                setLog("");
              }}
              disabled={processing}
            >
              Limpar
            </button>
          </div>
        </div>

        <div className="text-xs text-slate-500 mt-2">
          {processing ? "Processando..." : `Itens: ${items.length} | Selecionados: ${totalSelected}`}
        </div>
      </div>

      {items.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {items.map((it) => (
            <div key={it.id} className={`border rounded-lg overflow-hidden flex flex-col ${it.selected ? "" : "opacity-60"}`}>
              {it.previewDataUrl ? (
                <img src={it.previewDataUrl} alt={it.suggestedName} className="w-full border-b" />
              ) : (
                <div className="h-48 bg-slate-100 border-b flex items-center justify-center text-slate-400">sem preview</div>
              )}

              <div className="p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-500">
                    {it.origemArquivo} · pág {it.pageIndex + 1} · {it.half}
                  </span>
                  <label className="text-xs flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={it.selected}
                      onChange={(e) => updateItem(it.id, { selected: e.target.checked })}
                    />
                    incluir
                  </label>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="text-xs text-slate-500">Ligação</label>
                    <input
                      className="w-full border rounded px-2 py-1 text-sm"
                      value={it.ligacao ?? ""}
                      onChange={(e) => updateItem(it.id, { ligacao: e.target.value })}
                      placeholder="ex: 08561"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-500">Nº OS</label>
                    <input
                      className="w-full border rounded px-2 py-1 text-sm"
                      value={it.numeroOS ?? ""}
                      onChange={(e) => updateItem(it.id, { numeroOS: e.target.value })}
                      placeholder="opcional"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-500">Matrícula</label>
                    <input
                      className="w-full border rounded px-2 py-1 text-sm"
                      value={it.matricula ?? ""}
                      onChange={(e) => updateItem(it.id, { matricula: e.target.value })}
                      placeholder="opcional"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs text-slate-500">Nome do arquivo</label>
                  <input
                    className="w-full border rounded px-2 py-1 text-sm font-mono"
                    value={it.suggestedName}
                    onChange={(e) => updateItem(it.id, { suggestedName: sanitizeFilename(e.target.value) })}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-6">
        <label className="block text-sm font-medium mb-1">Log</label>
        <textarea className="w-full h-36 border rounded p-2 text-xs font-mono" value={log} readOnly />
      </div>

      <div className="text-xs text-slate-500 mt-3">
        Dica: se a extração automática falhar, edite “Ligação” nos cartões antes de salvar.
      </div>
    </div>
  );
}
