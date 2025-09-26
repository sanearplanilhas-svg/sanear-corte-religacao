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

// ======= ROLES (permissões) =======
const ALLOWED_CREATE = new Set(["ADM", "DIRETOR", "COORDENADOR", "OPERADOR"]);
const ALLOWED_LIBERACAO = new Set(["ADM", "DIRETOR", "COORDENADOR"]);
// ==================================

// ✅ Telefone: mesmas regras do CHECK do banco
const PHONE_ALLOWED_RE = /^[0-9\-\+\(\) ]{8,20}$/;
const phoneClean = (s: string) => (s ?? "").replace(/[^\d\-\+\(\) ]/g, "").trim();

export default function ReconnectionOrderForm() {
  // abas
  const [subTab, setSubTab] = React.useState<SubTab>("PAPELETA");

  // utils
  const toUpper = (s: string) => (s ?? "").toUpperCase();
  const onlyDigits = (s: string) => (s ?? "").replace(/\D/g, "");

  // === NOVO: Solicitante
  const [solicitanteNome, setSolicitanteNome] = React.useState("");
  const [solicitanteDocumento, setSolicitanteDocumento] = React.useState("");

  // estado — papeleta
  const [matricula, setMatricula] = React.useState("");
  const [telefone, setTelefone] = React.useState("");
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
    if (saving) return;
    const id = setInterval(() => setNow(new Date().toLocaleString("pt-BR")), 1000);
    return () => clearInterval(id);
  }, [saving]);

  React.useEffect(() => {
    if (subTab === "LIBERACAO") {
      loadPendentes();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subTab]);

  // ======= papel do usuário e permissões =======
  const [userRole, setUserRole] = React.useState<string>("VISITANTE");
  const canCreate = React.useMemo(() => ALLOWED_CREATE.has((userRole || "VISITANTE").toUpperCase()), [userRole]);
  const canLiberacao = React.useMemo(() => ALLOWED_LIBERACAO.has((userRole || "VISITANTE").toUpperCase()), [userRole]);

  const [permModalOpen, setPermModalOpen] = React.useState(false);
  const [permText, setPermText] = React.useState("Seu perfil não tem permissão para executar esta ação.");
  const [clearOnPermClose, setClearOnPermClose] = React.useState(false);

  React.useEffect(() => {
    (async () => {
      try {
        const { data: udata, error: uerr } = await supabase.auth.getUser();
        if (uerr) throw uerr;
        const user = udata?.user;
        if (!user) {
          setUserRole("VISITANTE");
          return;
        }
        const { data, error } = await supabase
          .from("app_users")
          .select("papel")
          .eq("id", user.id)
          .single();
        if (error) throw error;
        setUserRole((data?.papel || "VISITANTE").toUpperCase());
      } catch {
        setUserRole("VISITANTE");
      }
    })();
  }, []);

  // bloqueia acesso direto à aba Liberação
  React.useEffect(() => {
    if (subTab === "LIBERACAO" && !canLiberacao) {
      setPermText("Acesso restrito: apenas ADM, DIRETOR e COORDENADOR podem acessar a Liberação de Papeleta.");
      setClearOnPermClose(false);
      setPermModalOpen(true);
      setSubTab("PAPELETA");
    }
  }, [subTab, canLiberacao]);
  // ==============================================

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
    setTelefone("");
    setBairro("");
    setRua("");
    setNumero("");
    setPontoRef("");
    setPrioridade(false);
    setPdfOrdem(null);
    setPdfComprovante(null);
    setObservacaoOpt("");
    setObservacaoOutros("");
    // limpar solicitante
    setSolicitanteNome("");
    setSolicitanteDocumento("");
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

  // telefone — helpers
  const formatTelefonePretty = (digits: string) => {
    let d = digits;
    if (d.startsWith("55")) d = d.slice(2);
    let ddd = d.slice(0, 2);
    let rest = d.slice(2);
    if (d.length === 8 || d.length === 9) {
      ddd = "27";
      rest = d;
    }
    if (rest.length === 9) return `+55 ${ddd} ${rest.slice(0, 5)}-${rest.slice(5)}`;
    if (rest.length === 8) return `+55 ${ddd} ${rest.slice(0, 4)}-${rest.slice(4)}`;
    return `+55 ${ddd} ${rest}`;
  };

  const handleTelefoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTelefone(e.target.value);
  };

  const handleTelefoneBlur = () => {
    const d = onlyDigits(telefone);
    if (!d) return;
    let out = d;
    if (d.length === 8 || d.length === 9) out = `27${d}`;
    else if (d.length > 11 && d.startsWith("55")) out = d.slice(2);
    setTelefone(formatTelefonePretty(out));
  };

  // buscar dados de matrícula (inclui telefone, se existir)
  async function fetchMatriculaData(m: string) {
    if (!m) return;

    let { data, error } = await supabase
      .from("ordens_religacao")
      .select("bairro, rua, numero, ponto_referencia, telefone")
      .eq("matricula", m)
      .order("created_at", { ascending: false })
      .limit(1);

    if (!error && data && data.length > 0) {
      const d: any = data[0];
      setBairro(d?.bairro ?? "");
      setRua(d?.rua ?? "");
      setNumero(d?.numero ?? "");
      setPontoRef(d?.ponto_referencia ?? "");
      if (d?.telefone) setTelefone(d.telefone);
      setPrioridade(false);
      return;
    }

    let { data: dataCorte, error: errorCorte } = await supabase
      .from("ordens_corte")
      .select("bairro, rua, numero, ponto_referencia, telefone")
      .eq("matricula", m)
      .order("created_at", { ascending: false })
      .limit(1);

    if (!errorCorte && dataCorte && dataCorte.length > 0) {
      const d: any = dataCorte[0];
      setBairro(d?.bairro ?? "");
      setRua(d?.rua ?? "");
      setNumero(d?.numero ?? "");
      setPontoRef(d?.ponto_referencia ?? "");
      if (d?.telefone) setTelefone(d.telefone);
      setPrioridade(false);
    }
  }

  function validatePapeleta(): string | null {
    // === obrigatórios do solicitante
    if (!solicitanteNome.trim()) return "Informe o nome do solicitante.";
    if (!solicitanteDocumento.trim()) return "Informe o documento do solicitante.";

    if (!matricula.trim()) return "Informe a matrícula.";
    if (!telefone.trim()) return "Informe o telefone de contato.";
    // ✅ valida exatamente como o CHECK do banco (após sanitizar)
    const telDb = phoneClean(telefone);
    if (!PHONE_ALLOWED_RE.test(telDb)) {
      return "Telefone inválido. Use apenas números, espaço, +, (, ) e -, com 8 a 20 caracteres.";
    }
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

      // ✅ telefone sanitizado para obedecer o CHECK
      const telefoneDb = phoneClean(telefone);

      // INSERT único com os paths + NOVOS CAMPOS (solicitante)
      const { error: insErr } = await supabase.from("ordens_religacao").insert({
        id,
        // --- solicitante
        solicitante_nome: toUpper(solicitanteNome.trim()),
        solicitante_documento: toUpper(solicitanteDocumento.trim()),
        // --- demais campos
        matricula: matricula.trim(),
        telefone: telefoneDb,
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

    if (!canCreate) {
      setPermText("Apenas ADM, DIRETOR, COORDENADOR e OPERADOR podem criar papeletas de religação.");
      setClearOnPermClose(true);
      setPermModalOpen(true);
      return;
    }

    const m = formatMatricula();
    const err = validatePapeleta();
    if (err) {
      setMsg({ kind: "err", text: err });
      setTimeout(() => setMsg(null), 2000);
      return;
    }

    // bloqueio 24h (se a última não estiver ativa)
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
      {/* Cabeçalho */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Religação</h2>
          <p className="text-slate-400 text-sm">Gerencie a emissão e liberação de papeletas.</p>
        </div>
        <div className="text-xs text-emerald-300 font-semibold">{now}</div>
      </div>

      {/* Abas */}
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
          onClick={() => {
            if (!canLiberacao) {
              setPermText("Acesso restrito: apenas ADM, DIRETOR e COORDENADOR podem acessar a Liberação de Papeleta.");
              setClearOnPermClose(false);
              setPermModalOpen(true);
              return;
            }
            setSubTab("LIBERACAO");
          }}
          className={`px-3 py-2 rounded-lg text-sm transition border
            ${subTab === "LIBERACAO"
              ? "bg-indigo-500/20 text-indigo-200 border-indigo-400/40"
              : "bg-white/5 text-slate-300 border-white/10 hover:bg-white/10"}`}
        >
          Liberação de Papeleta
        </button>
      </div>

      {subTab === "PAPELETA" ? (
        <form onSubmit={onSave} className="mt-6">
          <div className="space-y-8 divide-y divide-white/10">
            {/* Seção 1: Identificação */}
            <section className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-300">Identificação</h3>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Coluna esquerda: matrícula + telefone */}
                <div className="grid grid-cols-1 gap-4">
                  {/* Matrícula */}
                  <div>
                    <label className="block text-sm text-slate-300 mb-1">Matrícula *</label>
                    <input
                      className="w-full rounded-xl bg-slate-950/60 border border-white/10 px-3 py-2 outline-none focus:ring-2 ring-emerald-400/40 uppercase"
                      placeholder="EX.: 00000"
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

                  {/* Telefone */}
                  <div>
                    <label className="block text-sm text-slate-300 mb-1">Telefone de contato *</label>
                    <input
                      className="w-full rounded-xl bg-slate-950/60 border border-white/10 px-3 py-2 outline-none focus:ring-2 ring-emerald-400/40"
                      placeholder="+55 27 00000-0000"
                      value={telefone}
                      onChange={handleTelefoneChange}
                      onBlur={handleTelefoneBlur}
                      inputMode="tel"
                      autoComplete="tel"
                    />
                    <p className="text-xs text-slate-400 mt-1">
                      Dica: pode digitar só o número (ex.: <b>999999999</b>) que eu completo com <b>+55 27</b>.
                    </p>
                  </div>
                </div>

                {/* Coluna direita: Prioridade (card) */}
                <div className="rounded-xl bg-slate-950/60 border border-white/10 p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-slate-300">Prioridade</span>
                    <span
                      className={`text-[11px] px-2 py-1 rounded ${
                        prioridade ? "bg-fuchsia-600/30 text-fuchsia-200" : "bg-slate-700/40 text-slate-300"
                      }`}
                      title={prioridade ? "Prioridade liberada pelo diretor" : "Normal"}
                    >
                      {prioridade ? "Liberada" : "Normal"}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={handleClickPrioridade}
                    className="mt-2 w-full px-3 py-2 rounded-lg bg-fuchsia-600/20 text-fuchsia-200 hover:bg-fuchsia-600/30 transition"
                  >
                    {prioridade ? "Prioridade do Diretor Ativada" : "Solicitar Prioridade do Diretor"}
                  </button>

                  <p className="mt-2 text-[12px] leading-snug text-slate-400">
                    Use somente em casos excepcionais, com autorização do Diretor.
                  </p>
                </div>
              </div>
            </section>

            {/* === NOVA Seção 1.1: Solicitante === */}
            <section className="pt-8 space-y-4">
              <h3 className="text-sm font-semibold text-slate-300">Solicitante</h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-slate-300 mb-1">Nome do solicitante *</label>
                  <input
                    className="w-full rounded-xl bg-slate-950/60 border border-white/10 px-3 py-2 outline-none focus:ring-2 ring-emerald-400/40 uppercase"
                    placeholder="EX.: JOÃO DA SILVA"
                    value={solicitanteNome}
                    onChange={(e) => setSolicitanteNome(toUpper(e.target.value))}
                    onPaste={(e: React.ClipboardEvent<HTMLInputElement>) => {
                      e.preventDefault();
                      setSolicitanteNome(toUpper(e.clipboardData?.getData("text") || ""));
                    }}
                    autoCapitalize="characters"
                    autoCorrect="off"
                  />
                </div>
                <div>
                  <label className="block text-sm text-slate-300 mb-1">Documento do solicitante *</label>
                  <input
                    className="w-full rounded-xl bg-slate-950/60 border border-white/10 px-3 py-2 outline-none focus:ring-2 ring-emerald-400/40 uppercase"
                    placeholder="EX.: CPF/CNPJ/IDENTIDADE"
                    value={solicitanteDocumento}
                    onChange={(e) => setSolicitanteDocumento(toUpper(e.target.value))}
                    onPaste={(e: React.ClipboardEvent<HTMLInputElement>) => {
                      e.preventDefault();
                      setSolicitanteDocumento(toUpper(e.clipboardData?.getData("text") || ""));
                    }}
                    autoCapitalize="characters"
                    autoCorrect="off"
                  />
                </div>
              </div>
            </section>

            {/* Seção 2: Endereço */}
            <section className="pt-8 space-y-4">
              <h3 className="text-sm font-semibold text-slate-300">Endereço</h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-slate-300 mb-1">Bairro *</label>
                  <input
                    className="w-full rounded-xl bg-slate-950/60 border border-white/10 px-3 py-2 outline-none focus:ring-2 ring-emerald-400/40 uppercase"
                    placeholder="EX.: CENTRO"
                    value={bairro}
                    onChange={(e) => setBairro(toUpper(e.target.value))}
                  />
                </div>
                <div>
                  <label className="block text-sm text-slate-300 mb-1">Rua *</label>
                  <input
                    className="w-full rounded-xl bg-slate-950/60 border border-white/10 px-3 py-2 outline-none focus:ring-2 ring-emerald-400/40 uppercase"
                    placeholder="EX.: AV. BRASIL"
                    value={rua}
                    onChange={(e) => setRua(toUpper(e.target.value))}
                  />
                </div>
                <div>
                  <label className="block text-sm text-slate-300 mb-1">Número *</label>
                  <input
                    className="w-full rounded-xl bg-slate-950/60 border border-white/10 px-3 py-2 outline-none focus:ring-2 ring-emerald-400/40 uppercase"
                    placeholder="EX.: 123"
                    value={numero}
                    onChange={(e) => setNumero(toUpper(e.target.value))}
                  />
                </div>
                <div>
                  <label className="block text-sm text-slate-300 mb-1">Ponto de referência *</label>
                  <input
                    className="w-full rounded-xl bg-slate-950/60 border border-white/10 px-3 py-2 outline-none focus:ring-2 ring-emerald-400/40 uppercase"
                    placeholder="EX.: PRÓX. AO POSTO X"
                    value={pontoRef}
                    onChange={(e) => setPontoRef(toUpper(e.target.value))}
                  />
                </div>
              </div>
            </section>

            {/* Seção 3: Observações */}
            <section className="pt-8 space-y-4">
              <h3 className="text-sm font-semibold text-slate-300">Observações</h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-slate-300 mb-1">Seleção</label>
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
                </div>

                {observacaoOpt === "OUTROS" && (
                  <div>
                    <label className="block text-sm text-slate-300 mb-1">Descreva (maiúsculo)</label>
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
            </section>

            {/* Seção 4: Anexos */}
            <section className="pt-8 space-y-4">
              <h3 className="text-sm font-semibold text-slate-300">Anexos</h3>

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
            </section>

            {/* Ações */}
            <section className="pt-8">
              <div className="flex items-center gap-3">
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
            </section>
          </div>
        </form>
      ) : (
        // ===== LIBERAÇÃO — LISTA =====
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

          {/* >>> Responsividade da tabela: wrapper com overflow horizontal + truncates nos campos longos */}
          <div className="rounded-xl ring-1 ring-white/10">
            <div className="overflow-x-auto">
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
                      <tr key={p.id} className="bg-slate-950/40 align-middle">
                        <td className="px-3 py-2 font-mono whitespace-nowrap">{p.matricula}</td>
                        <td className="px-3 py-2">
                          <div
                            className="truncate max-w-[160px] md:max-w-none md:whitespace-normal md:break-words"
                            title={toUpper(p.bairro ?? "")}
                          >
                            {toUpper(p.bairro ?? "")}
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <div
                            className="truncate max-w-[240px] md:max-w-none md:whitespace-normal md:break-words"
                            title={toUpper(p.rua ?? "")}
                          >
                            {toUpper(p.rua ?? "")}
                          </div>
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">{fmt(p.created_at)}</td>
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
          {/* <<< /Responsividade da tabela */}
        </div>
      )}

      {/* Modais */}
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

      {/* Modal de permissão negada */}
      {permModalOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-slate-800 p-6 rounded-2xl w-full max-w-lg text-center">
            <h3 className="text-lg font-semibold text-white">Permissão necessária</h3>
            <p className="text-slate-300 text-sm mt-2">{permText}</p>
            <div className="mt-5">
              <button
                onClick={() => { clear(); setPermModalOpen(false); }}
                className="px-4 py-2 rounded-lg bg-white/10 border border-white/20 hover:bg-white/20 text-white text-sm"
              >
                Entendi
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
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
