import * as React from "react";
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
  // created_by?: string | null; // detectado dinamicamente se existir
};

const ALLOWED_EDIT_ROLE = new Set(["ADM"]);

export default function PendingReconnectionsTable() {
  const [rows, setRows] = React.useState<ReligRow[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [msg, setMsg] = React.useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const [filter, setFilter] = React.useState<ListFilter>({
    q: "",
    startDate: null,
    endDate: null,
  });

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

  // detectar criador dinamicamente
  function getRowCreatorId(r: ReligRow): string | null {
    const anyRow = r as any;
    return anyRow?.created_by ?? anyRow?.id_usuario ?? anyRow?.user_id ?? anyRow?.uid ?? null;
  }
  function canEditRow(r: ReligRow): boolean {
    if (ALLOWED_EDIT_ROLE.has((userRole || "").toUpperCase())) return true;
    const creator = getRowCreatorId(r);
    return !!userId && !!creator && userId === creator;
  }

  // ------- carregar -------
  async function load() {
    setLoading(true);

    let query = supabase
      .from("ordens_religacao")
      .select("id, matricula, bairro, rua, numero, ponto_referencia, prioridade, status, pdf_ordem_path, created_at")
      .eq("status", "aguardando_religacao");

    if (filter.startDate) {
      query = query.gte("created_at", `${filter.startDate}T00:00:00`);
    }
    if (filter.endDate) {
      query = query.lte("created_at", `${filter.endDate}T23:59:59`);
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

  // ------- layout: larguras FIXAS (igual Cuts) -------
  const colWidths = React.useMemo(
    () => [
      "w-32",       // matrícula (sticky)
      "w-40",       // bairro
      "w-[320px]",  // rua e nº
      "w-[300px]",  // ponto ref
      "w-36",       // prioridade
      "w-48",       // status / marcar
      "w-28",       // Ordem (PDF)
      "w-40",       // criado em
      "w-28",       // editar
    ],
    []
  );
  const colEls = React.useMemo(() => colWidths.map((cls, i) => <col key={i} className={cls} />), [colWidths]);

  return (
    <div className="rounded-2xl bg-slate-900/50 ring-1 ring-white/10 p-4">
      <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
        <div>
          <h3 className="font-semibold">Papeletas de religação pendentes</h3>
          <p className="text-slate-400 text-sm">Exibe as ordens com status “aguardando religação”.</p>
        </div>
        <button
          onClick={load}
          className="text-xs px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10"
        >
          {loading ? "Atualizando…" : "Atualizar"}
        </button>
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

                  {/* Ordem (PDF) — separado */}
                  <td className="py-2 px-3 text-center">
                    {r.pdf_ordem_path ? (
                      <a
                        href={supabase.storage.from("ordens-pdfs").getPublicUrl(r.pdf_ordem_path).data.publicUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3 py-1.5 text-xs rounded-lg bg-indigo-500/20 text-indigo-200 ring-1 ring-indigo-400/40 hover:bg-indigo-500/30 whitespace-nowrap"
                      >
                        Imprimir
                      </a>
                    ) : (
                      <span className="text-slate-400 text-xs">PDF indisponível</span>
                    )}
                  </td>

                  <td className="py-2 px-3 text-center whitespace-nowrap">
                    {new Date(r.created_at).toLocaleString("pt-BR")}
                  </td>

                  {/* Editar — mesmo layout do CutsTable */}
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
                <td colSpan={9} className="py-6 text-center text-slate-400">
                  Nenhuma papeleta pendente.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* MODAL EDITAR PAPELETA */}
      {edit.open && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-slate-800 p-6 rounded-xl shadow-2xl w-full max-w-xl">
            <h3 className="text-lg font-semibold text-white mb-4">Editar papeleta</h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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
                <label className="block text-xs text-slate-300 mb-1">Prioridade</label>
                <select
                  className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white"
                  value={edit.form.prioridade}
                  onChange={(e) => setEdit((s) => ({ ...s, form: { ...s.form, prioridade: e.target.value as any } }))}
                >
                  <option value="false">normal</option>
                  <option value="true">PRIORIDADE</option>
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
