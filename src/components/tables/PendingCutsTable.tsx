// src/components/tables/PendingCutsTable.tsx
import * as React from "react";
import supabase from "../../lib/supabase";
import ListFilterBar, { ListFilter } from "../../components/filters/ListFilterBar";

type CutPendRow = {
  id: string;
  os: string | null;
  matricula: string;
  bairro: string;
  rua: string;
  numero: string;
  ponto_referencia: string | null;
  status: string;
  pdf_path: string | null;
  pdf_ordem_path?: string | null;
  created_at: string;
  corte_na_rua: boolean | null;
  cortada_em: string | null;
};

const norm = (s?: string | null) =>
  (s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim();

function StatusBadge({ status }: { status: string }) {
  const s = norm(status);
  if (s.includes("cortad"))
    return (
      <span className="inline-flex items-center px-2 py-0.5 text-xs rounded-full ring-1 bg-rose-600/20 text-rose-300 ring-rose-400/30">
        Cortada
      </span>
    );
  if (s === "aguardando corte" || s === "aguardando_corte" || (s.includes("aguard") && s.includes("corte")))
    return (
      <span className="inline-flex items-center px-2 py-0.5 text-xs rounded-full ring-1 bg-amber-500/20 text-amber-300 ring-amber-400/30">
        Aguardando Corte
      </span>
    );
  return (
    <span className="inline-flex items-center px-2 py-0.5 text-xs rounded-full ring-1 bg-slate-500/20 text-slate-300 ring-slate-400/30">
      {status}
    </span>
  );
}

const ALLOWED_MARK = new Set(["ADM", "TERCEIRIZADA"]);
const ALLOWED_EDIT_ROLE = new Set(["ADM"]);

export default function PendingCutsTable() {
  const [rows, setRows] = React.useState<CutPendRow[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [msg, setMsg] = React.useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const [filter, setFilter] = React.useState<ListFilter>({ q: "", startDate: null, endDate: null });

  // sessão/role para marcar e editar
  const [userId, setUserId] = React.useState<string | null>(null);
  const [userRole, setUserRole] = React.useState<string>("VISITANTE");
  const canMark = React.useMemo(() => ALLOWED_MARK.has((userRole || "VISITANTE").toUpperCase()), [userRole]);
  const [permOpen, setPermOpen] = React.useState(false);

  React.useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase.auth.getUser();
        const uid = data?.user?.id ?? null;
        setUserId(uid);
        if (!uid) return setUserRole("VISITANTE");
        const { data: row } = await supabase.from("app_users").select("papel").eq("id", uid).maybeSingle();
        setUserRole((row?.papel || "VISITANTE").toUpperCase());
      } catch {
        setUserRole("VISITANTE");
      }
    })();
  }, []);

  // ------- carregar -------
  async function load() {
    setLoading(true);
    try {
      let q = supabase
        .from("ordens_corte")
        .select(
          "id, os, matricula, bairro, rua, numero, ponto_referencia, status, pdf_path, pdf_ordem_path, created_at, corte_na_rua, cortada_em"
        )
        // pega “aguardando corte” em snake_case ou texto livre
        .or("status.eq.aguardando_corte,status.ilike.%aguard%corte%");

      if ((filter.q || "").trim() !== "") {
        const s = filter.q!.trim();
        q = q.or(`matricula.ilike.%${s}%,bairro.ilike.%${s}%,rua.ilike.%${s}%,os.ilike.%${s}%`);
      }

      // filtro por data de CRIAÇÃO
      if (filter.startDate) q = q.gte("created_at", `${filter.startDate}T00:00:00`);
      if (filter.endDate) q = q.lte("created_at", `${filter.endDate}T23:59:59`);

      q = q.order("created_at", { ascending: false });

      const { data, error } = await q;
      if (error) throw error;
      setRows(((data || []) as unknown) as CutPendRow[]);
    } catch (e: any) {
      setMsg({ kind: "err", text: e?.message || "Falha ao carregar." });
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

  const fmt = (iso?: string | null) => (iso ? new Date(iso).toLocaleString("pt-BR") : "—");

  function renderCorteNaRua(val: boolean | null) {
    if (val === true)
      return (
        <span className="inline-flex items-center px-2 py-0.5 text-xs rounded-full ring-1 bg-emerald-600/20 text-emerald-200 ring-emerald-400/40">
          SIM
        </span>
      );
    if (val === false)
      return (
        <span className="inline-flex items-center px-2 py-0.5 text-xs rounded-full ring-1 bg-rose-600/20 text-rose-200 ring-rose-400/30">
          NÃO
        </span>
      );
    return "—";
  }

  // ------- helpers de permissão de edição -------
  function getRowCreatorId(r: CutPendRow): string | null {
    const anyRow = r as any;
    return anyRow?.created_by ?? anyRow?.id_usuario ?? anyRow?.user_id ?? anyRow?.uid ?? null;
  }
  function canEditRow(r: CutPendRow): boolean {
    if (ALLOWED_EDIT_ROLE.has((userRole || "").toUpperCase())) return true;
    const creator = getRowCreatorId(r);
    return !!userId && !!creator && userId === creator;
  }

  // ------- marcar cortada -------
  const [confirm, setConfirm] = React.useState<{ open: boolean; id?: string; matricula?: string; saving?: boolean }>({
    open: false,
  });

  function askMarkCortada(row: CutPendRow) {
    if (!canMark) {
      setPermOpen(true);
      return;
    }
    setConfirm({ open: true, id: row.id, matricula: row.matricula, saving: false });
  }

  async function doMarkCortada() {
    if (!confirm.id) return;
    try {
      setConfirm((c) => ({ ...c, saving: true }));
      const now = new Date().toISOString();
      const { error } = await supabase.from("ordens_corte").update({ status: "cortada", cortada_em: now }).eq("id", confirm.id);
      if (error) throw error;
      await load();
      setMsg({ kind: "ok", text: "OS marcada como cortada." });
      setTimeout(() => setMsg(null), 1600);
    } catch (e: any) {
      setMsg({ kind: "err", text: e?.message || "Não foi possível marcar como cortada." });
      setTimeout(() => setMsg(null), 2200);
    } finally {
      setConfirm({ open: false });
    }
  }

  // ------- imprimir (coluna própria) -------
  function renderPdfCell(row: CutPendRow) {
    const path = row.pdf_path ?? row.pdf_ordem_path ?? null;
    if (!path) return <span className="text-slate-400 text-xs">PDF indisponível</span>;
    const { data } = supabase.storage.from("ordens-pdfs").getPublicUrl(path);
    const url = data?.publicUrl;
    if (!url) return <span className="text-slate-400 text-xs">PDF indisponível</span>;
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

  // ------- EDIT MODAL (ordens_corte) -------
  const [edit, setEdit] = React.useState<{
    open: boolean;
    saving: boolean;
    row?: CutPendRow;
    form: {
      os: string;
      matricula: string;
      bairro: string;
      rua: string;
      numero: string;
      ponto_referencia: string;
      corte_na_rua: "true" | "false" | "null";
    };
  }>({
    open: false,
    saving: false,
    form: { os: "", matricula: "", bairro: "", rua: "", numero: "", ponto_referencia: "", corte_na_rua: "null" },
  });

  function openEdit(row: CutPendRow) {
    if (!canEditRow(row)) {
      setMsg({ kind: "err", text: "Sem permissão para editar. Apenas ADM ou quem criou a OS." });
      setTimeout(() => setMsg(null), 2200);
      return;
    }
    setEdit({
      open: true,
      saving: false,
      row,
      form: {
        os: row.os ?? "",
        matricula: row.matricula ?? "",
        bairro: row.bairro ?? "",
        rua: row.rua ?? "",
        numero: row.numero ?? "",
        ponto_referencia: row.ponto_referencia ?? "",
        corte_na_rua: row.corte_na_rua === true ? "true" : row.corte_na_rua === false ? "false" : "null",
      },
    });
  }

  async function saveEdit() {
    if (!edit.row) return;
    try {
      setEdit((s) => ({ ...s, saving: true }));
      const f = edit.form;
      const patch: any = {
        os: f.os.trim() === "" ? null : f.os.trim(),
        matricula: f.matricula.trim(),
        bairro: f.bairro.trim(),
        rua: f.rua.trim(),
        numero: f.numero.trim(),
        ponto_referencia: f.ponto_referencia.trim() === "" ? null : f.ponto_referencia.trim(),
        corte_na_rua: f.corte_na_rua === "true" ? true : f.corte_na_rua === "false" ? false : null,
      };
      const { error } = await supabase.from("ordens_corte").update(patch).eq("id", edit.row.id);
      if (error) throw error;
      await load();
      setMsg({ kind: "ok", text: "OS atualizada com sucesso." });
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
      "w-32", // matrícula
      "w-40", // bairro
      "w-[320px]", // rua e nº
      "w-[300px]", // ponto ref
      "w-48", // status / marcar
      "w-28", // Ordem (PDF)
      "w-40", // criado em
      "w-36", // corte na rua?
      "w-28", // editar
    ],
    []
  );
  const colEls = React.useMemo(() => colWidths.map((cls, i) => <col key={i} className={cls} />), [colWidths]);

  return (
    <div className="rounded-2xl bg-slate-900/50 ring-1 ring-white/10 p-4">
      <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
        <div>
          <h3 className="font-semibold">Cortes pendentes</h3>
          <p className="text-slate-400 text-sm">Exibe ordens com status “Aguardando Corte”.</p>
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
        <table className="min-w-[1280px] w-max text-sm table-auto">
          <colgroup>{colEls}</colgroup>
          <thead className="sticky top-0 z-20 bg-slate-900/95 text-slate-100 backdrop-blur border-white/10">
            <tr>
              <th className="sticky left-0 z-30 bg-slate-900/95 backdrop-blur py-2 px-3 text-center font-medium border-r border-white/10">
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
            {rows.map((r) => {
              const allowed = canEditRow(r);
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

                  {/* Status / Marcar (badge + botão Cortar) */}
                  <td className="py-2 px-3 text-center whitespace-nowrap">
                    <div className="inline-flex items-center gap-2">
                      <StatusBadge status={r.status} />
                      <button
                        onClick={() => askMarkCortada(r)}
                        className="px-3 py-1.5 text-xs rounded-lg bg-rose-600/20 text-rose-200 ring-1 ring-rose-400/30 hover:bg-rose-600/30 whitespace-nowrap"
                        title="Marcar como cortada"
                      >
                        Cortar
                      </button>
                    </div>
                  </td>

                  {/* Ordem (PDF) — separado */}
                  <td className="py-2 px-3 text-center">{renderPdfCell(r)}</td>

                  <td className="py-2 px-3 text-center whitespace-nowrap">{fmt(r.created_at)}</td>

                  <td className="py-2 px-3 text-center">{renderCorteNaRua(r.corte_na_rua)}</td>

                  <td className="py-2 px-3 text-center">
                    <button
                      onClick={() => openEdit(r)}
                      disabled={!allowed}
                      className="px-3 py-1.5 text-xs rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 disabled:opacity-60 disabled:cursor-not-allowed"
                      title={allowed ? "Editar OS" : "Somente ADM ou quem criou pode editar"}
                    >
                      Editar
                    </button>
                  </td>
                </tr>
              );
            })}

            {rows.length === 0 && (
              <tr>
                <td colSpan={9} className="py-6 text-center text-slate-400">
                  Nenhuma OS encontrada.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Sem permissão para marcar corte */}
      {permOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-slate-800 p-6 rounded-xl shadow-2xl w-full max-w-sm text-center">
            <h3 className="text-lg font-semibold text-white mb-2">Permissão necessária</h3>
            <p className="text-slate-300 text-sm">
              Apenas <b>TERCEIRIZADA</b> e <b>ADM</b> podem marcar corte.
            </p>
            <div className="mt-4">
              <button
                onClick={() => setPermOpen(false)}
                className="px-4 py-2 rounded-lg bg-white/10 border border-white/20 hover:bg-white/20 text-white text-sm"
              >
                Entendi
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmar Cortar */}
      {confirm.open && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-slate-800 p-6 rounded-xl shadow-2xl w-full max-w-sm">
            <h3 className="text-lg font-semibold text-white mb-2">Marcar como cortada</h3>
            <p className="text-slate-300 text-sm mb-4">
              Confirmar marcação da matrícula <b>{confirm.matricula}</b> como <b>CORTADA</b>?
            </p>
            <div className="mt-3 flex justify-end gap-3">
              <button
                onClick={() => setConfirm({ open: false })}
                className="px-4 py-2 rounded-lg bg-white/10 border border-white/20 hover:bg-white/20 text-white text-sm"
                disabled={!!confirm.saving}
              >
                Cancelar
              </button>
              <button
                onClick={doMarkCortada}
                className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-sm disabled:opacity-60"
                disabled={!!confirm.saving}
              >
                {confirm.saving ? "Marcando…" : "Cortar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL EDITAR OS */}
      {edit.open && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-slate-800 p-6 rounded-xl shadow-2xl w-full max-w-xl">
            <h3 className="text-lg font-semibold text-white mb-4">Editar OS</h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-300 mb-1">OS</label>
                <input
                  className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white"
                  value={edit.form.os}
                  onChange={(e) => setEdit((s) => ({ ...s, form: { ...s.form, os: e.target.value } }))}
                  placeholder="Número da OS"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-300 mb-1">Matrícula</label>
                <input
                  className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white"
                  value={edit.form.matricula}
                  onChange={(e) => setEdit((s) => ({ ...s, form: { ...s.form, matricula: e.target.value } }))}
                />
              </div>

              <div>
                <label className="block text-xs text-slate-300 mb-1">Bairro</label>
                <input
                  className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white"
                  value={edit.form.bairro}
                  onChange={(e) => setEdit((s) => ({ ...s, form: { ...s.form, bairro: e.target.value } }))}
                />
              </div>

              <div>
                <label className="block text-xs text-slate-300 mb-1">Rua</label>
                <input
                  className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white"
                  value={edit.form.rua}
                  onChange={(e) => setEdit((s) => ({ ...s, form: { ...s.form, rua: e.target.value } }))}
                />
              </div>

              <div>
                <label className="block text-xs text-slate-300 mb-1">Número</label>
                <input
                  className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white"
                  value={edit.form.numero}
                  onChange={(e) => setEdit((s) => ({ ...s, form: { ...s.form, numero: e.target.value } }))}
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs text-slate-300 mb-1">Ponto de referência</label>
                <input
                  className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white"
                  value={edit.form.ponto_referencia}
                  onChange={(e) => setEdit((s) => ({ ...s, form: { ...s.form, ponto_referencia: e.target.value } }))}
                />
              </div>

              <div>
                <label className="block text-xs text-slate-300 mb-1">Corte na rua?</label>
                <select
                  className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white"
                  value={edit.form.corte_na_rua}
                  onChange={(e) => setEdit((s) => ({ ...s, form: { ...s.form, corte_na_rua: e.target.value as any } }))}
                >
                  <option value="null">—</option>
                  <option value="true">SIM</option>
                  <option value="false">NÃO</option>
                </select>
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-3">
              <button
                onClick={() => setEdit((s) => ({ ...s, open: false }))}
                disabled={edit.saving}
                className="px-4 py-2 rounded-lg bg-white/10 border border-white/20 hover:bg-white/20 text-white text-sm"
              >
                Cancelar
              </button>
              <button
                onClick={saveEdit}
                disabled={edit.saving}
                className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm disabled:opacity-60"
              >
                {edit.saving ? "Salvando…" : "Salvar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
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
