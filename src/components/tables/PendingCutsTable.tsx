// src/components/tables/PendingCutsTable.tsx
import * as React from "react";
import supabase from "../../lib/supabase";
import ListFilterBar, { ListFilter } from "../../components/filters/ListFilterBar";

type CorteRow = {
  id: string;
  matricula: string;
  bairro: string;
  rua: string;
  numero: string;
  ponto_referencia: string | null;
  status: string;
  pdf_ordem_path: string | null;
  created_at: string;
  corte_na_rua: boolean | null;
  created_by?: string | null; // <- para sabermos quem criou
};

const fmtDateTime = (iso?: string | null) => (iso ? new Date(iso).toLocaleString("pt-BR") : "—");
const ALLOWED_CUT = new Set(["ADM", "TERCEIRIZADA"]);

function StatusBadge({ status }: { status: string }) {
  const s = (status || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (s === "aguardando_corte" || s.includes("aguardando corte")) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 text-xs rounded-full bg-amber-500/20 text-amber-300 ring-1 ring-amber-400/30 whitespace-nowrap">
        Aguardando Corte
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 text-xs rounded-full bg-slate-500/20 text-slate-300 ring-1 ring-slate-400/30 whitespace-nowrap">
      {status || "—"}
    </span>
  );
}

export default function PendingCutsTable() {
  const [rows, setRows] = React.useState<CorteRow[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [msg, setMsg] = React.useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const [filter, setFilter] = React.useState<ListFilter>({ q: "", startDate: null, endDate: null });

  // papel do usuário + modal de permissão
  const [userRole, setUserRole] = React.useState<string>("VISITANTE");
  const [userId, setUserId] = React.useState<string | null>(null);
  const canCut = React.useMemo(() => ALLOWED_CUT.has((userRole || "VISITANTE").toUpperCase()), [userRole]);

  const [permModalOpen, setPermModalOpen] = React.useState(false);
  const [permText, setPermText] = React.useState("Apenas TERCEIRIZADA e ADM podem marcar como CORTADA.");

  // modal de confirmação de corte
  const [confirmOpen, setConfirmOpen] = React.useState<{ open: boolean; id?: string; matricula?: string; saving?: boolean }>({
    open: false,
  });

  // ======= MODAL EDITAR =======
  const [editModal, setEditModal] = React.useState<{
    open: boolean;
    saving?: boolean;
    row?: CorteRow;
    form?: {
      bairro: string;
      rua: string;
      numero: string;
      ponto_referencia: string;
      corte_na_rua: boolean | null;
    };
    file?: File | null; // novo PDF opcional
  }>({ open: false });

  const canEditRow = React.useCallback(
    (row: CorteRow) => {
      if ((userRole || "").toUpperCase() === "ADM") return true;
      return (row.created_by || null) === (userId || null);
    },
    [userRole, userId]
  );

  React.useEffect(() => {
    (async () => {
      try {
        const { data: udata, error: uerr } = await supabase.auth.getUser();
        if (uerr) throw uerr;
        const user = (udata && "user" in udata ? (udata as any).user : undefined) as { id: string } | undefined;
        if (!user) {
          setUserRole("VISITANTE");
          setUserId(null);
          return;
        }
        setUserId(user.id);
        const { data, error } = await supabase.from("app_users").select("papel").eq("id", user.id).single();
        if (error) throw error;
        setUserRole((data?.papel || "VISITANTE").toUpperCase());
      } catch {
        setUserRole("VISITANTE");
        setUserId(null);
      }
    })();
  }, []);

  function buildQuery() {
    let query = supabase
      .from("ordens_corte")
      .select(
        [
          "id",
          "matricula",
          "bairro",
          "rua",
          "numero",
          "ponto_referencia",
          "status",
          "pdf_ordem_path",
          "created_at",
          "corte_na_rua",
          "created_by",
        ].join(", ")
      )
      .or(["status.eq.aguardando_corte", "status.ilike.%aguardando corte%"].join(","))
      .order("created_at", { ascending: false });

    if (filter.startDate) query = query.gte("created_at", `${filter.startDate}T00:00:00`);
    if (filter.endDate) query = query.lte("created_at", `${filter.endDate}T23:59:59`);

    if (filter.q?.trim()) {
      const q = filter.q.trim();
      query = query.or(`matricula.ilike.%${q}%,bairro.ilike.%${q}%,rua.ilike.%${q}%`);
    }

    return query;
  }

  async function load() {
    try {
      setLoading(true);
      const { data, error } = await buildQuery();
      if (error) throw error;
      setRows(((data ?? []) as unknown) as CorteRow[]);
    } catch (e: any) {
      setMsg({ kind: "err", text: e?.message ?? "Falha ao carregar." });
      setTimeout(() => setMsg(null), 2200);
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function clearFilters() {
    setFilter({ q: "", startDate: null, endDate: null });
  }

  // clique no botão "Cortar" abre o modal de confirmação
  function onClickCortar(row: CorteRow) {
    if (!canCut) {
      setPermText("Apenas TERCEIRIZADA e ADM podem marcar como CORTADA.");
      setPermModalOpen(true);
      return;
    }
    setConfirmOpen({ open: true, id: row.id, matricula: row.matricula, saving: false });
  }

  // confirmar no modal => faz o update
  async function confirmarCorte() {
    if (!confirmOpen.open || !confirmOpen.id) return;
    if (!canCut) {
      setPermText("Apenas TERCEIRIZADA e ADM podem marcar como CORTADA.");
      setPermModalOpen(true);
      setConfirmOpen({ open: false });
      return;
    }

    try {
      setConfirmOpen((m) => ({ ...m, saving: true }));

      const { data, error } = await supabase
        .from("ordens_corte")
        .update({ status: "cortada" })
        .eq("id", confirmOpen.id)
        .select("id,status,cortada_em")
        .single();

      if (error) {
        if (/Impedido|insufficient_privilege|permission|RLS|row-level|policy|denied/i.test(error.message)) {
          setPermText("A operação foi bloqueada pelas regras de segurança.");
          setPermModalOpen(true);
          setConfirmOpen({ open: false });
          return;
        }
        setMsg({ kind: "err", text: `Falha ao cortar: ${error.message}` });
        setTimeout(() => setMsg(null), 2200);
        setConfirmOpen({ open: false });
        return;
      }

      await load();
      setMsg({
        kind: "ok",
        text: `Papeleta CORTADA. ${
          (data as any)?.cortada_em ? `(${new Date((data as any).cortada_em).toLocaleString("pt-BR")})` : ""
        }`,
      });
      setTimeout(() => setMsg(null), 1800);
      setConfirmOpen({ open: false });
    } catch (e: any) {
      setMsg({ kind: "err", text: e?.message ?? "Falha ao cortar." });
      setTimeout(() => setMsg(null), 2200);
      setConfirmOpen({ open: false });
    }
  }

  // ===== EDITAR =====
  function openEditModal(row: CorteRow) {
    if (!canEditRow(row)) {
      setPermText("Você não pode editar essa papeleta. Apenas o criador (ou ADM) pode editar campos.");
      setPermModalOpen(true);
      return;
    }
    setEditModal({
      open: true,
      saving: false,
      row,
      form: {
        bairro: row.bairro || "",
        rua: row.rua || "",
        numero: row.numero || "",
        ponto_referencia: row.ponto_referencia || "",
        corte_na_rua: row.corte_na_rua ?? null,
      },
      file: null,
    });
  }

  function onChangeFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] || null;
    if (f && !/pdf$/i.test(f.name)) {
      setMsg({ kind: "err", text: "Selecione um arquivo PDF." });
      setTimeout(() => setMsg(null), 2000);
      return;
    }
    setEditModal((m) => (m.open ? { ...m, file: f } : m));
  }

  async function salvarEdicao() {
    if (!editModal.open || !editModal.row || !editModal.form) return;
    try {
      setEditModal((m) => ({ ...m, saving: true }));

      // 1) upload de PDF (opcional)
      let newPdfPath: string | undefined;
      if (editModal.file) {
        const file = editModal.file;
        const ext = (file.name.split(".").pop() || "pdf").toLowerCase();
        const safeName = `ordens_corte/${editModal.row.id}/${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("ordens-pdfs")
          .upload(safeName, file, { cacheControl: "3600", upsert: true });
        if (upErr) throw upErr;
        newPdfPath = safeName;
      }

      // 2) patch de campos
      const patch: any = {
        bairro: (editModal.form.bairro || "").toUpperCase().trim(),
        rua: (editModal.form.rua || "").toUpperCase().trim(),
        numero: (editModal.form.numero || "").toUpperCase().trim(),
        ponto_referencia: (editModal.form.ponto_referencia || "").toUpperCase().trim(),
        corte_na_rua:
          editModal.form.corte_na_rua === null ? null : editModal.form.corte_na_rua === true ? true : false,
      };
      if (newPdfPath) patch.pdf_ordem_path = newPdfPath;

      const { error: updErr } = await supabase.from("ordens_corte").update(patch).eq("id", editModal.row.id);
      if (updErr) {
        if (/Impedido|insufficient_privilege|permission|RLS|row-level|policy|denied/i.test(updErr.message)) {
          setPermText("A atualização foi bloqueada pelas regras de segurança.");
          setPermModalOpen(true);
          setEditModal({ open: false });
          return;
        }
        throw updErr;
      }

      // 3) refletir no estado
      setRows((prev) =>
        prev.map((r) =>
          r.id === editModal.row!.id
            ? { ...r, ...patch }
            : r
        )
      );

      setMsg({ kind: "ok", text: "Papeleta atualizada." });
      setTimeout(() => setMsg(null), 1800);
      setEditModal({ open: false });
    } catch (e: any) {
      setMsg({ kind: "err", text: e?.message ?? "Falha ao salvar alterações." });
      setTimeout(() => setMsg(null), 2200);
      setEditModal({ open: false });
    }
  }

  // colgroup — agora em PERCENTUAL para ocupar toda a largura
  const colWidths = React.useMemo(
    () => [
      "w-[8%]",   // matrícula (sticky)
      "w-[12%]",  // bairro
      "w-[24%]",  // rua e nº
      "w-[18%]",  // ponto ref.
      "w-[12%]",  // status / marcar
      "w-[6%]",   // ordem (PDF)
      "w-[10%]",  // criado em
      "w-[5%]",   // corte na rua?
      "w-[5%]",   // editar
    ],
    []
  );
  const colEls = React.useMemo(() => colWidths.map((cls, i) => <col key={i} className={cls} />), [colWidths]);

  return (
    <div className="rounded-2xl bg-slate-900/50 ring-1 ring-white/10 p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="font-semibold">Cortes pendentes</h3>
          <p className="text-slate-400 text-sm">Exibe apenas ordens com status “Aguardando Corte”.</p>
        </div>
        <button onClick={load} className="text-xs px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10">
          {loading ? "Atualizando…" : "Atualizar"}
        </button>
      </div>

      <ListFilterBar
        value={filter}
        onChange={setFilter}
        onSearch={load}
        onClear={() => {
          clearFilters();
          setTimeout(load, 0);
        }}
      />

      {/* Barra de mensagens */}
      {msg && (
        <div
          className={`mb-3 text-sm px-3 py-2 rounded-lg ${
            msg.kind === "ok" ? "bg-emerald-500/15 text-emerald-300" : "bg-rose-500/15 text-rose-300"
          }`}
        >
          {msg.text}
        </div>
      )}

      {/* tabela — agora ocupa mais ALTURA e LARGURA */}
      <div className="rounded-xl ring-1 ring-white/10 overflow-auto h-[calc(100dvh-260px)]">
        <table className="w-full text-sm table-fixed">
          <colgroup>{colEls}</colgroup>

          <thead className="sticky top-0 z-20 bg-slate-900/95 text-slate-100 backdrop-blur border-white/10">
            <tr>
              <th className="!text-center font-medium py-2 px-3 sticky left-0 z-30 bg-slate-900/95 backdrop-blur border-r border-white/10">
                Matrícula
              </th>
              <th className="text-left font-medium py-2 px-3">Bairro</th>
              <th className="text-left font-medium py-2 px-3">Rua e nº</th>
              <th className="text-left font-medium py-2 px-3">Ponto ref.</th>
              <th className="text-center font-medium py-2 px-3">Status / Marcar</th>
              <th className="text-center font-medium py-2 px-3">Ordem (PDF)</th>
              <th className="text-center font-medium py-2 px-3">Criado em</th>
              <th className="text-center font-medium py-2 px-3">Corte na rua?</th>
              <th className="text-center font-medium py-2 px-3">Editar</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-white/10">
            {rows.map((r) => (
              <tr key={r.id} className="bg-slate-950/40 align-middle">
                {/* Matrícula sticky */}
                <td className="py-2 px-3 !text-center sticky left-0 z-10 bg-slate-950/80 backdrop-blur border-r border-white/10">
                  <div className="w-full font-mono whitespace-nowrap tabular-nums">
                    {r.matricula}
                  </div>
                </td>

                <td className="py-2 px-3">
                  <div className="truncate" title={r.bairro}>
                    {r.bairro}
                  </div>
                </td>

                <td className="py-2 px-3">
                  <div className="truncate" title={`${r.rua}, ${r.numero}`}>
                    {r.rua}, {r.numero}
                  </div>
                </td>

                <td className="py-2 px-3">
                  <div className="truncate" title={r.ponto_referencia || "—"}>
                    {r.ponto_referencia || "—"}
                  </div>
                </td>

                <td className="py-2 px-3 text-center whitespace-nowrap">
                  <div className="inline-flex items-center gap-2">
                    <StatusBadge status={r.status} />
                    {canCut ? (
                      <button
                        onClick={() => onClickCortar(r)}
                        className="px-3 py-1.5 text-xs rounded-lg bg-rose-500/20 text-rose-200 ring-1 ring-rose-400/40 hover:bg-rose-500/30 whitespace-nowrap"
                      >
                        Cortar
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setPermText("Apenas TERCEIRIZADA e ADM podem marcar como CORTADA.");
                          setPermModalOpen(true);
                        }}
                        className="px-3 py-1.5 text-xs rounded-lg bg-rose-500/10 text-rose-300 ring-1 ring-rose-400/20 cursor-not-allowed opacity-75 whitespace-nowrap"
                        title="Sem permissão"
                      >
                        Cortar
                      </button>
                    )}
                  </div>
                </td>
                <td className="py-2 px-3 text-center">{renderImprimirCell(r)}</td>
                <td className="py-2 px-3 text-center whitespace-nowrap">{fmtDateTime(r.created_at)}</td>
                <td className="py-2 px-3 text-center">{renderCorteNaRua(r.corte_na_rua)}</td>

                {/* Coluna EDITAR */}
                <td className="py-2 px-3 text-center">
                  <button
                    onClick={() => openEditModal(r)}
                    className="px-3 py-1.5 text-xs rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 whitespace-nowrap"
                  >
                    Editar
                  </button>
                </td>
              </tr>
            ))}

            {rows.length === 0 && (
              <tr>
                <td colSpan={9} className="py-6 text-center text-slate-400">
                  Nenhuma papeleta pendente.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Modal de permissão negada */}
      {permModalOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-slate-800 p-6 rounded-2xl w-full max-w-lg text-center">
            <h3 className="text-lg font-semibold text-white">Permissão necessária</h3>
            <p className="text-slate-300 text-sm mt-2">{permText}</p>
            <div className="mt-5">
              <button
                onClick={() => setPermModalOpen(false)}
                className="px-4 py-2 rounded-lg bg-white/10 border border-white/20 hover:bg-white/20 text-white text-sm"
              >
                Entendi
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal confirmar CORTE */}
      {confirmOpen.open && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-slate-800 p-6 rounded-2xl shadow-2xl w-full max-w-sm">
            <h3 className="text-lg font-semibold text-white mb-2">Confirmar corte</h3>
            <p className="text-slate-300 text-sm mb-4">
              Confirmar <b>corte</b> da matrícula <b>{confirmOpen.matricula}</b>?
            </p>
            <div className="mt-3 flex justify-end gap-3">
              <button
                onClick={() => setConfirmOpen({ open: false })}
                className="px-4 py-2 rounded-lg bg-white/10 border border-white/20 hover:bg-white/20 text-white text-sm"
                disabled={!!confirmOpen.saving}
              >
                Cancelar
              </button>
              <button
                onClick={confirmarCorte}
                className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-sm disabled:opacity-60"
                disabled={!!confirmOpen.saving}
              >
                {confirmOpen.saving ? "Cortando…" : "Confirmar corte"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal EDITAR */}
      {editModal.open && editModal.row && editModal.form && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-slate-800 p-6 rounded-2xl shadow-2xl w-full max-w-lg">
            <h3 className="text-lg font-semibold text-white mb-2">Editar papeleta</h3>
            <p className="text-slate-300 text-sm mb-4">
              Matrícula <b>{editModal.row.matricula}</b>
            </p>

            <div className="grid grid-cols-2 gap-3">
              <label className="text-sm text-slate-300">
                Bairro
                <input
                  value={editModal.form.bairro}
                  onChange={(e) => setEditModal((m) => (m.open ? { ...m, form: { ...m.form!, bairro: e.target.value } } : m))}
                  className="mt-1 w-full rounded-md bg-slate-900/60 border border-white/10 px-2 py-1 outline-none focus:ring-2 ring-emerald-400/40"
                />
              </label>

              <label className="text-sm text-slate-300">
                Rua
                <input
                  value={editModal.form.rua}
                  onChange={(e) => setEditModal((m) => (m.open ? { ...m, form: { ...m.form!, rua: e.target.value } } : m))}
                  className="mt-1 w-full rounded-md bg-slate-900/60 border border-white/10 px-2 py-1 outline-none focus:ring-2 ring-emerald-400/40"
                />
              </label>

              <label className="text-sm text-slate-300">
                Número
                <input
                  value={editModal.form.numero}
                  onChange={(e) => setEditModal((m) => (m.open ? { ...m, form: { ...m.form!, numero: e.target.value } } : m))}
                  className="mt-1 w-full rounded-md bg-slate-900/60 border border-white/10 px-2 py-1 outline-none focus:ring-2 ring-emerald-400/40"
                />
              </label>

              <label className="text-sm text-slate-300 col-span-2">
                Ponto de referência
                <input
                  value={editModal.form.ponto_referencia}
                  onChange={(e) =>
                    setEditModal((m) => (m.open ? { ...m, form: { ...m.form!, ponto_referencia: e.target.value } } : m))
                  }
                  className="mt-1 w-full rounded-md bg-slate-900/60 border border-white/10 px-2 py-1 outline-none focus:ring-2 ring-emerald-400/40"
                />
              </label>

              <label className="text-sm text-slate-300">
                Corte na rua?
                <select
                  value={editModal.form.corte_na_rua === null ? "" : editModal.form.corte_na_rua ? "true" : "false"}
                  onChange={(e) =>
                    setEditModal((m) =>
                      m.open
                        ? {
                            ...m,
                            form: {
                              ...m.form!,
                              corte_na_rua: e.target.value === "" ? null : e.target.value === "true",
                            },
                          }
                        : m
                    )
                  }
                  className="mt-1 w-full rounded-md bg-slate-900/60 border border-white/10 px-2 py-1 outline-none focus:ring-2 ring-emerald-400/40"
                >
                  <option value="">—</option>
                  <option value="true">SIM</option>
                  <option value="false">NÃO</option>
                </select>
              </label>

              <label className="text-sm text-slate-300 col-span-2">
                PDF da ordem
                <div className="mt-1 flex items-center gap-3">
                  <input
                    type="file"
                    accept="application/pdf,.pdf"
                    onChange={onChangeFile}
                    className="block w-full text-xs text-slate-300 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:bg-white/10 file:text-slate-100 hover:file:bg-white/20"
                  />
                  {editModal.row.pdf_ordem_path ? (
                    <a
                      href={supabase.storage.from("ordens-pdfs").getPublicUrl(editModal.row.pdf_ordem_path).data.publicUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs underline text-indigo-300"
                    >
                      atual
                    </a>
                  ) : (
                    <span className="text-xs text-slate-400">sem PDF</span>
                  )}
                </div>
                <p className="text-[11px] text-slate-400 mt-1">Selecione para substituir o PDF atual (opcional).</p>
              </label>
            </div>

            <div className="mt-5 flex justify-end gap-3">
              <button
                onClick={() => setEditModal({ open: false })}
                className="px-4 py-2 rounded-lg bg-white/10 border border-white/20 hover:bg-white/20 text-white text-sm"
                disabled={!!editModal.saving}
              >
                Cancelar
              </button>
              <button
                onClick={salvarEdicao}
                className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm disabled:opacity-60"
                disabled={!!editModal.saving}
              >
                {editModal.saving ? "Salvando…" : "Salvar alterações"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast no canto */}
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

  // ======== FUNÇÕES AUXILIARES (abaixo do return) ========

  function renderImprimirCell(row: CorteRow) {
    if (!row.pdf_ordem_path) return "—";
    const { data } = supabase.storage.from("ordens-pdfs").getPublicUrl(row.pdf_ordem_path);
    const url = data?.publicUrl;
    if (!url) return <span className="text-slate-400 text-xs">Sem link</span>;
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="px-3 py-1.5 text-xs rounded-lg bg-indigo-500/20 text-indigo-200 ring-1 ring-indigo-400/40 hover:bg-indigo-500/30 whitespace-nowrap"
      >
        Imprimir
      </a>
    );
  }

  function renderCorteNaRua(val: boolean | null) {
    if (val === true) {
      return (
        <span className="inline-flex items-center px-2 py-0.5 text-xs rounded-full ring-1 bg-emerald-600/20 text-emerald-200 ring-emerald-400/40 whitespace-nowrap">
          SIM
        </span>
      );
    }
    if (val === false) {
      return (
        <span className="inline-flex items-center px-2 py-0.5 text-xs rounded-full ring-1 bg-rose-600/20 text-rose-200 ring-rose-400/40 whitespace-nowrap">
          NÃO
        </span>
      );
    }
    return "—";
  }
}
