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

// 🔐 Senha fixa para liberar edição
const EDIT_PASSCODE = "29101993";

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

  // 🔒 Bloqueio por senha
  const [canEdit, setCanEdit] = useState<boolean>(false);
  const [showPwdModal, setShowPwdModal] = useState<boolean>(false);
  const [pwd, setPwd] = useState<string>("");
  const [pwdErr, setPwdErr] = useState<string>("");

  // --------------------------
  // carregar perfil (robusto contra email duplicado)
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

      // checa admin (RPC is_admin) - se a RPC não existir, ignora
      try {
        const { data: isAdm } = await supabase.rpc("is_admin");
        setIsAdmin(Boolean(isAdm));
      } catch {
        setIsAdmin(false);
      }

      // 1) tenta achar por ID (uid do auth)
      const { data: byId, error: byIdErr } = await supabase
        .from("app_users")
        .select("id,email,nome,setor,telefone,papel")
        .eq("id", uid)
        .maybeSingle();

      if (byIdErr) throw byIdErr;

      if (byId) {
        // ✅ achou pelo ID: usa esse
        setUserId(byId.id);
        setForm({
          email: byId.email || emailFromAuth,
          nome: byId.nome || "Sem Nome",
          setor: byId.setor || "ADM",
          telefone: byId.telefone || "",
          papel: (byId.papel as Papel) || "VISITANTE",
        });
      } else {
        // 2) não achou por ID → tenta por EMAIL
        const { data: byEmail, error: byEmailErr } = await supabase
          .from("app_users")
          .select("id,email,nome,setor,telefone,papel")
          .eq("email", emailFromAuth)
          .maybeSingle();

        if (byEmailErr) throw byEmailErr;

        if (byEmail) {
          // ✅ já existe linha com esse e-mail (mas outro id). Tenta "migrar" para o uid atual.
          const { error: moveErr } = await supabase
            .from("app_users")
            .update({ id: uid })
            .eq("id", byEmail.id);

          if (!moveErr) {
            // migrou: passa a usar o uid
            setUserId(uid);
            setForm({
              email: byEmail.email || emailFromAuth,
              nome: byEmail.nome || "Sem Nome",
              setor: byEmail.setor || "ADM",
              telefone: byEmail.telefone || "",
              papel: (byEmail.papel as Papel) || "VISITANTE",
            });
          } else {
            // não conseguiu mudar o id (FKs etc.) → usa o registro existente
            setUserId(byEmail.id);
            setForm({
              email: byEmail.email || emailFromAuth,
              nome: byEmail.nome || "Sem Nome",
              setor: byEmail.setor || "ADM",
              telefone: byEmail.telefone || "",
              papel: (byEmail.papel as Papel) || "VISITANTE",
            });
          }
        } else {
          // 3) não existe por id nem por email → cria com UPSERT (onConflict: email)
          const defaultNome = "Sem Nome";
          const { data: created, error: upErr } = await supabase
            .from("app_users")
            .upsert(
              {
                id: uid,
                email: emailFromAuth,
                nome: defaultNome,
                setor: "ADM",
                papel: "VISITANTE",
              },
              { onConflict: "email" }
            )
            .select()
            .single();

          if (upErr) throw upErr;

          setUserId(created.id);
          setForm({
            email: created.email || emailFromAuth,
            nome: created.nome || defaultNome,
            setor: created.setor || "ADM",
            telefone: created.telefone || "",
            papel: (created.papel as Papel) || "VISITANTE",
          });
        }
      }

      // Sempre começa bloqueado
      setCanEdit(false);
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

      // re-carrega (para refletir normalizações) e re-bloqueia
      await loadProfile();
      setCanEdit(false);
    } catch (e: any) {
      setErrorMsg(e.message || "Erro ao salvar perfil.");
    } finally {
      setSaving(false);
    }
  }

  // --------------------------
  // bloqueio / desbloqueio
  // --------------------------
  function openUnlockModal() {
    setPwd("");
    setPwdErr("");
    setShowPwdModal(true);
  }

  function checkPwdAndUnlock() {
    if (pwd === EDIT_PASSCODE) {
      setCanEdit(true);
      setShowPwdModal(false);
      setPwd("");
      setPwdErr("");
    } else {
      setPwdErr("Senha inválida.");
    }
  }

  function relock() {
    setCanEdit(false);
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

        {/* badges */}
        {!isAdmin && (
          <span className="ml-auto text-xs px-2 py-1 rounded bg-slate-800 text-slate-300">
            Edição de papel restrita
          </span>
        )}
        {isAdmin && (
          <span className="ml-auto text-xs px-2 py-1 rounded bg-emerald-600/20 text-emerald-300 ring-1 ring-emerald-400/30">
            Administrador
          </span>
        )}

        {/* ações à direita */}
        {!canEdit ? (
          <button
            onClick={openUnlockModal}
            className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white"
          >
            Editar
          </button>
        ) : (
          <div className="flex gap-2">
            <button
              onClick={relock}
              className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-100"
            >
              Bloquear
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white"
            >
              {saving ? "Salvando…" : "Salvar"}
            </button>
          </div>
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
            Para editar, clique em <b>Editar</b> e informe a senha.
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
                disabled={!canEdit}
                className="w-full p-2 rounded-lg bg-slate-800 text-slate-200 border border-white/10 outline-none focus:ring-2 ring-indigo-400/40 disabled:opacity-60"
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
                disabled={!canEdit}
                className="w-full p-2 rounded-lg bg-slate-800 text-slate-200 border border-white/10 outline-none focus:ring-2 ring-indigo-400/40 disabled:opacity-60"
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
                disabled={!canEdit}
                className="w-full p-2 rounded-lg bg-slate-800 text-slate-200 border border-white/10 outline-none focus:ring-2 ring-indigo-400/40 disabled:opacity-60"
              />
              <p className="text-[11px] text-slate-500 mt-1">Opcional. Uso interno para contato.</p>
            </div>
          </div>

          {/* Linha 3 - Papel */}
          <div>
            <label className="block text-xs text-slate-400 mb-1">
              Grau de acesso <span className="text-rose-400">*</span>
            </label>
            <select
              value={form.papel}
              disabled={!canEdit || !isAdmin}
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
        </div>
      </div>

      {/* 🔐 Modal de senha para liberar edição */}
      {showPwdModal && (
        <div className="fixed inset-0 z-50">
          {/* Backdrop que bloqueia o fundo */}
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

          <div className="relative z-10 min-h-screen flex items-center justify-center p-4">
            <div className="w-full max-w-sm rounded-xl bg-slate-900 border border-white/10 p-5">
              <h2 className="text-lg font-bold text-slate-100 mb-2">Desbloquear edição</h2>
              <p className="text-sm text-slate-400 mb-4">
                Informe a senha para liberar a edição deste perfil.
              </p>

              <input
                autoFocus
                type="password"
                value={pwd}
                onChange={(e) => {
                  setPwd(e.target.value);
                  setPwdErr("");
                }}
                onKeyDown={(e) => e.key === "Enter" && checkPwdAndUnlock()}
                placeholder="Senha"
                className="w-full p-2 rounded bg-slate-800 text-white mb-2"
              />
              {pwdErr && <div className="text-rose-400 text-sm mb-2">{pwdErr}</div>}

              <div className="flex justify-end gap-2">
                <button
                  onClick={() => {
                    setShowPwdModal(false);
                    setPwd("");
                    setPwdErr("");
                  }}
                  className="px-3 py-2 rounded bg-slate-700 hover:bg-slate-600 text-white"
                >
                  Cancelar
                </button>
                <button
                  onClick={checkPwdAndUnlock}
                  className="px-3 py-2 rounded bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  Desbloquear
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
