// src/pages/ImportarOSCorte.tsx
// -------------------------------------------------------------
// Importador de OS de Corte (PDF com 2 ordens por página)
// - Visualização UMA POR VEZ (grande, +60%)
// - Campo único: "Ligação" (sem pré-preencher; apenas placeholder)
// - Botões: Salvar (inclui no lote), Excluir (pula), Anterior/Próxima
// - Exporta apenas as ordens "salvas": pasta (FS Access) ou ZIP
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
  previewDataUrl?: string;
  pdfBytes?: Uint8Array;
  suggestedName: string;
  selected: boolean; // true = foi "Salva" pelo usuário
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const sanitizeFilename = (input: string) =>
  input.trim().replace(/[\\/:*?"<>|]/g, "_").replace(/\s+/g, "_").slice(0, 180);

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

// ---------- PDF helpers ----------

// +60% na resolução de renderização
const RENDER_SCALE = 3.2; // era 2.0

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

/** Procura rótulo "Ligação" e pega o número à direita, na mesma linha (apenas para achar where; não preenche o input) */
function findLigacoesOnPage(textItems: any[]): Array<{ y: number; x: number; value: string }> {
  const toks = (textItems as any[]).map((it: any) => {
    const tr = it.transform || [1, 0, 0, 1, 0, 0];
    const x = tr[4] ?? 0;
    const y = tr[5] ?? 0;
    return { x, y, str: String(it.str ?? "") };
  }) as { x: number; y: number; str: string }[];

  const out: Array<{ y: number; x: number; value: string }> = [];
  const N = toks.length;

  for (let i = 0; i < N; i++) {
    const t = toks[i];
    if (!t) continue;
    const s = norm(t.str);
    if (!/\bligacao\b:?/.test(s)) continue;

    const lineTol = 6;
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

  function mapWithY(getY: (c: { y: number }) => number) {
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
  }

  const down = mapWithY((c) => c.y);
  const up = mapWithY((c) => height - c.y);
  return down.cost <= up.cost ? { top: down.top, bottom: down.bottom } : { top: up.top, bottom: up.bottom };
}

const makeName = (it: OrdemItem) =>
  sanitizeFilename(`LIG_${it.ligacao ?? "X"}_${it.half === "TOP" ? "T" : "B"}_p${it.pageIndex + 1}.pdf`);

// ---------- Componente ----------
export default function ImportarOSCorte() {
  const [cutRatio, setCutRatio] = useState<number>(0.5);
  const [processing, setProcessing] = useState(false);
  const [items, setItems] = useState<OrdemItem[]>([]);
  const [curIdx, setCurIdx] = useState<number>(0);
  const [log, setLog] = useState<string>("");

  const appendLog = useCallback((msg: string) => {
    setLog((old) => `${old}${old ? "\n" : ""}${msg}`);
  }, []);

  const current = items[curIdx];

  const onFilesSelected = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;
      setProcessing(true);
      setItems([]);
      setCurIdx(0);
      setLog("");

      try {
        const newItems: OrdemItem[] = [];

        for (const file of Array.from(files)) {
          appendLog(`Lendo arquivo: ${file.name}`);
          const u8 = new Uint8Array(await file.arrayBuffer());

          const loadingTask = pdfjsLib.getDocument({ data: u8 });
          const doc = await loadingTask.promise;
          const numPages = doc.numPages;

          for (let p = 0; p < numPages; p++) {
            const { canvas, width, height, textItems } = await renderPdfPageToCanvasFromDoc(
              doc,
              p,
              RENDER_SCALE
            );

            // Detecta posição das ligações (para decidir TOP/BOTTOM),
            // mas **não** vamos pré-preencher o campo de entrada.
            const ligs = findLigacoesOnPage(textItems);
            const _assign = assignLigacoesToHalves(ligs, height, cutRatio);
            // const ligTop = _assign.top; const ligBottom = _assign.bottom; // (se quiser mostrar dica)

            // Split visual
            const topCanvas = document.createElement("canvas");
            topCanvas.width = width;
            topCanvas.height = Math.floor(height * cutRatio);
            topCanvas.getContext("2d")!.drawImage(
              canvas,
              0,
              0,
              width,
              Math.floor(height * cutRatio),
              0,
              0,
              width,
              Math.floor(height * cutRatio)
            );

            const bottomCanvas = document.createElement("canvas");
            bottomCanvas.width = width;
            bottomCanvas.height = Math.ceil(height * (1 - cutRatio));
            bottomCanvas.getContext("2d")!.drawImage(
              canvas,
              0,
              Math.floor(height * cutRatio),
              width,
              Math.ceil(height * (1 - cutRatio)),
              0,
              0,
              width,
              Math.ceil(height * (1 - cutRatio))
            );

            const topPdf = await pngToSinglePagePdf(await canvasToPngBytes(topCanvas));
            const botPdf = await pngToSinglePagePdf(await canvasToPngBytes(bottomCanvas));
            const topPrev = topCanvas.toDataURL("image/png");
            const botPrev = bottomCanvas.toDataURL("image/png");

            // IMPORTANTE: ligacao **não** é pré-preenchida (fica undefined)
            const topItem: OrdemItem = {
              id: `${file.name}-p${p + 1}-T`,
              origemArquivo: file.name,
              pageIndex: p,
              half: "TOP",
              width,
              height: Math.floor(height * cutRatio),
              ligacao: undefined,
              previewDataUrl: topPrev,
              pdfBytes: topPdf,
              suggestedName: "",
              selected: false,
            };

            const botItem: OrdemItem = {
              id: `${file.name}-p${p + 1}-B`,
              origemArquivo: file.name,
              pageIndex: p,
              half: "BOTTOM",
              width,
              height: Math.ceil(height * (1 - cutRatio)),
              ligacao: undefined,
              previewDataUrl: botPrev,
              pdfBytes: botPdf,
              suggestedName: "",
              selected: false,
            };

            newItems.push(topItem, botItem);
            appendLog(`Página ${p + 1}/${numPages} dividida em 2 ordens.`);
            await sleep(5);
          }

          try {
            doc.cleanup?.();
            doc.destroy?.();
          } catch {}
        }

        setItems(newItems);
        setCurIdx(0);
        appendLog(`Concluído: ${newItems.length} ordens preparadas.`);
      } catch (err: any) {
        console.error(err);
        appendLog(`Erro: ${err?.message || err}`);
      } finally {
        setProcessing(false);
      }
    },
    [appendLog, cutRatio]
  );

  // Navegação
  const goPrev = () => setCurIdx((i) => Math.max(0, i - 1));
  const goNext = () => setCurIdx((i) => Math.min(items.length - 1, i + 1));

  // Salvar = marca selected=true e gera o nome (precisa de ligação)
  const handleSaveCurrent = () => {
    if (!current) return;
    const lig = (current.ligacao || "").trim();
    if (!lig) {
      alert("Informe a Ligação antes de salvar.");
      return;
    }
    setItems((prev) =>
      prev.map((it, idx) =>
        idx === curIdx ? { ...it, selected: true, suggestedName: makeName({ ...it, ligacao: lig }) } : it
      )
    );
    goNext();
  };

  // Excluir = selected=false e segue
  const handleExcludeCurrent = () => {
    if (!current) return;
    setItems((prev) => prev.map((it, idx) => (idx === curIdx ? { ...it, selected: false } : it)));
    goNext();
  };

  // Atualiza o campo Ligação do item atual
  const updateLigacao = (value: string) => {
    if (!current) return;
    setItems((prev) => prev.map((it, idx) => (idx === curIdx ? { ...it, ligacao: value } : it)));
  };

  const savedCount = useMemo(() => items.filter((i) => i.selected).length, [items]);

  // Exportações (só itens selected)
  const saveToFolder = useCallback(async () => {
    const selected = items.filter((i) => i.selected && i.pdfBytes);
    if (selected.length === 0) return alert("Nenhuma ordem salva. Use o botão 'Salvar' em cada ordem.");
    if (!("showDirectoryPicker" in window) || typeof window.showDirectoryPicker !== "function") {
      return alert("Salvar em pasta requer Chrome/Edge com File System Access API. Use 'Baixar tudo (ZIP)'.");
    }
    const dirHandle = await window.showDirectoryPicker();
    let saved = 0;
    for (const it of selected) {
      const u8 = it.pdfBytes!;
      const ab = u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);
      const data = new Uint8Array(ab);
      const name = it.suggestedName || makeName(it);
      // @ts-ignore
      const fileHandle = await dirHandle.getFileHandle(name, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(data);
      await writable.close();
      saved++;
    }
    alert(`Salvo(s) ${saved} arquivo(s) na pasta escolhida.`);
  }, [items]);

  const downloadZip = useCallback(async () => {
    const selected = items.filter((i) => i.selected && i.pdfBytes);
    if (selected.length === 0) return alert("Nenhuma ordem salva. Use o botão 'Salvar' em cada ordem.");
    const zip = new JSZip();
    selected.forEach((it) => {
      const name = it.suggestedName || makeName(it);
      zip.file(name, it.pdfBytes!);
    });
    const blob = await zip.generateAsync({ type: "blob" });
    saveAs(blob, `ordens_corte_${new Date().toISOString().slice(0, 10)}.zip`);
  }, [items]);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <h1 className="text-2xl font-semibold mb-2">Importar OS de corte (PDF)</h1>
      <p className="text-sm text-slate-600 mb-4">
        Revise <strong>uma ordem por vez</strong>, digite a <em>Ligação</em> e clique <strong>Salvar</strong> para
        incluir no lote.
      </p>

      {/* Barra de ações (upload + slider + export) */}
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
              setLog("");
            }}
            disabled={processing}
          >
            Limpar
          </button>
        </div>
      </div>

      {/* Status */}
      <div className="text-xs text-slate-500 mb-4">
        {processing
          ? "Processando..."
          : `Total: ${items.length} | Salvas: ${savedCount} | ${
              items.length ? `Item ${curIdx + 1} de ${items.length}` : "nenhum item"
            }`}
      </div>

      {/* Visualização UNA POR VEZ – preview ampliado */}
      {current && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Preview grande: agora ocupa 9/12 e até 90vh */}
          <div className="lg:col-span-9">
            <div className="rounded-xl overflow-hidden border bg-slate-900/40">
              <div className="p-2 bg-slate-900/60 text-xs text-slate-400">
                {current.origemArquivo} · pág {current.pageIndex + 1} · {current.half} ·{" "}
                {current.selected ? <span className="text-emerald-400">SALVA</span> : <span className="text-amber-400">NÃO SALVA</span>}
              </div>
              <div className="w-full max-h-[90vh] min-h-[70vh] grid place-items-center bg-black/30">
                {current.previewDataUrl ? (
                  <img
                    src={current.previewDataUrl}
                    alt="preview"
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <div className="p-10 text-slate-400">Sem preview</div>
                )}
              </div>
            </div>
          </div>

          {/* Form + controles */}
          <div className="lg:col-span-3 space-y-4">
            <div className="rounded-xl border p-4 bg-slate-900/40">
              <div className="mb-3">
                <label className="text-xs text-slate-400">Ligação</label>
                <input
                  className="mt-1 w-full border rounded px-3 py-2 text-base"
                  value={current.ligacao ?? ""}
                  onChange={(e) => updateLigacao(e.target.value)}
                  placeholder="digite a ligação aqui"
                />
              </div>

              <div className="flex gap-2">
                <button
                  onClick={handleSaveCurrent}
                  className="flex-1 px-3 py-2 rounded bg-emerald-600 text-white"
                >
                  Salvar (incluir)
                </button>
                <button
                  onClick={handleExcludeCurrent}
                  className="px-3 py-2 rounded bg-rose-600 text-white"
                >
                  Excluir
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
      )}

      {/* Logs */}
      <div className="mt-6">
        <label className="block text-sm font-medium mb-1">Log</label>
        <textarea className="w-full h-36 border rounded p-2 text-xs font-mono" value={log} readOnly />
      </div>

      <div className="text-xs text-slate-500 mt-3">
        Só as ordens <strong>salvas</strong> entram no ZIP ou na pasta. Campo de ligação não é
        preenchido automaticamente.
      </div>
    </div>
  );
}
