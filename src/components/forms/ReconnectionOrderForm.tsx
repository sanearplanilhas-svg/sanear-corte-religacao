import * as React from "react";
import supabase from "../../lib/supabase";

type Msg = { kind: "ok" | "err"; text: string } | null;

type ObsOpt = "SEM HIDROMETRO NO LOCAL" | "HIDROMETRO VAZANDO" | "OUTROS" | "";
type SubTab = "PAPELETA" | "LIBERACAO";

type Pendente = {
  id: string;
  matricula: string;
  bairro: string | null;
  rua: string | null;
  created_at: string;
};

export default function ReconnectionOrderForm() {
  // abas
  const [subTab, setSubTab] = React.useState<SubTab>("PAPELETA");

  // util
  const toUpper = (s: string) => (s ?? "").toUpperCase();

  // estado — papeleta
  const [matricula, setMatricula] = React.useState("");
  const [bairro, setBairro] = React.useState("");
  const [rua, setRua] = React.useState("");
  const [numero, setNumero] = React.useState("");
  const [pontoRef, setPontoRef] = React.useState("");
  const [prioridade, setPrioridade] = React.useState(false);

  const [pdfOrdem, setPdfOrdem] = React.useState<File | null>(null);
  const [pdfComprovante, setPdfComprovante] = React.useState<File | null>(null);

  const [saving, setSaving] = React.useState(false);
  const [msg, setMsg] = React.useState<Msg>(null);
  const [now, setNow] = React.useState<string>(new Date().toLocaleString("pt-BR"));

  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [pendingSave, setPendingSave] = React.useState<(() => void) | null>(null);

  // bloqueio 24h
  const [blockOpen, setBlockOpen] = React.useState(false);
  const [tempoRestante, setTempoRestante] = React.useState<string>("");

  // senha prioridade
  const [prioridadeModalOpen, setPrioridadeModalOpen] = React.useState(false);
  const [senhaDiretor, setSenhaDiretor] = React.useState("");
  const [senhaErro, setSenhaErro] = React.useState<string | null>(null);

  const SENHA_DIRETOR = "29101993";

  // observações
  const [observacaoOpt, setObservacaoOpt] = React.useState<ObsOpt>("");
  const [observacaoOutros, setObservacaoOutros] = React.useState("");
  const buildObservacao = () => {
    if (observacaoOpt === "OUTROS") {
      const txt = toUpper(observacaoOutros).trim();
      return txt ? `OUTROS - ${txt}` : "OUTROS";
    }
    return (observacaoOpt as string) || null;
  };

  // lista liberação
  const [carregandoLista, setCarregandoLista] = React.useState(false);
  const [pendentes, setPendentes] = React.useState<Pendente[]>([]);

  React.useEffect(() => {
    if (saving) return; // pausa o relógio enquanto salva
    const id = setInterval(() => setNow(new Date().toLocaleString("pt-BR")), 1000);
    return () => clearInterval(id);
  }, [saving]);

  React.useEffect(() => {
    if (subTab === "LIBERACAO") {
      loadPendentes();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subTab]);

  async function loadPendentes() {
    try {
      setCarregandoLista(true);
      const { data, error } = await supabase
        .from("ordens_religacao")
        .select("id, matricula, bairro, rua, created_at")
        .eq("status", "liberacao_pendente")
        .order("created_at", { ascending: true });

      if (error) throw error;

      const rows: Pendente[] = (data ?? []).map((r: any) => ({
        id: r.id,
        matricula: r.matricula,
        bairro: r.bairro ?? "",
        rua: r.rua ?? "",
        created_at: r.created_at,
      }));
      setPendentes(rows);
    } catch (e: any) {
      setMsg({ kind: "err", text: e?.message ?? "Falha ao carregar pendentes." });
      setTimeout(() => setMsg(null), 2500);
    } finally {
      setCarregandoLista(false);
    }
  }

  function clear() {
    setMatricula("");
    setBairro("");
    setRua("");
    setNumero("");
    setPontoRef("");
    setPrioridade(false);
    setPdfOrdem(null);
    setPdfComprovante(null);
    setObservacaoOpt("");
    setObservacaoOutros("");
  }

  // matrícula
  const handleMatricula = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value.replace(/\D/g, "");
    if (value.length > 5) value = value.slice(0, 5);
    setMatricula(value);
    setPrioridade(false);
  };

  const formatMatricula = () => {
    if (matricula.length < 5) {
      const m = matricula.padStart(5, "0");
      setMatricula(m);
      return m;
    }
    return matricula;
  };

  // buscar dados de matrícula
  async function fetchMatriculaData(m: string) {
    if (!m) return;

    let { data, error } = await supabase
      .from("ordens_religacao")
      .select("bairro, rua, numero, ponto_referencia")
      .eq("matricula", m)
      .order("created_at", { ascending: false })
      .limit(1);

    if (!error && data && data.length > 0) {
      const d: any = data[0];
      setBairro(d?.bairro ?? "");
      setRua(d?.rua ?? "");
      setNumero(d?.numero ?? "");
      setPontoRef(d?.ponto_referencia ?? "");
      setPrioridade(false);
      return;
    }

    let { data: dataCorte, error: errorCorte } = await supabase
      .from("ordens_corte")
      .select("bairro, rua, numero, ponto_referencia")
      .eq("matricula", m)
      .order("created_at", { ascending: false })
      .limit(1);

    if (!errorCorte && dataCorte && dataCorte.length > 0) {
      const d: any = dataCorte[0];
      setBairro(d?.bairro ?? "");
      setRua(d?.rua ?? "");
      setNumero(d?.numero ?? "");
      setPontoRef(d?.ponto_referencia ?? "");
      setPrioridade(false);
    }
  }

  function validatePapeleta(): string | null {
    if (!matricula.trim()) return "Informe a matrícula.";
    if (!bairro.trim()) return "Informe o bairro.";
    if (!rua.trim()) return "Informe a rua.";
    if (!numero.trim()) return "Informe o número.";
    if (!pontoRef.trim()) return "Informe o ponto de referência.";
    if (!pdfOrdem) return "É obrigatório anexar o PDF da papeleta de religação.";
    if (observacaoOpt === "OUTROS" && !toUpper(observacaoOutros).trim()) {
      return "Informe a observação quando selecionar OUTROS.";
    }
    return null;
  }

  // salvar papeleta (upload em paralelo + INSERT único)
  async function doSave() {
    try {
      const { data: userData, error: userErr } = await supabase.auth.getUser();
      if (userErr) throw userErr;
      const user = userData?.user;
      if (!user) throw new Error("Usuário não autenticado.");

      const id = crypto.randomUUID();
      const base = `religacoes/${user.id}/${id}`;

      // uploads em paralelo
      const [ordemPath, compPath] = await Promise.all([
        pdfOrdem
          ? supabase.storage
              .from("ordens-pdfs")
              .upload(`${base}/ordem.pdf`, pdfOrdem, {
                upsert: true,
                contentType: pdfOrdem.type ?? "application/pdf",
              })
              .then((r) => r.data?.path ?? null)
          : Promise.resolve(null),
        pdfComprovante
          ? supabase.storage
              .from("ordens-pdfs")
              .upload(`${base}/comprovante.pdf`, pdfComprovante, {
                upsert: true,
                contentType: pdfComprovante.type ?? "application/pdf",
              })
              .then((r) => r.data?.path ?? null)
          : Promise.resolve(null),
      ]);

      if (!ordemPath) throw new Error("Falha ao salvar o PDF obrigatório.");

      // INSERT único com os paths
      const { error: insErr } = await supabase.from("ordens_religacao").insert({
        id,
        matricula: matricula.trim(),
        bairro: bairro.trim(),
        rua: rua.trim(),
        numero: numero.trim(),
        ponto_referencia: pontoRef.trim(),
        prioridade,
        status: "liberacao_pendente",
        precisa_troca_hidrometro: null,
        observacao: buildObservacao(),
        pdf_ordem_path: ordemPath,
        pdf_comprovante_path: compPath ?? null,
      });
      if (insErr) throw insErr;

      setMsg({ kind: "ok", text: "Papeleta salva como PENDENTE DE LIBERAÇÃO." });
      clear();
    } catch (e: any) {
      setMsg({ kind: "err", text: e?.message ?? "Falha ao salvar." });
    } finally {
      setSaving(false);
      setTimeout(() => setMsg(null), 1800);
    }
  }

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    const m = formatMatricula();
    const err = validatePapeleta();
    if (err) {
      setMsg({ kind: "err", text: err });
      setTimeout(() => setMsg(null), 2000);
      return;
    }

    // ====== bloqueio 24h (somente se a última NÃO estiver ativa) ======
    const { data: ultima, error: errLast } = await supabase
      .from("ordens_religacao")
      .select("created_at, status")
      .eq("matricula", m)
      .order("created_at", { ascending: false })
      .limit(1);

    if (!errLast && ultima && ultima.length > 0) {
      const last = ultima[0] as any;
      const lastCreatedAt = last?.created_at as string | undefined;
      const lastStatus = (last?.status as string | undefined) ?? "";

      if (lastCreatedAt && lastStatus !== "ativa") {
        const lastDate = new Date(lastCreatedAt);
        const agora = new Date();
        const diffMs = agora.getTime() - lastDate.getTime();
        const diffHoras = diffMs / (1000 * 60 * 60);

        if (diffHoras < 24) {
          const restanteMs = 24 * 60 * 60 * 1000 - diffMs;
          const restanteMin = Math.ceil(restanteMs / (1000 * 60));
          const h = Math.floor(restanteMin / 60);
          const min = restanteMin % 60;
          setTempoRestante(`${h}h ${min}min`);
          setBlockOpen(true);
          return;
        }
      }
    }
    // ====== /bloqueio 24h ======

    if (!pdfComprovante) {
      setPendingSave(() => doSave);
      setConfirmOpen(true);
      return;
    }

    setSaving(true);
    doSave();
  }

  // prioridade
  function handleClickPrioridade() {
    if (prioridade) {
      setPrioridade(false);
      return;
    }
    setSenhaDiretor("");
    setSenhaErro(null);
    setPrioridadeModalOpen(true);
  }
  function confirmarSenhaDiretor() {
    if (senhaDiretor === SENHA_DIRETOR) {
      setPrioridade(true);
      setPrioridadeModalOpen(false);
      setSenhaErro(null);
      setMsg({ kind: "ok", text: "Prioridade de Diretor liberada." });
      setTimeout(() => setMsg(null), 1500);
    } else {
      setSenhaErro("Senha inválida. Tente novamente.");
    }
  }
  function fecharModalPrioridade() {
    setPrioridadeModalOpen(false);
    setSenhaDiretor("");
    setSenhaErro(null);
  }

  // liberação por linha
  async function liberar(id: string, precisaTroca: boolean) {
    try {
      const { error: upErr } = await supabase
        .from("ordens_religacao")
        .update({
          precisa_troca_hidrometro: precisaTroca,
          status: "aguardando_religacao",
        })
        .eq("id", id);

      if (upErr) throw upErr;

      setPendentes((prev) => prev.filter((p) => p.id !== id));
      setMsg({
        kind: "ok",
        text: `Liberação confirmada (${precisaTroca ? "SIM" : "NÃO"}).`,
      });
      setTimeout(() => setMsg(null), 1500);
    } catch (e: any) {
      setMsg({ kind: "err", text: e?.message ?? "Falha ao liberar." });
      setTimeout(() => setMsg(null), 2000);
    }
  }

  const fmt = (iso?: string | null) => (iso ? new Date(iso).toLocaleString("pt-BR") : "—");

  return (
    <div className="rounded-2xl bg-slate-900/50 ring-1 ring-white/10 p-6 relative">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Religação</h2>
          <p className="text-slate-400 text-sm">Gerencie a emissão e liberação de papeletas.</p>
        </div>
        <div className="text-xs text-emerald-300 font-semibold">{now}</div>
      </div>

      {/* abas */}
      <div className="mt-5 flex gap-2">
        <button
          onClick={() => setSubTab("PAPELETA")}
          className={`px-3 py-2 rounded-lg text-sm transition border
            ${subTab === "PAPELETA"
              ? "bg-emerald-500/20 text-emerald-200 border-emerald-400/40"
              : "bg-white/5 text-slate-300 border-white/10 hover:bg-white/10"}`}
        >
          Nova Papeleta
        </button>
        <button
          onClick={() => setSubTab("LIBERACAO")}
          className={`px-3 py-2 rounded-lg text-sm transition border
            ${subTab === "LIBERACAO"
              ? "bg-indigo-500/20 text-indigo-200 border-indigo-400/40"
              : "bg-white/5 text-slate-300 border-white/10 hover:bg-white/10"}`}
        >
          Liberação de Papeleta
        </button>
      </div>

      {subTab === "PAPELETA" ? (
        <form onSubmit={onSave} className="mt-6 space-y-6">
          {/* matrícula e prioridade */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-slate-300 mb-1">Matrícula *</label>
              <input
                className="w-full rounded-xl bg-slate-950/60 border border-white/10 px-3 py-2 outline-none focus:ring-2 ring-emerald-400/40 uppercase"
                placeholder="Ex.: 00000"
                value={matricula}
                onChange={handleMatricula}
                onBlur={() => {
                  const m = formatMatricula();
                  if (m) fetchMatriculaData(m);
                }}
                inputMode="numeric"
                maxLength={5}
              />
            </div>

            <div className="flex items-center gap-3">
              <div className="flex-1">
                <label className="block text-sm text-slate-300 mb-1">Prioridade</label>
                <div
                  onClick={handleClickPrioridade}
                  className={`w-full cursor-pointer rounded-xl px-3 py-2 border transition select-none
                    ${
                      prioridade
                        ? "bg-fuchsia-500/15 border-fuchsia-400/30 text-fuchsia-200"
                        : "bg-slate-950/60 border-white/10 text-slate-300"
                    }`}
                  title={prioridade ? "Prioridade liberada pelo diretor" : "Clique para solicitar Prioridade do Diretor"}
                >
                  {prioridade ? "PRIORIDADE (liberada pelo diretor)" : "Normal"}
                </div>
              </div>
            </div>
          </div>

          {/* endereço */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-slate-300 mb-1">Bairro *</label>
              <input
                className="w-full rounded-xl bg-slate-950/60 border border-white/10 px-3 py-2 outline-none focus:ring-2 ring-emerald-400/40 uppercase"
                placeholder="Ex.: CENTRO"
                value={bairro}
                onChange={(e) => setBairro(toUpper(e.target.value))}
              />
            </div>
            <div>
              <label className="block text-sm text-slate-300 mb-1">Rua *</label>
              <input
                className="w-full rounded-xl bg-slate-950/60 border border-white/10 px-3 py-2 outline-none focus:ring-2 ring-emerald-400/40 uppercase"
                placeholder="Ex.: AV. BRASIL"
                value={rua}
                onChange={(e) => setRua(toUpper(e.target.value))}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-slate-300 mb-1">Número *</label>
              <input
                className="w-full rounded-xl bg-slate-950/60 border border-white/10 px-3 py-2 outline-none focus:ring-2 ring-emerald-400/40 uppercase"
                placeholder="Ex.: 123"
                value={numero}
                onChange={(e) => setNumero(toUpper(e.target.value))}
              />
            </div>
            <div>
              <label className="block text-sm text-slate-300 mb-1">Ponto de referência *</label>
              <input
                className="w-full rounded-xl bg-slate-950/60 border border-white/10 px-3 py-2 outline-none focus:ring-2 ring-emerald-400/40 uppercase"
                placeholder="Ex.: PRÓX. AO POSTO X"
                value={pontoRef}
                onChange={(e) => setPontoRef(toUpper(e.target.value))}
              />
            </div>
          </div>

          {/* observações */}
          <div className="space-y-2">
            <label className="block text-sm text-slate-300 mb-1">OBSERVAÇÕES</label>
            <select
              className="w-full rounded-xl bg-slate-950/60 border border-white/10 px-3 py-2 outline-none focus:ring-2 ring-emerald-400/40 uppercase"
              value={observacaoOpt}
              onChange={(e) => setObservacaoOpt((e.target.value || "").toUpperCase() as ObsOpt)}
            >
              <option value="">SELECIONE...</option>
              <option value="SEM HIDROMETRO NO LOCAL">SEM HIDROMETRO NO LOCAL</option>
              <option value="HIDROMETRO VAZANDO">HIDROMETRO VAZANDO</option>
              <option value="OUTROS">OUTROS</option>
            </select>

            {observacaoOpt === "OUTROS" && (
              <div className="mt-2">
                <label className="block text-sm text-slate-400">DESCREVA (MAIÚSCULO)</label>
                <input
                  type="text"
                  className="w-full rounded-xl bg-slate-950/60 border border-white/10 px-3 py-2 outline-none focus:ring-2 ring-emerald-400/40 uppercase"
                  placeholder="DIGITE AQUI..."
                  value={observacaoOutros}
                  onChange={(e) => setObservacaoOutros(toUpper(e.target.value))}
                  onPaste={(e: React.ClipboardEvent<HTMLInputElement>) => {
                    e.preventDefault();
                    const text = e.clipboardData?.getData("text") ?? "";
                    setObservacaoOutros(toUpper(text));
                  }}
                  autoCapitalize="characters"
                  autoCorrect="off"
                />
              </div>
            )}
          </div>

          {/* uploads */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-slate-300 mb-2">Anexar PDF da papeleta de Religação *</label>
              <label className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-indigo-500/20 text-indigo-200 ring-1 ring-indigo-400/40 hover:bg-indigo-500/30 cursor-pointer">
                <input
                  type="file"
                  accept="application/pdf"
                  className="hidden"
                  onChange={(e) =>
                    setPdfOrdem(e.currentTarget.files && e.currentTarget.files[0] ? e.currentTarget.files[0] : null)
                  }
                />
                Selecionar PDF
              </label>
              <span className="ml-3 text-xs text-slate-400">
                {pdfOrdem ? pdfOrdem.name : "Nenhum arquivo selecionado"}
              </span>
            </div>
            <div>
              <label className="block text-sm text-slate-300 mb-2">Anexar comprovante (opcional)</label>
              <label className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-purple-500/20 text-purple-200 ring-1 ring-purple-400/40 hover:bg-purple-500/30 cursor-pointer">
                <input
                  type="file"
                  accept="application/pdf"
                  className="hidden"
                  onChange={(e) =>
                    setPdfComprovante(
                      e.currentTarget.files && e.currentTarget.files[0] ? e.currentTarget.files[0] : null
                    )
                  }
                />
                Selecionar PDF
              </label>
              <span className="ml-3 text-xs text-slate-400">
                {pdfComprovante ? pdfComprovante.name : "Nenhum arquivo selecionado"}
              </span>
            </div>
          </div>

          {/* ações */}
          <div className="flex items-center gap-3 pt-2">
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 rounded-lg bg-emerald-500/20 text-emerald-200 ring-1 ring-emerald-400/40 hover:bg-emerald-500/30 disabled:opacity-50"
            >
              {saving ? "Salvando…" : "Salvar"}
            </button>
            <button
              type="button"
              onClick={clear}
              className="px-4 py-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10"
            >
              Limpar
            </button>
          </div>
        </form>
      ) : (
        // LIBERAÇÃO — SOMENTE LISTA
        <div className="mt-6 space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-white">Papeletas aguardando liberação</h3>
            <button
              type="button"
              onClick={loadPendentes}
              className="px-3 py-1.5 rounded-lg text-xs bg-white/5 border border-white/10 hover:bg-white/10"
            >
              Atualizar
            </button>
          </div>

          <div className="rounded-xl overflow-hidden ring-1 ring-white/10">
            <table className="min-w-full text-sm">
              <thead className="bg-white/5 text-slate-300">
                <tr>
                  <th className="px-3 py-2 text-left">MATRÍCULA</th>
                  <th className="px-3 py-2 text-left">BAIRRO</th>
                  <th className="px-3 py-2 text-left">RUA</th>
                  <th className="px-3 py-2 text-left">CRIADA EM</th>
                  <th className="px-3 py-2 text-left">TROCAR HIDRÔMETRO?</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {carregandoLista ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-4 text-slate-400">Carregando…</td>
                  </tr>
                ) : pendentes.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-4 text-slate-400">Nenhuma papeleta pendente.</td>
                  </tr>
                ) : (
                  pendentes.map((p) => (
                    <tr key={p.id} className="bg-slate-950/40">
                      <td className="px-3 py-2 font-mono">{p.matricula}</td>
                      <td className="px-3 py-2">{toUpper(p.bairro ?? "")}</td>
                      <td className="px-3 py-2">{toUpper(p.rua ?? "")}</td>
                      <td className="px-3 py-2">{fmt(p.created_at)}</td>
                      <td className="px-3 py-2">
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => liberar(p.id, true)}
                            className="px-3 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white text-xs"
                            title="Precisa trocar hidrômetro: SIM"
                          >
                            SIM
                          </button>
                          <button
                            type="button"
                            onClick={() => liberar(p.id, false)}
                            className="px-3 py-1.5 rounded-md bg-rose-600 hover:bg-rose-500 text-white text-xs"
                            title="Precisa trocar hidrômetro: NÃO"
                          >
                            NÃO
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* modais e toast */}
      {blockOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-rose-700 p-6 rounded-xl text-center max-w-sm w-full text-white">
            <h3 className="text-lg font-bold mb-3">Cadastro bloqueado</h3>
            <p className="mb-2">Já existe uma papeleta cadastrada para esta matrícula (não ativa).</p>
            <p className="mb-4">⏳ Faltam {tempoRestante} para liberar novo cadastro.</p>
            <button onClick={() => setBlockOpen(false)} className="px-4 py-2 bg-white/20 rounded-lg hover:bg-white/30">
              Ok, entendi
            </button>
          </div>
        </div>
      )}

      {confirmOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-slate-800 p-6 rounded-xl shadow-lg max-w-sm w-full text-center">
            <h3 className="text-lg font-semibold text-white mb-3">Salvar sem comprovante?</h3>
            <p className="text-slate-300 text-sm mb-4">Você não anexou o comprovante. Deseja salvar mesmo assim?</p>
            <div className="flex justify-center gap-4">
              <button
                onClick={() => {
                  setConfirmOpen(false);
                  setSaving(true);
                  if (pendingSave) pendingSave();
                }}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-white"
              >
                Sim, salvar
              </button>
              <button
                onClick={() => setConfirmOpen(false)}
                className="px-4 py-2 bg-slate-600 hover:bg-slate-500 rounded-lg text-white"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {prioridadeModalOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-slate-800 p-6 rounded-2xl shadow-2xl w-full max-w-sm">
            <h3 className="text-lg font-semibold text-white mb-2">Prioridade do Diretor</h3>
            <p className="text-slate-300 text-sm mb-4">
              Para liberar a <span className="font-semibold">Prioridade Diretor</span>, informe a senha.
            </p>

            <label className="block text-sm text-slate-300 mb-1">Senha</label>
            <input
              type="password"
              value={senhaDiretor}
              onChange={(e) => {
                setSenhaDiretor(e.target.value);
                setSenhaErro(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") confirmarSenhaDiretor();
              }}
              className="w-full rounded-xl bg-slate-900/60 border border-white/10 px-3 py-2 outline-none focus:ring-2 ring-fuchsia-400/40 text-white"
              placeholder="Digite a senha"
              autoFocus
            />

            {senhaErro && <div className="mt-2 text-sm text-rose-400">{senhaErro}</div>}

            <div className="mt-5 flex justify-end gap-3">
              <button onClick={fecharModalPrioridade} className="px-4 py-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 text-slate-200">
                Cancelar
              </button>
              <button onClick={confirmarSenhaDiretor} className="px-4 py-2 rounded-lg bg-fuchsia-600 hover:bg-fuchsia-500 text-white">
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      {msg && (
        <div
          className={`fixed bottom-5 right-5 px-4 py-2 rounded-lg shadow-lg text-sm z-50
            ${msg.kind === "ok" ? "bg-emerald-600 text-white" : "bg-rose-600 text-white"}`}
        >
          {msg.text}
        </div>
      )}
    </div>
  );
}
