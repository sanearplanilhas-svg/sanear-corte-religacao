import * as React from "react";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import supabase from "../../lib/supabase";
import ListFilterBar, { ListFilter } from "../../components/filters/ListFilterBar";

type ReligRow = {
  id: string;
  matricula: string;
  bairro: string;
  rua: string;
  numero: string;
  ponto_referencia: string | null;
  prioridade: boolean;
  status: string;
  pdf_ordem_path: string | null;
  created_at: string;

  // Campos do solicitante (variações comuns; detectados dinamicamente)
  solicitante_nome?: string | null;
  nome_solicitante?: string | null;
  solicitante?: string | null;
  nome?: string | null;

  solicitante_documento?: string | null;
  documento_solicitante?: string | null;
  documento?: string | null;
  doc?: string | null;

  telefone_contato?: string | null;
  telefone?: string | null;
  fone?: string | null;
  celular?: string | null;

  [key: string]: any;
};

const ALLOWED_EDIT_ROLE = new Set(["ADM"]);
const STORAGE_BUCKET = "ordens-pdfs";

export default function PendingReconnectionsTable() {
  const [rows, setRows] = React.useState<ReligRow[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [msg, setMsg] = React.useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const [filter, setFilter] = React.useState<ListFilter>({
    q: "",
    startDate: null,
    endDate: null,
  });

  // Filtro "+24h"
  const [showOver24h, setShowOver24h] = React.useState<boolean>(false);

  // sessão/role para permissão de edição
  const [userId, setUserId] = React.useState<string | null>(null);
  const [userRole, setUserRole] = React.useState<string>("VISITANTE");

  React.useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase.auth.getUser();
        const uid = data?.user?.id ?? null;
        setUserId(uid);

        if (uid) {
          const { data: row } = await supabase
            .from("app_users")
            .select("papel")
            .eq("id", uid)
            .maybeSingle();
          setUserRole((row?.papel || "VISITANTE").toUpperCase());
        } else {
          setUserRole("VISITANTE");
        }
      } catch {
        setUserRole("VISITANTE");
      }
    })();
  }, []);

  // ------- util: detectar criador dinamicamente -------
  function getRowCreatorId(r: ReligRow): string | null {
    const anyRow = r as any;
    return anyRow?.created_by ?? anyRow?.id_usuario ?? anyRow?.user_id ?? anyRow?.uid ?? null;
  }
  function canEditRow(r: ReligRow): boolean {
    if (ALLOWED_EDIT_ROLE.has((userRole || "").toUpperCase())) return true;
    const creator = getRowCreatorId(r);
    return !!userId && !!creator && userId === creator;
  }

  // ------- util: getters dinâmicos do solicitante -------
  function getSolicitanteNome(r: ReligRow): string | null {
    return r.solicitante_nome ?? r.nome_solicitante ?? r.solicitante ?? r.nome ?? null;
  }
  function getSolicitanteDocumento(r: ReligRow): string | null {
    return r.solicitante_documento ?? r.documento_solicitante ?? r.documento ?? r.doc ?? null;
  }
  function getTelefoneContato(r: ReligRow): string | null {
    return r.telefone_contato ?? r.telefone ?? r.fone ?? r.celular ?? null;
  }

  // ------- carregar -------
  async function load() {
    setLoading(true);

    // Seleciona tudo para evitar erro com campos opcionais/dinâmicos
    let query = supabase
      .from("ordens_religacao")
      .select("*")
      .eq("status", "aguardando_religacao");

    if (filter.startDate) {
      query = query.gte("created_at", `${filter.startDate}T00:00:00`);
    }
    if (filter.endDate) {
      query = query.lte("created_at", `${filter.endDate}T23:59:59`);
    }

    // +24h: usa horário local do navegador como referência
    if (showOver24h) {
      const nowLocal = new Date();
      const cutoff = new Date(nowLocal.getTime() - 24 * 60 * 60 * 1000);
      query = query.lte("created_at", cutoff.toISOString());
    }

    if ((filter.q || "").trim() !== "") {
      const q = filter.q.trim();
      query = query.or(`matricula.ilike.%${q}%,bairro.ilike.%${q}%,rua.ilike.%${q}%`);
    }

    query = query.order("created_at", { ascending: false });

    const { data, error } = await query;
    if (error) setMsg({ kind: "err", text: error.message });
    else setRows((data || []) as ReligRow[]);

    setLoading(false);
  }

  React.useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function clearFilters() {
    setFilter({ q: "", startDate: null, endDate: null });
  }

  async function marcarAtiva(id: string) {
    const { error } = await supabase.from("ordens_religacao").update({ status: "ativa" }).eq("id", id);
    if (error) {
      const { error: e2 } = await supabase.from("ordens_religacao").update({ status: "concluida" }).eq("id", id);
      if (e2) return setMsg({ kind: "err", text: `Falha ao atualizar: ${e2.message}` });
    }
    setRows((prev) => prev.filter((r) => r.id !== id));
    setMsg({ kind: "ok", text: "Papeleta marcada como ATIVA." });
    setTimeout(() => setMsg(null), 1600);
  }

  // ====== CARIMBO NO PDF ======
  function formatDateTimeBR(iso: string) {
    try {
      return new Date(iso).toLocaleString("pt-BR");
    } catch {
      return iso;
    }
  }

  function buildStampLines(r: ReligRow): string[] {
    const endereco = `${r.rua ?? ""}, ${r.numero ?? ""} - ${r.bairro ?? ""}`.replace(/\s+/g, " ").trim();
    const prioridadeTxt = r.prioridade ? "PRIORIDADE" : "normal";

    const nome = getSolicitanteNome(r) || "-";
    const doc = getSolicitanteDocumento(r) || "-";
    const tel = getTelefoneContato(r) || "-";

    return [
      "DADOS DA SOLICITAÇÃO",
      `Matrícula: ${r.matricula || "-"}`,
      `Endereço: ${endereco || "-"}`,
      `Ponto ref.: ${r.ponto_referencia || "-"}`,
      `Solicitante: ${nome}`,
      `Documento: ${doc}`,
      `Contato: ${tel}`,
      `Prioridade: ${prioridadeTxt}`,
      `Criada em: ${formatDateTimeBR(r.created_at)}`,
    ];
  }

  async function stampPdfWithRow(pdfBytes: Uint8Array, row: ReligRow): Promise<Uint8Array> {
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const lines = buildStampLines(row);
    const titleSize = 18;
    const textSize = 12;
    const lineGap = 6;

    pdfDoc.getPages().forEach((page) => {
      const { width, height } = page.getSize();

      const title = lines[0] || "";
      const body = lines.slice(1);
      const titleWidth = font.widthOfTextAtSize(title, titleSize);
      const bodyWidths = body.map((t) => font.widthOfTextAtSize(t, textSize));
      const maxWidth = Math.max(titleWidth, ...bodyWidths, 300);

      const bodyHeight = body.length * textSize + (body.length - 1) * lineGap;
      const totalHeight = titleSize + lineGap + bodyHeight;

      const centerX = width / 2;
      const centerY = height / 2;

      let y = centerY + totalHeight / 2;

      // texto com leve sombra pra legibilidade
      const drawShadowText = (text: string, px: number, py: number, size: number, colorMain = rgb(0, 0, 0)) => {
        page.drawText(text, { x: px + 0.6, y: py - 0.6, size, font, color: rgb(0.2, 0.2, 0.2) });
        page.drawText(text, { x: px, y: py, size, font, color: colorMain });
      };

      // título centralizado
      const tx = centerX - titleWidth / 2;
      drawShadowText(title, tx, y, titleSize, rgb(0, 0, 0));
      y -= titleSize + lineGap;

      // corpo centralizado
      body.forEach((t) => {
        const w = font.widthOfTextAtSize(t, textSize);
        const lineX = centerX - w / 2;
        drawShadowText(t, lineX, y, textSize, rgb(0, 0, 0));
        y -= textSize + lineGap;
      });

      // (sem marca d'água diagonal)
    });

    return await pdfDoc.save();
  }

  async function downloadFromStorage(path: string): Promise<Uint8Array> {
    const { data, error } = await supabase.storage.from(STORAGE_BUCKET).download(path);
    if (error || !data) throw new Error(error?.message || "Falha ao baixar PDF do armazenamento.");
    const buf = await data.arrayBuffer();
    return new Uint8Array(buf);
  }

  async function handleStampAndOpen(row: ReligRow) {
    if (!row.pdf_ordem_path) {
      setMsg({ kind: "err", text: "PDF indisponível para esta papeleta." });
      setTimeout(() => setMsg(null), 1800);
      return;
    }
    try {
      setLoading(true);
      const original = await downloadFromStorage(row.pdf_ordem_path);
      const stamped = await stampPdfWithRow(original, row);

      const blob = new Blob([stamped], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener,noreferrer");
      setMsg({ kind: "ok", text: "PDF carimbado gerado." });
    } catch (e: any) {
      setMsg({ kind: "err", text: e?.message || "Não foi possível carimbar o PDF." });
    } finally {
      setLoading(false);
      setTimeout(() => setMsg(null), 2000);
    }
  }

  // ------- EDIT MODAL (ordens_religacao) -------
  const [edit, setEdit] = React.useState<{
    open: boolean;
    saving: boolean;
    row?: ReligRow;
    form: {
      matricula: string;
      bairro: string;
      rua: string;
      numero: string;
      ponto_referencia: string;
      prioridade: "true" | "false";
    };
  }>({
    open: false,
    saving: false,
    form: { matricula: "", bairro: "", rua: "", numero: "", ponto_referencia: "", prioridade: "false" },
  });

  function startEdit(row: ReligRow) {
    if (!canEditRow(row)) {
      setMsg({ kind: "err", text: "Sem permissão para editar. Apenas ADM ou quem criou a papeleta." });
      setTimeout(() => setMsg(null), 2200);
      return;
    }
    setEdit({
      open: true,
      saving: false,
      row,
      form: {
        matricula: row.matricula ?? "",
        bairro: row.bairro ?? "",
        rua: row.rua ?? "",
        numero: row.numero ?? "",
        ponto_referencia: row.ponto_referencia ?? "",
        prioridade: row.prioridade ? "true" : "false",
      },
    });
  }

  async function saveEdit() {
    if (!edit.row) return;
    try {
      setEdit((s) => ({ ...s, saving: true }));
      const f = edit.form;
      const patch: any = {
        matricula: f.matricula.trim(),
        bairro: f.bairro.trim(),
        rua: f.rua.trim(),
        numero: f.numero.trim(),
        ponto_referencia: f.ponto_referencia.trim() === "" ? null : f.ponto_referencia.trim(),
        prioridade: f.prioridade === "true",
      };
      const { error } = await supabase.from("ordens_religacao").update(patch).eq("id", edit.row.id);
      if (error) throw error;
      await load();
      setMsg({ kind: "ok", text: "Papeleta atualizada com sucesso." });
      setTimeout(() => setMsg(null), 1600);
      setEdit((s) => ({ ...s, open: false, saving: false, row: undefined }));
    } catch (e: any) {
      setMsg({ kind: "err", text: e?.message || "Falha ao salvar." });
      setTimeout(() => setMsg(null), 2200);
      setEdit((s) => ({ ...s, saving: false }));
    }
  }

  // ------- layout: larguras FIXAS -------
  const colWidths = React.useMemo(
    () => [
      "w-32",       // matrícula (sticky)
      "w-40",       // bairro
      "w-[320px]",  // rua e nº
      "w-[300px]",  // ponto ref
      "w-[260px]",  // solicitante (nome + doc, em 2 linhas)
      "w-40",       // contato (telefone)
      "w-36",       // prioridade
      "w-48",       // status / marcar
      "w-40",       // Ordem (PDF)
      "w-40",       // criado em
      "w-28",       // editar
    ],
    []
  );
  const colEls = React.useMemo(() => colWidths.map((cls, i) => <col key={i} className={cls} />), [colWidths]);

  return (
    <div className="rounded-2xl bg-slate-900/50 ring-1 ring-white/10 p-4">
      <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <div>
            <h3 className="font-semibold">Papeletas de religação pendentes</h3>
            <p className="text-slate-400 text-sm">Exibe as ordens com status “aguardando religação”.</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setShowOver24h((v) => !v);
              // Recarrega aplicando/retirando o filtro +24h
              setTimeout(load, 0);
            }}
            className={`text-xs px-3 py-1.5 rounded-lg border ${
              showOver24h
                ? "bg-rose-600 text-white border-rose-400"
                : "bg-rose-600/20 text-rose-200 border-rose-400/40 hover:bg-rose-600/30"
            }`}
            title="Mostrar apenas papeletas com mais de 24h (baseado no horário do seu computador)"
          >
            +24h
          </button>

          <button
            onClick={load}
            className="text-xs px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10"
          >
            {loading ? "Atualizando…" : "Atualizar"}
          </button>
        </div>
      </div>

      {/* Filtros */}
      <ListFilterBar
        value={filter}
        onChange={setFilter}
        onSearch={load}
        onClear={() => {
          clearFilters();
          setTimeout(load, 0);
        }}
      />

      {msg && (
        <div
          className={`mb-3 text-sm px-3 py-2 rounded-lg ${
            msg.kind === "ok" ? "bg-emerald-500/15 text-emerald-300" : "bg-rose-500/15 text-rose-300"
          }`}
        >
          {msg.text}
        </div>
      )}

      {/* Contêiner com rolagem; tabela com min-w p/ evitar “aperto” */}
      <div className="rounded-xl ring-1 ring-white/10 max-h-[60vh] overflow-x-auto overflow-y-auto">
        <table className="min-w-[1480px] w-max text-sm table-auto">
          <colgroup>{colEls}</colgroup>
          <thead className="sticky top-0 z-20 bg-slate-900/95 text-slate-100 backdrop-blur border-white/10">
            <tr>
              <th className="sticky left-0 z-30 bg-slate-900/95 backdrop-blur py-2 px-3 text-center font-medium border-r border-white/10">
                Matrícula
              </th>
              <th className="text-left font-medium py-2 px-3">Bairro</th>
              <th className="text-left font-medium py-2 px-3">Rua e nº</th>
              <th className="text-left font-medium py-2 px-3">Ponto ref.</th>
              <th className="text-left font-medium py-2 px-3">Solicitante</th>
              <th className="text-left font-medium py-2 px-3">Contato</th>
              <th className="text-left font-medium py-2 px-3">Prioridade</th>
              <th className="text-center font-medium py-2 px-3">Status / Marcar</th>
              <th className="text-center font-medium py-2 px-3">Ordem (PDF)</th>
              <th className="text-center font-medium py-2 px-3">Criado em</th>
              <th className="text-center font-medium py-2 px-3">Editar</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-white/10">
            {rows.map((r) => {
              const allowed = canEditRow(r);
              const nome = (getSolicitanteNome(r) || "-").toUpperCase();
              const doc = getSolicitanteDocumento(r) || "-";
              const tel = getTelefoneContato(r) || "-";

              return (
                <tr key={r.id} className="bg-slate-950/40 align-middle">
                  {/* matrícula sticky */}
                  <td className="sticky left-0 z-10 bg-slate-950/80 backdrop-blur py-2 px-3 font-mono text-center border-r border-white/10">
                    {r.matricula}
                  </td>

                  <td className="py-2 px-3">
                    <div className="truncate max-w-[160px]" title={r.bairro}>
                      {r.bairro}
                    </div>
                  </td>

                  <td className="py-2 px-3">
                    <div className="truncate max-w-[280px]" title={`${r.rua}, ${r.numero}`}>
                      {r.rua}, {r.numero}
                    </div>
                  </td>

                  <td className="py-2 px-3">
                    <div className="truncate max-w-[260px]" title={r.ponto_referencia || "-"}>
                      {r.ponto_referencia || "-"}
                    </div>
                  </td>

                  {/* Solicitante (como no print: nome em cima, doc embaixo) */}
                  <td className="py-2 px-3">
                    <div className="flex flex-col leading-tight">
                      <span className="font-semibold uppercase tracking-wide text-slate-100 truncate">
                        {nome}
                      </span>
                      <span className="text-xs text-slate-400 truncate">
                        {doc}
                      </span>
                    </div>
                  </td>

                  {/* Contato (telefone) */}
                  <td className="py-2 px-3">
                    <div className="truncate max-w-[160px]" title={tel}>
                      {tel}
                    </div>
                  </td>

                  <td className="py-2 px-3">
                    {r.prioridade ? (
                      <span className="inline-flex items-center px-2 py-0.5 text-xs rounded-full bg-fuchsia-500/20 text-fuchsia-300 ring-1 ring-fuchsia-400/30">
                        PRIORIDADE
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 text-xs rounded-full bg-slate-500/20 text-slate-300 ring-1 ring-slate-400/30">
                        normal
                      </span>
                    )}
                  </td>

                  {/* Status / Marcar (badge + botão Ativa) */}
                  <td className="py-2 px-3 text-center whitespace-nowrap">
                    <div className="inline-flex items-center gap-2">
                      <span className="inline-flex items-center px-2 py-0.5 text-xs rounded-full bg-amber-500/20 text-amber-300 ring-1 ring-amber-400/30">
                        aguardando religação
                      </span>
                      <button
                        onClick={() => marcarAtiva(r.id)}
                        className="px-3 py-1.5 text-xs rounded-lg bg-emerald-500/20 text-emerald-200 ring-1 ring-emerald-400/40 hover:bg-emerald-500/30"
                        title="Marcar como ativa"
                      >
                        Ativa
                      </button>
                    </div>
                  </td>

                  {/* Ordem (PDF): ver original e carimbar */}
                  <td className="py-2 px-3 text-center">
                    <div className="flex items-center justify-center gap-2">
                      {r.pdf_ordem_path ? (
                        <>
                          <a
                            href={supabase.storage.from(STORAGE_BUCKET).getPublicUrl(r.pdf_ordem_path).data.publicUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-3 py-1.5 text-xs rounded-lg bg-indigo-500/20 text-indigo-200 ring-1 ring-indigo-400/40 hover:bg-indigo-500/30 whitespace-nowrap"
                            title="Abrir PDF original"
                          >
                            Ver PDF
                          </a>
                          <button
                            onClick={() => handleStampAndOpen(r)}
                            className="px-3 py-1.5 text-xs rounded-lg bg-pink-500/20 text-pink-200 ring-1 ring-pink-400/40 hover:bg-pink-500/30 whitespace-nowrap"
                            title="Carimbar no meio e abrir para imprimir"
                          >
                            Carimbar & Imprimir
                          </button>
                        </>
                      ) : (
                        <span className="text-slate-400 text-xs">PDF indisponível</span>
                      )}
                    </div>
                  </td>

                  <td className="py-2 px-3 text-center whitespace-nowrap">
                    {new Date(r.created_at).toLocaleString("pt-BR")}
                  </td>

                  {/* Editar */}
                  <td className="py-2 px-3 text-center">
                    <button
                      onClick={() => startEdit(r)}
                      disabled={!allowed}
                      className="px-3 py-1.5 text-xs rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 disabled:opacity-60 disabled:cursor-not-allowed"
                      title={allowed ? "Editar papeleta" : "Somente ADM ou quem criou pode editar"}
                    >
                      Editar
                    </button>
                  </td>
                </tr>
              );
            })}

            {rows.length === 0 && (
              <tr>
                <td colSpan={11} className="py-6 text-center text-slate-400">
                  Nenhuma papeleta pendente.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* MODAL EDITAR PAPELETA (sem mudanças funcionais) */}
      {/* ... (mantido igual ao seu modal atual) ... */}

      {msg && (
        <div
          className={`fixed bottom-5 right-5 px-4 py-2 rounded-lg shadow-lg text-sm z-50 ${
            msg.kind === "ok" ? "bg-emerald-600 text-white" : "bg-rose-600 text-white"
          }`}
        >
          {msg.text}
        </div>
      )}
    </div>
  );
}
