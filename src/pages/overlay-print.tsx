import * as React from "react";

/**
 * Página que exibe o PDF com um cartão central por cima
 * mostrando Telefone e Ponto de Referência. Imprime junto.
 *
 * Parâmetros de query aceitos:
 *   url (ou pdf)          -> URL pública do PDF
 *   telefone (ou tel)     -> telefone
 *   referencia (ou ref)   -> ponto de referência
 */
export default function OverlayPrint() {
  const [pdfUrl, setPdfUrl] = React.useState<string>("");
  const [telefone, setTelefone] = React.useState<string>("—");
  const [referencia, setReferencia] = React.useState<string>("—");
  const [err, setErr] = React.useState<string | null>(null);

  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    // aceita url/pdf e telefone/tel e referencia/ref
    const url = params.get("url") || params.get("pdf") || "";
    const tel = params.get("telefone") || params.get("tel") || "—";
    const ref = params.get("referencia") || params.get("ref") || "—";

    setPdfUrl(url);
    setTelefone((tel || "—").trim() || "—");
    setReferencia((ref || "—").trim() || "—");

    if (!url) setErr("URL do PDF ausente. Volte e tente novamente.");
  }, []);

  const onPrint = React.useCallback(() => window.print(), []);

  if (err) {
    return (
      <div className="min-h-screen bg-slate-900 text-slate-200 flex items-center justify-center p-6">
        <div className="max-w-lg w-full bg-slate-800/60 border border-white/10 rounded-xl p-5">
          <h1 className="text-lg font-semibold mb-2">Falha ao abrir PDF</h1>
          <p className="text-slate-300 mb-4">{err}</p>
          <button
            onClick={() => window.close()}
            className="px-4 py-2 rounded-lg bg-white/10 border border-white/20 hover:bg-white/20"
          >
            Fechar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 text-slate-200">
      {/* Barra (some na impressão) */}
      <div className="p-3 flex items-center gap-2 justify-between border-b border-white/10 print:hidden">
        <div className="text-sm text-slate-300">
          <span className="font-semibold">Pré-visualização</span> — clique em <em>Imprimir</em>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onPrint}
            className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm"
          >
            Imprimir
          </button>
          <button
            onClick={() => window.close()}
            className="px-3 py-1.5 rounded-lg bg-white/10 border border-white/20 hover:bg-white/20 text-sm"
          >
            Fechar
          </button>
        </div>
      </div>

      <div className="relative w-full h-[calc(100vh-56px)] print:h-screen print:w-screen">
        {/* PDF nativo do navegador */}
        {pdfUrl ? (
          <object
            data={`${pdfUrl}#zoom=page-fit`}
            type="application/pdf"
            className="w-full h-full"
          >
            <div className="p-6">
              <p className="mb-3">Seu navegador não conseguiu embutir o PDF.</p>
              <a
                href={pdfUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white inline-block"
              >
                Abrir PDF em outra guia
              </a>
            </div>
          </object>
        ) : (
          <div className="w-full h-full grid place-content-center text-slate-400">
            Carregando…
          </div>
        )}

        {/* Sobreposição central (é impressa junto) */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-6 print:px-10">
          <div className="pointer-events-auto max-w-[720px] w-full bg-black/35 backdrop-blur-[1px] rounded-xl ring-1 ring-white/20 p-4 print:p-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
              <div>
                <div className="text-[13px] text-slate-300 uppercase tracking-wide">Telefone</div>
                <div className="text-lg md:text-xl font-semibold text-white break-words">{telefone}</div>
              </div>
              <div>
                <div className="text-[13px] text-slate-300 uppercase tracking-wide">Ponto de referência</div>
                <div className="text-lg md:text-xl font-semibold text-white break-words">{referencia}</div>
              </div>
            </div>
            <div className="text-[11px] text-slate-300/80 mt-2">
              (Os dados acima serão impressos junto ao PDF.)
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @media print {
          body, html, #root { height: auto !important; }
          .print\\:hidden { display: none !important; }
        }
      `}</style>
    </div>
  );
}
