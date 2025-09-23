import * as React from "react";
import supabase from "../../lib/supabase";

type Msg = { kind: "ok" | "err"; text: string } | null;

const ALLOWED_ROLES = new Set(["ADM", "DIRETOR", "COORDENADOR", "OPERADOR"]);

export default function CutOrderForm() {
  const [matricula, setMatricula] = React.useState("");
  const [os, setOs] = React.useState("");
  const [bairro, setBairro] = React.useState("");
  const [rua, setRua] = React.useState("");
  const [numero, setNumero] = React.useState("");
  const [pontoRef, setPontoRef] = React.useState("");

  const [motivo, setMotivo] = React.useState<"faturas" | "agendamento" | "outros" | "">("");
  const [motivoOutros, setMotivoOutros] = React.useState("");

  const [pdfOrdem, setPdfOrdem] = React.useState<File | null>(null);

  const [saving, setSaving] = React.useState(false);
  const [msg, setMsg] = React.useState<Msg>(null);
  const [now, setNow] = React.useState<string>(new Date().toLocaleString("pt-BR"));

  // modal do tipo do corte
  const [tipoModalOpen, setTipoModalOpen] = React.useState(false);

  // ======= PAPEL do usuário (robusto) + modal de permissão =======
  const [userRole, setUserRole] = React.useState<string>("VISITANTE");
  const isAllowed = React.useMemo(
    () => ALLOWED_ROLES.has((userRole || "VISITANTE").toUpperCase()),
    [userRole]
  );

  const [permModalOpen, setPermModalOpen] = React.useState(false);
  const [permText, setPermText] = React.useState(
    "Seu perfil não tem permissão para criar ordens de corte. Apenas ADM, DIRETOR, COORDENADOR e OPERADOR podem."
  );

  // Atualiza o relógio
  React.useEffect(() => {
    if (saving) return;
    const id = setInterval(() => setNow(new Date().toLocaleString("pt-BR")), 1000);
    return () => clearInterval(id);
  }, [saving]);

  // 🚀 Busca o papel no app_users com fallback (id -> email) e usando maybeSingle()
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

        // 1) tenta por id
        let papel: string | null = null;
        const { data: byId, error: e1 } = await supabase
          .from("app_users")
          .select("papel")
          .eq("id", user.id)
          .maybeSingle(); // <<<<<< chave para não cair em erro quando não achar

        if (e1) throw e1;
        if (byId?.papel) {
          papel = String(byId.papel);
        } else if (user.email) {
          // 2) fallback por email
          const { data: byEmail, error: e2 } = await supabase
            .from("app_users")
            .select("papel")
            .eq("email", user.email)
            .maybeSingle();
          if (e2) throw e2;
          if (byEmail?.papel) papel = String(byEmail.papel);
        }

        setUserRole((papel || "VISITANTE").toUpperCase());
      } catch {
        // fallback seguro
        setUserRole("VISITANTE");
      }
    })();
  }, []);
  // ================================================================

  function clear() {
    setMatricula("");
    setOs("");
    setBairro("");
    setRua("");
    setNumero("");
    setPontoRef("");
    setMotivo("");
    setMotivoOutros("");
    setPdfOrdem(null);
  }

  // Matrícula
  const handleMatricula = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value.replace(/\D/g, "");
    if (value.length > 5) value = value.slice(0, 5);
    setMatricula(value);
  };
  const formatMatricula = () => {
    if (matricula.length < 5) {
      const m = matricula.padStart(5, "0");
      setMatricula(m);
      return m;
    }
    return matricula;
  };

  // Busca dados anteriores
  async function fetchMatriculaData(m: string) {
    if (!m) return;

    let { data, error } = await supabase
      .from("ordens_corte")
      .select("bairro, rua, numero, ponto_referencia, motivo, motivo_outros")
      .eq("matricula", m)
      .order("created_at", { ascending: false })
      .limit(1);

    if (!error && data && data.length > 0) {
      const d = data[0] as any;
      setBairro(d?.bairro ?? "");
      setRua(d?.rua ?? "");
      setNumero(d?.numero ?? "");
      setPontoRef(d?.ponto_referencia ?? "");
      setMotivo(d?.motivo ?? "");
      setMotivoOutros(d?.motivo_outros ?? "");
      return;
    }

    let { data: dataRel, error: errorRel } = await supabase
      .from("ordens_religacao")
      .select("bairro, rua, numero, ponto_referencia")
      .eq("matricula", m)
      .order("created_at", { ascending: false })
      .limit(1);

    if (!errorRel && dataRel && dataRel.length > 0) {
      const d = dataRel[0] as any;
      setBairro(d?.bairro ?? "");
      setRua(d?.rua ?? "");
      setNumero(d?.numero ?? "");
      setPontoRef(d?.ponto_referencia ?? "");
      setMotivo("");
      setMotivoOutros("");
    }
  }

  // OS
  const handleOs = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value.replace(/\D/g, "");
    if (value.length > 6) value = value.slice(0, 6);
    setOs(value);
  };
  const validateOs = () => os.length === 6;

  function validate(): string | null {
    if (!matricula.trim()) return "Informe a matrícula.";
    if (!validateOs()) return "O campo OS deve ter exatamente 6 números.";
    if (!bairro.trim()) return "Informe o bairro.";
    if (!rua.trim()) return "Informe a rua.";
    if (!numero.trim()) return "Informe o número.";
    if (!pontoRef.trim()) return "Informe o ponto de referência.";
    if (!motivo) return "Selecione o motivo do corte.";
    if (motivo === "outros" && !motivoOutros.trim()) return "Descreva o motivo em 'Outros'.";
    if (!pdfOrdem) return "É obrigatório anexar o PDF da ordem de corte.";
    return null;
  }

  // 1) validar, checar permissão e abrir modal de tipo
  async function onSave(e: React.FormEvent) {
    e.preventDefault();

    if (!isAllowed) {
      setPermText(
        "Seu perfil não tem permissão para criar ordens de corte. Apenas ADM, DIRETOR, COORDENADOR e OPERADOR podem."
      );
      setPermModalOpen(true);
      return;
    }

    const m = formatMatricula();
    const err = validate();
    if (err) {
      setMsg({ kind: "err", text: err });
      setTimeout(() => setMsg(null), 2000);
      return;
    }
    setTipoModalOpen(true);
  }

  // 2) após escolher o tipo, salvar (grava corte_na_rua)
  async function proceedSave(corteNaRua: boolean) {
    try {
      setTipoModalOpen(false);
      setSaving(true);
      setMsg(null);

      // revalida permissão imediatamente antes de enviar
      if (!isAllowed) {
        setPermText(
          "Seu perfil não tem permissão para criar ordens de corte. Apenas ADM, DIRETOR, COORDENADOR e OPERADOR podem."
        );
        setPermModalOpen(true);
        return;
      }

      const { data: userData, error: userErr } = await supabase.auth.getUser();
      if (userErr) throw userErr;
      const user = userData?.user;
      if (!user) throw new Error("Usuário não autenticado.");

      const id = crypto.randomUUID();
      const base = `cortes/${user.id}/${id}`;

      const ordemPath = await (pdfOrdem
        ? supabase.storage
            .from("ordens-pdfs")
            .upload(`${base}/ordem.pdf`, pdfOrdem, {
              upsert: true,
              contentType: pdfOrdem.type || "application/pdf",
            })
            .then((r) => r.data?.path ?? null)
        : Promise.resolve(null));
      if (!ordemPath) throw new Error("Falha ao salvar o PDF obrigatório.");

      const { error: insErr } = await supabase.from("ordens_corte").insert({
        id,
        os: os.trim(),
        matricula: matricula.trim(),
        bairro: bairro.trim(),
        rua: rua.trim(),
        numero: numero.trim(),
        ponto_referencia: pontoRef.trim(),
        motivo,
        motivo_outros: motivo === "outros" ? motivoOutros.trim() : null,
        status: "aguardando_corte",
        pdf_ordem_path: ordemPath,
        corte_na_rua: corteNaRua, // grava aqui
        // created_by: não precisa — default do banco usa auth.uid()
      });

      if (insErr) throw insErr;

      setMsg({ kind: "ok", text: "OS de corte criada com sucesso!" });
      clear();
    } catch (e: any) {
      const emsg = String(e?.message || "");
      if (/Impedido|insufficient_privilege|permission|RLS|row-level|policy|denied/i.test(emsg)) {
        setPermText(
          "A operação foi bloqueada pelas regras de segurança. Apenas ADM, DIRETOR, COORDENADOR e OPERADOR podem criar ordens de corte."
        );
        setPermModalOpen(true);
      } else {
        setMsg({ kind: "err", text: emsg || "Falha ao salvar." });
      }
    } finally {
      setSaving(false);
      setTimeout(() => setMsg(null), 2000);
    }
  }

  return (
    <div className="rounded-2xl bg-slate-900/50 ring-1 ring-white/10 p-6 relative">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Nova ordem de corte</h2>
          <p className="text-slate-400 text-sm">Preencha todos os campos abaixo.</p>
        </div>
        <div className="text-xs text-emerald-300 font-semibold">{now}</div>
      </div>

      {/* Form */}
      <form onSubmit={onSave} className="mt-6">
        <div className="space-y-8 divide-y divide-white/10">
          {/* Identificação */}
          <section className="space-y-4">
            <h3 className="text-sm font-semibold text-slate-300">Identificação</h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-slate-300 mb-1">Matrícula *</label>
                <input
                  className="w-full rounded-xl bg-slate-950/60 border border-white/10 px-3 py-2 outline-none focus:ring-2 ring-emerald-400/40 uppercase"
                  placeholder="EX.: 00000"
                  value={matricula}
                  onChange={handleMatricula}
                  onBlur={() => {
                    const m = formatMatricula();
                    fetchMatriculaData(m);
                  }}
                  inputMode="numeric"
                  maxLength={5}
                />
              </div>

              <div>
                <label className="block text-sm text-slate-300 mb-1">OS *</label>
                <input
                  className="w-full rounded-xl bg-slate-950/60 border border-white/10 px-3 py-2 outline-none focus:ring-2 ring-emerald-400/40 uppercase"
                  placeholder="EX.: 123456"
                  value={os}
                  onChange={handleOs}
                  onBlur={validateOs}
                  inputMode="numeric"
                  maxLength={6}
                />
              </div>
            </div>
          </section>

          {/* Endereço */}
          <section className="pt-8 space-y-4">
            <h3 className="text-sm font-semibold text-slate-300">Endereço</h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-slate-300 mb-1">Bairro *</label>
                <input
                  className="w-full rounded-xl bg-slate-950/60 border border-white/10 px-3 py-2 outline-none focus:ring-2 ring-emerald-400/40 uppercase"
                  placeholder="EX.: CENTRO"
                  value={bairro}
                  onChange={(e) => setBairro(e.target.value.toUpperCase())}
                />
              </div>
              <div>
                <label className="block text-sm text-slate-300 mb-1">Rua *</label>
                <input
                  className="w-full rounded-xl bg-slate-950/60 border border-white/10 px-3 py-2 outline-none focus:ring-2 ring-emerald-400/40 uppercase"
                  placeholder="EX.: RUA DAS FLORES"
                  value={rua}
                  onChange={(e) => setRua(e.target.value.toUpperCase())}
                />
              </div>
              <div>
                <label className="block text-sm text-slate-300 mb-1">Número *</label>
                <input
                  className="w-full rounded-xl bg-slate-950/60 border border-white/10 px-3 py-2 outline-none focus:ring-2 ring-emerald-400/40 uppercase"
                  placeholder="EX.: 123"
                  value={numero}
                  onChange={(e) => setNumero(e.target.value.toUpperCase())}
                />
              </div>
              <div>
                <label className="block text-sm text-slate-300 mb-1">Ponto de referência *</label>
                <input
                  className="w-full rounded-xl bg-slate-950/60 border border-white/10 px-3 py-2 outline-none focus:ring-2 ring-emerald-400/40 uppercase"
                  placeholder="EX.: PRÓXIMO À PRAÇA…"
                  value={pontoRef}
                  onChange={(e) => setPontoRef(e.target.value.toUpperCase())}
                />
              </div>
            </div>
          </section>

          {/* Motivo */}
          <section className="pt-8 space-y-4">
            <h3 className="text-sm font-semibold text-slate-300">Motivo</h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-slate-300 mb-1">Motivo do corte *</label>
                <select
                  className="w-full rounded-xl bg-slate-950/60 border border-white/10 px-3 py-2 outline-none focus:ring-2 ring-emerald-400/40 uppercase"
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value as any)}
                >
                  <option value="">SELECIONE</option>
                  <option value="faturas">FALTA DE PAGAMENTO DE FATURAS</option>
                  <option value="agendamento">AGENDAMENTO NÃO CUMPRIDO</option>
                  <option value="outros">OUTROS</option>
                </select>
              </div>

              {motivo === "outros" && (
                <div>
                  <label className="block text-sm text-slate-300 mb-1">Descreva o motivo</label>
                  <input
                    className="w-full rounded-xl bg-slate-950/60 border border-white/10 px-3 py-2 outline-none focus:ring-2 ring-emerald-400/40 uppercase"
                    placeholder="EX.: IMÓVEL FECHADO POR 3 VISITAS…"
                    value={motivoOutros}
                    onChange={(e) => setMotivoOutros(e.target.value.toUpperCase())}
                  />
                </div>
              )}
            </div>
          </section>

          {/* Anexos */}
          <section className="pt-8 space-y-4">
            <h3 className="text-sm font-semibold text-slate-300">Anexos</h3>

            <div>
              <label className="block text-sm text-slate-300 mb-2">Anexar PDF da ordem de corte *</label>
              <label className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-indigo-500/20 text-indigo-200 ring-1 ring-indigo-400/40 hover:bg-indigo-500/30 cursor-pointer">
                <input
                  type="file"
                  accept="application/pdf"
                  className="hidden"
                  onChange={(e) => setPdfOrdem(e.target.files?.[0] || null)}
                />
                Selecionar PDF
              </label>
              <span className="ml-3 text-xs text-slate-400">
                {pdfOrdem ? pdfOrdem.name : "Nenhum arquivo selecionado"}
              </span>
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

      {/* Modal: tipo de execução do corte */}
      {tipoModalOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-slate-800 p-6 rounded-2xl w-full max-w-lg text-center">
            <h3 className="text-lg font-semibold text-white">Tipo de execução do corte</h3>
            <p className="text-slate-300 text-sm mt-1">
              Para registro interno: este corte será executado <strong>na rua (adutora)</strong>?
            </p>
            <div className="mt-5 flex flex-wrap gap-3 justify-center">
              <button
                onClick={() => proceedSave(true)}
                className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm"
              >
                Sim, na rua (adutora)
              </button>
              <button
                onClick={() => proceedSave(false)}
                className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-sm"
              >
                Não, corte padrão
              </button>
              <button
                onClick={() => setTipoModalOpen(false)}
                className="px-4 py-2 rounded-lg bg-white/10 border border-white/20 hover:bg-white/20 text-white text-sm"
              >
                Cancelar
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
