// src/utils/pdfjs.ts
// PDF.js para Vite/React (sem CDN), usando a build ESM.
import * as pdfjsLib from "pdfjs-dist/build/pdf";
// Vite resolve o worker e nos devolve uma URL string
import workerUrl from "pdfjs-dist/build/pdf.worker.mjs?url";

// Configura o worker
(pdfjsLib as any).GlobalWorkerOptions.workerSrc = workerUrl;

export default pdfjsLib;
