import * as React from "react";
import supabase from "../../lib/supabase";

type Msg = { kind: "ok" | "err"; text: string } | null;

export default function ReconnectionOrderForm() {
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

  // 🔥 Modal bloqueio por 24h
  const [blockOpen, setBlockOpen] = React.useState(false);
  const [tempoRestante, setTempoRestante] = React.useState<string>("");

  React.useEffect(() => {
    const id = setInterval(() => setNow(new Date().toLocaleString("pt-BR")), 1000);
    return () => clearInterval(id);
  }, []);

  function clear() {
    setMatricula("");
    setBairro("");
    setRua("");
    setNumero("");
    setPontoRef("");
    setPrioridade(false);
    setPdfOrdem(null);
    setPdfComprovante(null);
  }

  // 👉 Matrícula
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

  // 🔍 Buscar dados existentes da matrícula (religação → corte)
  async function fetchMatriculaData(m: string) {
    if (!m) return;

    // 1º tenta buscar em ordens_religacao
    let { data, error } = await supabase
      .from("ordens_religacao")
      .select("bairro, rua, numero, ponto_referencia, prioridade")
      .eq("matricula", m)
      .order("created_at", { ascending: false })
      .limit(1);

    if (!error && data && data.length > 0) {
      const d = data[0];
      setBairro(d?.bairro ?? "");
      setRua(d?.rua ?? "");
      setNumero(d?.numero ?? "");
      setPontoRef(d?.ponto_referencia ?? "");
      setPrioridade(!!d?.prioridade);
      return;
    }

    // 2º se não achou, busca em ordens_corte
    let { data: dataCorte, error: errorCorte } = await supabase
      .from("ordens_corte")
      .select("bairro, rua, numero, ponto_referencia")
      .eq("matricula", m)
      .order("created_at", { ascending: false })
      .limit(1);

    if (!errorCorte && dataCorte && dataCorte.length > 0) {
      const d = dataCorte[0];
      setBairro(d?.bairro ?? "");
      setRua(d?.rua ?? "");
      setNumero(d?.numero ?? "");
      setPontoRef(d?.ponto_referencia ?? "");
      setPrioridade(false); // corte não tem prioridade
    }
  }

  function validate(): string | null {
    if (!matricula.trim()) return "Informe a matrícula.";
    if (!bairro.trim()) return "Informe o bairro.";
    if (!rua.trim()) return "Informe a rua.";
    if (!numero.trim()) return "Informe o número.";
    if (!pontoRef.trim()) return "Informe o ponto de referência.";
    if (!pdfOrdem) return "É obrigatório anexar o PDF da papeleta de religação.";
    return null;
  }

  async function uploadIfAny(file: File | null, path: string) {
    if (!file) return null;
    const { data, error } = await supabase.storage
      .from("ordens-pdfs")
      .upload(path, file, { upsert: true, contentType: file.type || "application/pdf" });
    if (error) throw error;
    return data?.path ?? null;
  }

  async function doSave() {
    try {
      const user = (await supabase.auth.getUser()).data.user;
      if (!user) throw new Error("Usuário não autenticado.");

      const { data: inserted, error: insErr } = await supabase
        .from("ordens_religacao")
        .insert({
          matricula: matricula.trim(),
          bairro: bairro.trim(),
          rua: rua.trim(),
          numero: numero.trim(),
          ponto_referencia: pontoRef.trim(),
          prioridade,
          status: "aguardando_religacao",
        })
        .select("id")
        .single();

      if (insErr) throw insErr;
      const id = inserted.id as string;

      const base = `religacoes/${user.id}/${id}`;
      const up1 = await uploadIfAny(pdfOrdem, `${base}/ordem.pdf`);
      const up2 = await uploadIfAny(pdfComprovante, `${base}/comprovante.pdf`);

      if (!up1) throw new Error("Falha ao salvar o PDF obrigatório.");

      const { error: upErr } = await supabase
        .from("ordens_religacao")
        .update({
          pdf_ordem_path: up1,
          pdf_comprovante_path: up2 ?? null,
        })
        .eq("id", id);
      if (upErr) throw upErr;

      setMsg({ kind: "ok", text: "Salvo com sucesso!" });
      setTimeout(() => setMsg(null), 2000);
      clear();
    } catch (e: any) {
      setMsg({ kind: "err", text: e?.message ?? "Falha ao salvar." });
      setTimeout(() => setMsg(null), 2000);
    } finally {
      setSaving(false);
    }
  }

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    const m = formatMatricula();
    const err = validate();
    if (err) {
      setMsg({ kind: "err", text: err });
      setTimeout(() => setMsg(null), 2000);
      return;
    }

    // 🔍 Verificar última papeleta dessa matrícula
    const { data: ultima, error: errLast } = await supabase
      .from("ordens_religacao")
      .select("created_at")
      .eq("matricula", m)
      .order("created_at", { ascending: false })
      .limit(1);

   if (!errLast && ultima && ultima.length > 0) {
  const lastCreatedAt = ultima[0]?.created_at;
  if (lastCreatedAt) {
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
      return; // ❌ bloqueia o cadastro
    }
  }
}


    // se não tiver comprovante, abrir modal
    if (!pdfComprovante) {
      setPendingSave(() => doSave);
      setConfirmOpen(true);
      return;
    }

    setSaving(true);
    doSave();
  }

  return (
    <div className="rounded-2xl bg-slate-900/50 ring-1 ring-white/10 p-6 relative">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Nova Papeleta de Religação</h2>
          <p className="text-slate-400 text-sm">Preencha todos os campos abaixo.</p>
        </div>
        <div className="text-xs text-emerald-300 font-semibold">{now}</div>
      </div>

      <form onSubmit={onSave} className="mt-6 space-y-6">
        {/* ---- CAMPOS DO FORM ---- */}
        {/* Matrícula e prioridade */}
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
                fetchMatriculaData(m);
              }}
            />
          </div>
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <label className="block text-sm text-slate-300 mb-1">Prioridade</label>
              <div
                onClick={() => setPrioridade((v) => !v)}
                className={`w-full cursor-pointer rounded-xl px-3 py-2 border transition
                  ${prioridade
                    ? "bg-fuchsia-500/15 border-fuchsia-400/30 text-fuchsia-200"
                    : "bg-slate-950/60 border-white/10 text-slate-300"}`}
              >
                {prioridade ? "PRIORIDADE (liberada pelo diretor)" : "Normal"}
              </div>
            </div>
          </div>
        </div>

        {/* Endereço */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-slate-300 mb-1">Bairro *</label>
            <input
              className="w-full rounded-xl bg-slate-950/60 border border-white/10 px-3 py-2 outline-none focus:ring-2 ring-emerald-400/40 uppercase"
              value={bairro}
              onChange={(e) => setBairro(e.target.value.toUpperCase())}
            />
          </div>
          <div>
            <label className="block text-sm text-slate-300 mb-1">Rua *</label>
            <input
              className="w-full rounded-xl bg-slate-950/60 border border-white/10 px-3 py-2 outline-none focus:ring-2 ring-emerald-400/40 uppercase"
              value={rua}
              onChange={(e) => setRua(e.target.value.toUpperCase())}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-slate-300 mb-1">Número *</label>
            <input
              className="w-full rounded-xl bg-slate-950/60 border border-white/10 px-3 py-2 outline-none focus:ring-2 ring-emerald-400/40 uppercase"
              value={numero}
              onChange={(e) => setNumero(e.target.value.toUpperCase())}
            />
          </div>
          <div>
            <label className="block text-sm text-slate-300 mb-1">Ponto de referência *</label>
            <input
              className="w-full rounded-xl bg-slate-950/60 border border-white/10 px-3 py-2 outline-none focus:ring-2 ring-emerald-400/40 uppercase"
              value={pontoRef}
              onChange={(e) => setPontoRef(e.target.value.toUpperCase())}
            />
          </div>
        </div>

        {/* Uploads */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-slate-300 mb-2">Anexar PDF da papeleta de Religação *</label>
            <label className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-indigo-500/20 text-indigo-200 ring-1 ring-indigo-400/40 hover:bg-indigo-500/30 cursor-pointer">
              <input type="file" accept="application/pdf" className="hidden" onChange={(e) => setPdfOrdem(e.target.files?.[0] || null)} />
              Selecionar PDF
            </label>
            <span className="ml-3 text-xs text-slate-400">{pdfOrdem ? pdfOrdem.name : "Nenhum arquivo selecionado"}</span>
          </div>
          <div>
            <label className="block text-sm text-slate-300 mb-2">Anexar comprovante (opcional)</label>
            <label className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-purple-500/20 text-purple-200 ring-1 ring-purple-400/40 hover:bg-purple-500/30 cursor-pointer">
              <input type="file" accept="application/pdf" className="hidden" onChange={(e) => setPdfComprovante(e.target.files?.[0] || null)} />
              Selecionar PDF
            </label>
            <span className="ml-3 text-xs text-slate-400">{pdfComprovante ? pdfComprovante.name : "Nenhum arquivo selecionado"}</span>
          </div>
        </div>

        {/* Ações */}
        <div className="flex items-center gap-3 pt-2">
          <button type="submit" disabled={saving} className="px-4 py-2 rounded-lg bg-emerald-500/20 text-emerald-200 ring-1 ring-emerald-400/40 hover:bg-emerald-500/30 disabled:opacity-50">
            {saving ? "Salvando…" : "Salvar"}
          </button>
          <button type="button" onClick={clear} className="px-4 py-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10">
            Limpar
          </button>
        </div>
      </form>

      {/* Modal de bloqueio 24h */}
      {blockOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-rose-700 p-6 rounded-xl text-center max-w-sm w-full text-white">
            <h3 className="text-lg font-bold mb-3">Cadastro bloqueado</h3>
            <p className="mb-2">Já existe uma papeleta cadastrada para esta matrícula.</p>
            <p className="mb-4">⏳ Faltam {tempoRestante} para liberar novo cadastro.</p>
            <button onClick={() => setBlockOpen(false)} className="px-4 py-2 bg-white/20 rounded-lg hover:bg-white/30">
              Ok, entendi
            </button>
          </div>
        </div>
      )}

      {/* Modal de confirmação existente */}
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
                  pendingSave?.();
                }}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-white"
              >
                Sim, salvar
              </button>
              <button onClick={() => setConfirmOpen(false)} className="px-4 py-2 bg-slate-600 hover:bg-slate-500 rounded-lg text-white">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Popup fixo */}
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
