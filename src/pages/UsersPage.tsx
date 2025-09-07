// src/pages/UsersPage.tsx
import React, { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";

type Papel = "ADM" | "DIRETOR" | "COORDENADOR" | "OPERADOR" | "TERCEIRIZADA" | "VISITANTE";

type FormData = {
  email: string;
  nome: string;
  setor: string;
  telefone: string;
  papel: Papel;
};

const PAPEIS: { value: Papel; label: string }[] = [
  { value: "ADM", label: "Administrador" },
  { value: "DIRETOR", label: "Diretor" },
  { value: "COORDENADOR", label: "Coordenador" },
  { value: "OPERADOR", label: "Operador" },
  { value: "TERCEIRIZADA", label: "Terceirizada" },
  { value: "VISITANTE", label: "Visitante" },
];

export default function UsersPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState<boolean>(false);

  const [form, setForm] = useState<FormData>({
    email: "",
    nome: "",
    setor: "",
    telefone: "",
    papel: "VISITANTE",
  });

  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // --------------------------
  // carregar perfil
  // --------------------------
  async function loadProfile() {
    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      // usuário logado
      const { data: auth, error: authErr } = await supabase.auth.getUser();
      if (authErr) throw authErr;
      const uid = auth.user?.id || null;
      const emailFromAuth = auth.user?.email || "";
      if (!uid) throw new Error("Sessão inválida. Faça login novamente.");

      setUserId(uid);

      // checa admin (RPC is_admin)
      try {
        const { data: isAdm } = await supabase.rpc("is_admin");
        setIsAdmin(Boolean(isAdm));
      } catch {
        // fallback: se RPC não existir, tenta pelo papel do usuário
        // não lança erro — só não definirá admin
      }

      // busca perfil
      const { data, error } = await supabase
        .from("app_users")
        .select("id,email,nome,setor,telefone,papel")
        .eq("id", uid)
        .maybeSingle();

      if (error) throw error;

      if (!data) {
        // cria registro mínimo para o próprio usuário (evita NOT NULL no backend)
        const defaultNome = "Sem Nome";
        const { error: insErr } = await supabase.from("app_users").insert([
          {
            id: uid,
            email: emailFromAuth,
            nome: defaultNome,
            setor: "ADM",
            papel: "VISITANTE",
          },
        ]);
        if (insErr) throw insErr;

        setForm({
          email: emailFromAuth,
          nome: defaultNome,
          setor: "ADM",
          telefone: "",
          papel: "VISITANTE",
        });
      } else {
        setForm({
          email: data.email || emailFromAuth,
          nome: data.nome || "Sem Nome",
          setor: data.setor || "ADM",
          telefone: data.telefone || "",
          papel: (data.papel as Papel) || "VISITANTE",
        });
      }
    } catch (e: any) {
      setErrorMsg(e.message || "Erro ao carregar perfil.");
    } finally {
      setLoading(false);
    }
  }

  // --------------------------
  // salvar perfil
  // --------------------------
  async function handleSave() {
    if (!userId) return;

    const nome = (form.nome || "").trim();
    const setor = (form.setor || "").trim();

    if (!nome) {
      setErrorMsg("Informe o nome completo.");
      return;
    }
    if (!setor) {
      setErrorMsg("Informe o setor de trabalho.");
      return;
    }

    setSaving(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const payload: any = {
        nome,
        setor,
        telefone: form.telefone || null,
      };

      if (isAdmin) {
        payload.papel = form.papel.toUpperCase();
      }

      const { error } = await supabase.from("app_users").update(payload).eq("id", userId);
      if (error) throw error;

      setSuccessMsg("Perfil atualizado com sucesso!");
      await loadProfile(); // reflete normalizações/updated_at
    } catch (e: any) {
      setErrorMsg(e.message || "Erro ao salvar perfil.");
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    loadProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --------------------------
  // UI
  // --------------------------
  if (loading) {
    return (
      <div className="min-h-[60vh] grid place-items-center">
        <div className="flex items-center gap-3 text-slate-300">
          <div className="h-8 w-8 rounded-full border-2 border-indigo-400 border-t-transparent animate-spin" />
          <span>Carregando seu perfil…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <h1 className="text-3xl font-bold">Meu Perfil</h1>
        {!isAdmin && (
          <span className="ml-auto text-xs px-2 py-1 rounded bg-slate-800 text-slate-300">
            Edição limitada
          </span>
        )}
        {isAdmin && (
          <span className="ml-auto text-xs px-2 py-1 rounded bg-emerald-600/20 text-emerald-300 ring-1 ring-emerald-400/30">
            Administrador
          </span>
        )}
      </div>

      {errorMsg && (
        <div className="mb-4 rounded-lg bg-rose-600/15 text-rose-200 ring-1 ring-rose-400/30 px-3 py-2">
          {errorMsg}
        </div>
      )}
      {successMsg && (
        <div className="mb-4 rounded-lg bg-emerald-600/15 text-emerald-200 ring-1 ring-emerald-400/30 px-3 py-2">
          {successMsg}
        </div>
      )}

      <div className="rounded-2xl bg-slate-900/50 ring-1 ring-white/10">
        <div className="px-5 py-4 border-b border-white/10">
          <h2 className="text-lg font-semibold text-slate-200">Informações do usuário</h2>
          <p className="text-xs text-slate-400 mt-1">
            Gerencie seus dados pessoais e seu nível de acesso ao sistema.
          </p>
        </div>

        <div className="p-6 space-y-6">
          {/* Linha 1 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Email (read-only) */}
            <div>
              <label className="block text-xs text-slate-400 mb-1">E-mail</label>
              <input
                type="email"
                value={form.email}
                disabled
                className="w-full p-2 rounded-lg bg-slate-800 text-slate-300 border border-white/10 disabled:opacity-60"
              />
              <p className="text-[11px] text-slate-500 mt-1">
                O e-mail é o mesmo usado para entrar no sistema.
              </p>
            </div>

            {/* Nome */}
            <div>
              <label className="block text-xs text-slate-400 mb-1">
                Nome completo <span className="text-rose-400">*</span>
              </label>
              <input
                type="text"
                value={form.nome}
                onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))}
                placeholder="Ex.: João da Silva"
                className="w-full p-2 rounded-lg bg-slate-800 text-slate-200 border border-white/10 outline-none focus:ring-2 ring-indigo-400/40"
              />
              <p className="text-[11px] text-slate-500 mt-1">
                Como deseja aparecer em relatórios e telas.
              </p>
            </div>
          </div>

          {/* Linha 2 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Setor */}
            <div>
              <label className="block text-xs text-slate-400 mb-1">
                Setor de trabalho <span className="text-rose-400">*</span>
              </label>
              <input
                type="text"
                value={form.setor}
                onChange={(e) => setForm((f) => ({ ...f, setor: e.target.value }))}
                placeholder="Ex.: ADM, Direção, Atendimento…"
                className="w-full p-2 rounded-lg bg-slate-800 text-slate-200 border border-white/10 outline-none focus:ring-2 ring-indigo-400/40"
              />
              <p className="text-[11px] text-slate-500 mt-1">
                Escolha uma opção ou descreva seu setor.
              </p>
            </div>

            {/* Telefone */}
            <div>
              <label className="block text-xs text-slate-400 mb-1">Telefone</label>
              <input
                type="tel"
                value={form.telefone}
                onChange={(e) => setForm((f) => ({ ...f, telefone: e.target.value }))}
                placeholder="DDD + número"
                className="w-full p-2 rounded-lg bg-slate-800 text-slate-200 border border-white/10 outline-none focus:ring-2 ring-indigo-400/40"
              />
              <p className="text-[11px] text-slate-500 mt-1">
                Opcional. Uso interno para contato.
              </p>
            </div>
          </div>

          {/* Linha 3 - Papel */}
          <div>
            <label className="block text-xs text-slate-400 mb-1">
              Grau de acesso <span className="text-rose-400">*</span>
            </label>
            <select
              value={form.papel}
              disabled={!isAdmin}
              onChange={(e) =>
                setForm((f) => ({ ...f, papel: e.target.value.toUpperCase() as Papel }))
              }
              className="w-full p-2 rounded-lg bg-slate-800 text-slate-200 border border-white/10 outline-none focus:ring-2 ring-indigo-400/40 disabled:opacity-60"
              title={!isAdmin ? "Apenas administradores podem alterar o grau de acesso" : ""}
            >
              {PAPEIS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-slate-500 mt-1">
              Defina o nível de acesso ao sistema. (Somente admin pode alterar)
            </p>
          </div>

          {/* Ações */}
          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={loadProfile}
              className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-100"
            >
              Recarregar
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white"
            >
              {saving ? "Salvando…" : "Salvar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
