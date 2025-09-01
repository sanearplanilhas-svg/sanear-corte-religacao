import * as React from "react";
import supabase from "../../lib/supabase";

type Msg = { kind: "ok" | "err"; text: string } | null;

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

  React.useEffect(() => {
    const id = setInterval(() => setNow(new Date().toLocaleString("pt-BR")), 1000);
    return () => clearInterval(id);
  }, []);

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

  // 🔍 Buscar dados existentes da matrícula (em corte e religação)
  async function fetchMatriculaData(m: string) {
    if (!m) return;

    // 1º tenta na tabela de corte
    let { data, error } = await supabase
      .from("ordens_corte")
      .select("bairro, rua, numero, ponto_referencia, motivo, motivo_outros")
      .eq("matricula", m)
      .order("created_at", { ascending: false })
      .limit(1);

    if (!error && data && data.length > 0) {
      const d = data[0];
      setBairro(d?.bairro ?? "");
      setRua(d?.rua ?? "");
      setNumero(d?.numero ?? "");
      setPontoRef(d?.ponto_referencia ?? "");
      setMotivo((d as any)?.motivo ?? "");
      setMotivoOutros((d as any)?.motivo_outros ?? "");
      return;
    }

    // 2º se não achou em corte, tenta na de religação
    let { data: dataRel, error: errorRel } = await supabase
      .from("ordens_religacao")
      .select("bairro, rua, numero, ponto_referencia")
      .eq("matricula", m)
      .order("created_at", { ascending: false })
      .limit(1);

    if (!errorRel && dataRel && dataRel.length > 0) {
      const d = dataRel[0];
      setBairro(d?.bairro ?? "");
      setRua(d?.rua ?? "");
      setNumero(d?.numero ?? "");
      setPontoRef(d?.ponto_referencia ?? "");
      setMotivo(""); // não existe motivo em religação
      setMotivoOutros("");
    }
  }

  // 👉 OS
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

  async function uploadIfAny(file: File | null, path: string) {
    if (!file) return null;
    const { data, error } = await supabase.storage
      .from("ordens-pdfs")
      .upload(path, file, { upsert: true, contentType: file.type || "application/pdf" });
    if (error) throw error;
    return data?.path ?? null;
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

    setSaving(true);
    setMsg(null);

    try {
      const user = (await supabase.auth.getUser()).data.user;
      if (!user) throw new Error("Usuário não autenticado.");

      const { data: inserted, error: insErr } = await supabase
        .from("ordens_corte")
        .insert({
          os: os.trim(),
          matricula: m.trim(),
          bairro: bairro.trim(),
          rua: rua.trim(),
          numero: numero.trim(),
          ponto_referencia: pontoRef.trim(),
          motivo,
          motivo_outros: motivo === "outros" ? motivoOutros.trim() : null,
          status: "aguardando_corte",
        })
        .select("id")
        .single();

      if (insErr) throw insErr;
      const id = inserted.id as string;

      const base = `cortes/${user.id}/${id}`;
      const up1 = await uploadIfAny(pdfOrdem, `${base}/ordem.pdf`);
      if (up1) {
        const { error: upErr } = await supabase
          .from("ordens_corte")
          .update({ pdf_path: up1 })
          .eq("id", id);
        if (upErr) throw upErr;
      }

      setMsg({ kind: "ok", text: "OS de corte criada com sucesso!" });
      setTimeout(() => setMsg(null), 2000);
      clear();
    } catch (e: any) {
      setMsg({ kind: "err", text: e?.message ?? "Falha ao salvar." });
      setTimeout(() => setMsg(null), 2000);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-2xl bg-slate-900/50 ring-1 ring-white/10 p-6 relative">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Nova ordem de corte</h2>
          <p className="text-slate-400 text-sm">Preencha todos os campos abaixo.</p>
        </div>
        <div className="text-xs text-emerald-300 font-semibold">{now}</div>
      </div>

      <form onSubmit={onSave} className="mt-6 space-y-6">
        {/* Matrícula e OS */}
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
          <div>
            <label className="block text-sm text-slate-300 mb-1">OS *</label>
            <input
              className="w-full rounded-xl bg-slate-950/60 border border-white/10 px-3 py-2 outline-none focus:ring-2 ring-emerald-400/40 uppercase"
              placeholder="Ex.: 123456"
              value={os}
              onChange={handleOs}
              onBlur={validateOs}
            />
          </div>
        </div>

        {/* Endereço */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-slate-300 mb-1">Bairro *</label>
            <input
              className="w-full rounded-xl bg-slate-950/60 border border-white/10 px-3 py-2 outline-none focus:ring-2 ring-emerald-400/40 uppercase"
              placeholder="Ex.: CENTRO"
              value={bairro}
              onChange={(e) => setBairro(e.target.value.toUpperCase())}
            />
          </div>
          <div>
            <label className="block text-sm text-slate-300 mb-1">Rua *</label>
            <input
              className="w-full rounded-xl bg-slate-950/60 border border-white/10 px-3 py-2 outline-none focus:ring-2 ring-emerald-400/40 uppercase"
              placeholder="Ex.: RUA DAS FLORES"
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
              placeholder="Ex.: 123"
              value={numero}
              onChange={(e) => setNumero(e.target.value.toUpperCase())}
            />
          </div>
          <div>
            <label className="block text-sm text-slate-300 mb-1">Ponto de referência *</label>
            <input
              className="w-full rounded-xl bg-slate-950/60 border border-white/10 px-3 py-2 outline-none focus:ring-2 ring-emerald-400/40 uppercase"
              placeholder="Ex.: PRÓXIMO À PRAÇA…"
              value={pontoRef}
              onChange={(e) => setPontoRef(e.target.value.toUpperCase())}
            />
          </div>
        </div>

        {/* Motivo */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-slate-300 mb-1">Motivo do corte *</label>
            <select
              className="w-full rounded-xl bg-slate-950/60 border border-white/10 px-3 py-2 outline-none focus:ring-2 ring-emerald-400/40 uppercase"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value as any)}
            >
              <option value="">Selecione</option>
              <option value="faturas">Falta de pagamento de faturas</option>
              <option value="agendamento">Agendamento não cumprido</option>
              <option value="outros">Outros</option>
            </select>
          </div>

          {motivo === "outros" && (
            <div>
              <label className="block text-sm text-slate-300 mb-1">Descreva o motivo</label>
              <input
                className="w-full rounded-xl bg-slate-950/60 border border-white/10 px-3 py-2 outline-none focus:ring-2 ring-emerald-400/40 uppercase"
                placeholder="Ex.: IMÓVEL FECHADO POR 3 VISITAS…"
                value={motivoOutros}
                onChange={(e) => setMotivoOutros(e.target.value.toUpperCase())}
              />
            </div>
          )}
        </div>

        {/* Upload PDF */}
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

        {/* Ações */}
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

      {/* Popup fixo no canto */}
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
