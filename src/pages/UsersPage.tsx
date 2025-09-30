// src/pages/UsersPage.tsx
import React, { useEffect, useMemo, useState } from "react";
// Compatível com default export OU export nomeado no seu supabase client:
import supabaseDefault from "../lib/supabase";

// ---- Tipagem leve para evitar TS 2532 em métodos de auth/from/rpc
type SupabaseLike = {
  auth: {
    getUser: () => Promise<{ data: { user?: any } | null; error: any }>;
    signInWithPassword: (args: { email: string; password: string }) => Promise<{ data: any; error: any }>;
    updateUser: (args: { password?: string }) => Promise<{ data: any; error: any }>;
    getSession?: () => Promise<{ data: { session?: any } | null; error: any }>;
  };
  from: (table: string) => any;
  rpc: (fn: string, args?: any) => Promise<{ data: any; error: any }>;
  functions?: {
    invoke: (
      name: string,
      opts?: { body?: any; headers?: Record<string, string> }
    ) => Promise<{ data: any; error: any }>;
  };
};

// Funciona se ../lib/supabase exportar default ou { supabase }
const supabase: SupabaseLike =
  (supabaseDefault as any)?.from
    ? (supabaseDefault as any)
    : (supabaseDefault as any)?.supabase;

// =================== Tipos ===================
type Papel = "ADM" | "DIRETOR" | "COORDENADOR" | "OPERADOR" | "TERCEIRIZADA" | "VISITANTE";

type FormData = {
  email: string;
  nome: string;
  setor: string;
  telefone: string;
  papel: Papel;
};

type AppUserRow = {
  id: string;
  email: string;
  nome: string;
  setor: string | null;
  telefone?: string | null;
  papel?: string | null;
  created_at?: string | null;
};

// =================== Constantes ===================
const PAPEIS: { value: Papel; label: string }[] = [
  { value: "ADM",          label: "Administrador" },
  { value: "DIRETOR",      label: "Diretor" },
  { value: "COORDENADOR",  label: "Coordenador" },
  { value: "OPERADOR",     label: "Operador" },
  { value: "TERCEIRIZADA", label: "Terceirizada" },
  { value: "VISITANTE",    label: "Visitante" },
];

const SETORES_CANON: string[] = [
  "ADM",
  "Direção",
  "Faturamento",
  "Teleatendimento",
  "Setor Técnico",
  "Atendimento",
  "Protocolo",
];

const EDIT_PASSCODE = "29101993"; // usada internamente, sem aparecer em placeholder
const PWD_MIN = 6;

// =================== Helpers ===================
const toAsciiUpper = (s: string) =>
  (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim();

function normalizeSetorForDB(s: string) {
  const t = toAsciiUpper(s);
  if (t.startsWith("ADM")) return "ADM";
  if (t.startsWith("DIREC")) return "Direção";
  if (t.startsWith("FATUR")) return "Faturamento";
  if (t.includes("TELE")) return "Teleatendimento";
  if (t.includes("TECN")) return "Setor Técnico";
  if (t.startsWith("ATEND")) return "Atendimento";
  if (t.startsWith("PROTOC")) return "Protocolo";
  return "ADM";
}
function normalizePapel(p: string | null | undefined): Papel {
  const v = toAsciiUpper(p || "");
  if (["ADM","DIRETOR","COORDENADOR","OPERADOR","TERCEIRIZADA","VISITANTE"].includes(v))
    return v as Papel;
  return "VISITANTE";
}
const fmt = (iso?: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "—" : d.toLocaleString("pt-BR");
};
const isEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());

// Avatar com iniciais
function colorFromString(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  const hue = h % 360;
  return `hsl(${hue} 70% 45%)`;
}
function initialsFromName(nameOrEmail: string) {
  const base = `${nameOrEmail ?? ""}`.trim();
  if (!base) return "?";
  const atIndex = base.indexOf("@");
  const left = atIndex >= 0 ? base.slice(0, atIndex) : base;
  const parts = left.replace(/[._-]+/g, " ").trim().split(/\s+/);
  const letters = parts.filter(Boolean).slice(0, 2).map((p) => p.charAt(0).toUpperCase());
  return letters.join("") || base.charAt(0).toUpperCase() || "?";
}
const Avatar: React.FC<{ text: string; size?: number; className?: string }> = ({ text, size = 40, className }) => {
  const initials = initialsFromName(text);
  const bg = colorFromString(text);
  return (
    <div
      className={`rounded-full grid place-items-center text-white font-semibold ${className || ""}`}
      style={{ width: size, height: size, background: bg }}
      aria-hidden
    >
      {initials}
    </div>
  );
};

// =================== Componente ===================
export default function UsersPage() {
  // sessão/perm.
  const [userId, setUserId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState<boolean>(false);

  // form do próprio usuário
  const [form, setForm] = useState<FormData>({
    email: "",
    nome: "",
    setor: "ADM",
    telefone: "",
    papel: "VISITANTE",
  });
  const [createdAt, setCreatedAt] = useState<string | null>(null);
  const [lastSignInAt, setLastSignInAt] = useState<string | null>(null);

  // selo visual (não persiste) quando setor = Atendimento
  const [isTeleAtendimento, setIsTeleAtendimento] = useState<boolean>(false);

  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // bloquear edição por senha
  const [canEdit, setCanEdit] = useState<boolean>(false);
  const [showPwdModal, setShowPwdModal] = useState<boolean>(false);
  const [pwd, setPwd] = useState<string>("");
  const [pwdErr, setPwdErr] = useState<string>("");

  // troca da própria senha
  const [showSelfPwdModal, setShowSelfPwdModal] = useState(false);
  const [selfCurPwd, setSelfCurPwd] = useState("");
  const [selfNewPwd, setSelfNewPwd] = useState("");
  const [selfNewPwd2, setSelfNewPwd2] = useState("");
  const [selfPwdErr, setSelfPwdErr] = useState<string | null>(null);
  const [selfPwdSaving, setSelfPwdSaving] = useState(false);
  const [showCur, setShowCur] = useState(false);
  const [showNew1, setShowNew1] = useState(false);
  const [showNew2, setShowNew2] = useState(false);

  // lista de usuários (ADM)
  const [users, setUsers] = useState<AppUserRow[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [q, setQ] = useState("");
  const [qDebounced, setQDebounced] = useState("");

  // modal ADM (editar outro usuário)
  const [showEditModal, setShowEditModal] = useState(false);
  const [editUser, setEditUser] = useState<AppUserRow | null>(null);

  const [newPwd, setNewPwd] = useState("");
  const [newPwd2, setNewPwd2] = useState("");
  const [showAdmPwd1, setShowAdmPwd1] = useState(false);
  const [showAdmPwd2, setShowAdmPwd2] = useState(false);
  const [adminPasscode, setAdminPasscode] = useState("");
  const [changingPwd, setChangingPwd] = useState(false);
  const [modalMsg, setModalMsg] = useState<string | null>(null);
  const [modalErr, setModalErr] = useState<string | null>(null);

  // modal ADM (criar novo usuário)
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [cuEmail, setCuEmail] = useState("");
  const [cuNome, setCuNome] = useState("");
  const [cuSetor, setCuSetor] = useState("ADM");
  const [cuTelefone, setCuTelefone] = useState("");
  const [cuPapel, setCuPapel] = useState<Papel>("VISITANTE");
  const [cuPwd1, setCuPwd1] = useState("");
  const [cuPwd2, setCuPwd2] = useState("");
  const [cuShow1, setCuShow1] = useState(false);
  const [cuShow2, setCuShow2] = useState(false);
  const [cuSaving, setCuSaving] = useState(false);
  const [cuErr, setCuErr] = useState<string | null>(null);
  const [cuMsg, setCuMsg] = useState<string | null>(null);

  // --- Debounce da busca
  useEffect(() => {
    const t = setTimeout(() => setQDebounced(q.trim().toLowerCase()), 250);
    return () => clearTimeout(t);
  }, [q]);

  const filteredUsers = useMemo(() => {
    if (!qDebounced) return users;
    return users.filter(u =>
      (u.email || "").toLowerCase().includes(qDebounced) ||
      (u.nome  || "").toLowerCase().includes(qDebounced) ||
      (u.setor || "").toLowerCase().includes(qDebounced)
    );
  }, [qDebounced, users]);

  // -------------------------- Carregar perfil --------------------------
  async function loadProfile() {
    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await supabase.auth.getUser();
      if (res.error) throw res.error;

      const user = (res.data && "user" in res.data ? res.data.user : undefined) as any | undefined;
      if (!user) throw new Error("Sessão inválida. Faça login novamente.");

      const uid: string = user.id as string;
      const emailFromAuth: string = (user.email ?? "") as string;
      setLastSignInAt((user.last_sign_in_at ?? null) as string | null);

      // is_admin rpc (se não existir, false)
      try {
        const { data: isAdm } = await supabase.rpc("is_admin");
        setIsAdmin(Boolean(isAdm));
      } catch {
        setIsAdmin(false);
      }

      // 1) tenta por id
      const byIdRes = await supabase
        .from("app_users")
        .select("id,email,nome,setor,telefone,papel,created_at")
        .eq("id", uid)
        .maybeSingle();
      const byId = (byIdRes?.data ?? null) as AppUserRow | null;
      const byIdErr = (byIdRes as any)?.error ?? null;
      if (byIdErr) throw byIdErr;

      if (byId) {
        setUserId(byId.id);
        setForm({
          email: byId.email || emailFromAuth,
          nome: byId.nome || "Sem Nome",
          setor: byId.setor || "ADM",
          telefone: byId.telefone || "",
          papel: normalizePapel(byId.papel),
        });
        setCreatedAt(byId.created_at || null);
      } else {
        // 2) por e-mail
        const byEmailRes = await supabase
          .from("app_users")
          .select("id,email,nome,setor,telefone,papel,created_at")
          .eq("email", emailFromAuth)
          .maybeSingle();
        const byEmail = (byEmailRes?.data ?? null) as AppUserRow | null;
        const byEmailErr = (byEmailRes as any)?.error ?? null;
        if (byEmailErr) throw byEmailErr;

        if (byEmail) {
          // tenta migrar id
          const moveRes = await supabase
            .from("app_users")
            .update({ id: uid })
            .eq("id", byEmail.id);
          const moveErr = (moveRes as any)?.error ?? null;
          const idToUse = moveErr ? byEmail.id : uid;

          setUserId(idToUse);
          setForm({
            email: byEmail.email || emailFromAuth,
            nome: byEmail.nome || "Sem Nome",
            setor: byEmail.setor || "ADM",
            telefone: byEmail.telefone || "",
            papel: normalizePapel(byEmail.papel),
          });
          setCreatedAt(byEmail.created_at || null);
        } else {
          // 3) cria
          const upRes = await supabase
            .from("app_users")
            .upsert(
              { id: uid, email: emailFromAuth, nome: "Sem Nome", setor: "ADM", papel: "VISITANTE" },
              { onConflict: "email" }
            )
            .select()
            .single();

          const created = (upRes?.data ?? null) as AppUserRow | null;
          const upErr = (upRes as any)?.error ?? null;
          if (upErr) throw upErr;
          if (!created) throw new Error("Falha ao criar perfil.");

          setUserId(created.id);
          setForm({
            email: created.email || emailFromAuth,
            nome: created.nome || "Sem Nome",
            setor: created.setor || "ADM",
            telefone: created.telefone || "",
            papel: normalizePapel(created.papel),
          });
          setCreatedAt(created.created_at || null);
        }
      }

      // início do modo bloqueado e limpa selo visual
      setCanEdit(false);
      setIsTeleAtendimento(false);
    } catch (e: any) {
      setErrorMsg(e.message || "Erro ao carregar perfil.");
    } finally {
      setLoading(false);
    }
  }

  // Recarrega apenas os dados do perfil atual (para Reverter/Editar)
  async function refreshCurrentProfile() {
    try {
      const res = await supabase.auth.getUser();
      if (res.error) return;

      const user = (res.data && "user" in res.data ? res.data.user : undefined) as any | undefined;
      if (!user) return;

      const uid: string = user.id as string;
      const emailFromAuth: string = (user.email ?? "") as string;

      const sel = await supabase
        .from("app_users")
        .select("id,email,nome,setor,telefone,papel,created_at")
        .eq("id", uid)
        .maybeSingle();
      const data = (sel?.data ?? null) as AppUserRow | null;
      if (data) {
        setForm({
          email: data.email || emailFromAuth,
          nome: data.nome || "Sem Nome",
          setor: data.setor || "ADM",
          telefone: data.telefone || "",
          papel: normalizePapel(data.papel),
        });
        setCreatedAt(data.created_at || null);
      }
      setIsTeleAtendimento(false);
    } catch {
      // silencioso
    }
  }

  // -------------------------- Salvar próprio perfil --------------------------
  async function handleSave() {
    if (!userId) return;

    const nome = (form.nome || "").trim();
    const setor = normalizeSetorForDB(form.setor || "");

    if (!nome) {
      setErrorMsg("Informe o nome completo.");
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
      if (isAdmin) payload.papel = normalizePapel(form.papel);

      const upd = await supabase.from("app_users").update(payload).eq("id", userId);
      const err = (upd as any)?.error ?? null;
      if (err) throw err;

      setSuccessMsg("Perfil atualizado com sucesso!");
      await loadProfile();
      setCanEdit(false);
    } catch (e: any) {
      setErrorMsg(e.message || "Erro ao salvar perfil.");
    } finally {
      setSaving(false);
    }
  }

  // -------------------------- Bloquear / desbloquear (perfil) --------------------------
  async function onClickEditar() {
    await refreshCurrentProfile();
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
    refreshCurrentProfile();
  }

  // -------------------------- Trocar a própria senha --------------------------
  function openSelfPwdModal() {
    setSelfCurPwd("");
    setSelfNewPwd("");
    setSelfNewPwd2("");
    setSelfPwdErr(null);
    setShowSelfPwdModal(true);
  }
  async function handleSelfChangePassword() {
    setSelfPwdErr(null);

    if (!selfCurPwd) { setSelfPwdErr("Informe a senha atual."); return; }
    if (!selfNewPwd || selfNewPwd.length < PWD_MIN) {
      setSelfPwdErr(`Nova senha precisa ter pelo menos ${PWD_MIN} caracteres.`);
      return;
    }
    if (selfNewPwd !== selfNewPwd2) {
      setSelfPwdErr("A confirmação não confere.");
      return;
    }

    setSelfPwdSaving(true);
    try {
      const email = (form.email || "").trim();
      const re = await supabase.auth.signInWithPassword({ email, password: selfCurPwd });
      if (re.error) { setSelfPwdErr("Senha atual incorreta."); return; }

      const up = await supabase.auth.updateUser({ password: selfNewPwd });
      if ((up as any)?.error) { setSelfPwdErr((up as any).error?.message || "Falha ao alterar a senha."); return; }

      setShowSelfPwdModal(false);
      setSelfCurPwd(""); setSelfNewPwd(""); setSelfNewPwd2("");
      setSuccessMsg("Senha alterada com sucesso! Use a nova senha no próximo login.");
    } catch (e: any) {
      setSelfPwdErr(e.message || "Erro inesperado ao alterar a senha.");
    } finally {
      setSelfPwdSaving(false);
    }
  }

  // -------------------------- Lista ADM --------------------------
  async function loadUsers() {
    if (!isAdmin) return;
    setUsersLoading(true);
    try {
      const sel = await supabase
        .from("app_users")
        .select("id,email,nome,setor,telefone,papel,created_at")
        .order("nome", { ascending: true, nullsFirst: true });
      const err = (sel as any)?.error ?? null;
      if (err) throw err;
      setUsers((sel?.data || []) as AppUserRow[]);
    } catch {
      // noop
    } finally {
      setUsersLoading(false);
    }
  }

  function openEditUser(u: AppUserRow) {
    setEditUser({
      id: u.id,
      email: u.email,
      nome: u.nome || "Sem Nome",
      setor: u.setor || "ADM",
      telefone: u.telefone || "",
      papel: normalizePapel(u.papel as any),
      created_at: u.created_at || null,
    });
    setNewPwd("");
    setNewPwd2("");
    setAdminPasscode("");
    setModalMsg(null);
    setModalErr(null);
    setShowEditModal(true);
  }

  async function saveEditUser() {
    if (!editUser) return;
    setModalErr(null);
    setModalMsg(null);

    try {
      const payload: any = {
        nome: (editUser.nome || "").trim() || "Sem Nome",
        setor: normalizeSetorForDB(editUser.setor || ""),
        telefone: editUser.telefone || null,
        papel: normalizePapel(editUser.papel as any),
      };
      const upd = await supabase.from("app_users").update(payload).eq("id", editUser.id);
      const err = (upd as any)?.error ?? null;
      if (err) throw err;

      setModalMsg("Dados salvos!");
      await loadUsers();
    } catch (e: any) {
      setModalErr(e.message || "Erro ao salvar.");
    }
  }

  // ✅ Agora usando Supabase Functions (envia o Bearer automaticamente)
  async function changePasswordForUser() {
    if (!editUser) return;
    setModalErr(null);
    setModalMsg(null);

    if (!newPwd || newPwd.length < PWD_MIN) { setModalErr(`A nova senha deve ter pelo menos ${PWD_MIN} caracteres.`); return; }
    if (newPwd !== newPwd2) { setModalErr("As senhas não conferem."); return; }
    if (adminPasscode !== EDIT_PASSCODE) { setModalErr("Senha-mestre inválida."); return; }

    setChangingPwd(true);
    try {
      const { error: fnErr } = await (supabase as any).functions.invoke?.("admin-reset-password", {
        body: { user_id: editUser.id, new_password: newPwd },
      }) ?? { error: { message: "Supabase Functions não disponível." } };

      if (fnErr) throw new Error(fnErr.message || "Falha na alteração da senha.");

      setModalMsg("Senha alterada com sucesso!");
      setNewPwd(""); setNewPwd2(""); setAdminPasscode("");
    } catch (e: any) {
      setModalErr(e.message || "Erro ao alterar senha.");
    } finally {
      setChangingPwd(false);
    }
  }

  // -------------------------- Criar novo usuário (ADM) --------------------------
  function openCreateModal() {
    setCuEmail("");
    setCuNome("");
    setCuSetor("ADM");
    setCuTelefone("");
    setCuPapel("VISITANTE");
    setCuPwd1("");
    setCuPwd2("");
    setCuShow1(false);
    setCuShow2(false);
    setCuErr(null);
    setCuMsg(null);
    setShowCreateModal(true);
  }

  async function handleCreateUser() {
    setCuErr(null);
    setCuMsg(null);

    const email = cuEmail.trim().toLowerCase();
    if (!isEmail(email)) { setCuErr("Informe um e-mail válido."); return; }
    if (!cuPwd1 || cuPwd1.length < PWD_MIN) { setCuErr(`Senha deve ter pelo menos ${PWD_MIN} caracteres.`); return; }
    if (cuPwd1 !== cuPwd2) { setCuErr("A confirmação de senha não confere."); return; }

    setCuSaving(true);
    try {
      const { error: fnErr } = await (supabase as any).functions.invoke?.("admin-create-user", {
        body: {
          email,
          password: cuPwd1,
          nome: (cuNome || "").trim() || "Sem Nome",
          setor: normalizeSetorForDB(cuSetor || "ADM"),
          telefone: (cuTelefone || "").trim() || null,
          papel: cuPapel,
        },
      }) ?? { error: { message: "Supabase Functions não disponível." } };

      if (fnErr) throw new Error(fnErr.message || "Falha ao criar usuário.");

      setCuMsg("Usuário criado com sucesso!");
      await loadUsers();
      // limpa campos para próxima criação
      setCuEmail(""); setCuNome(""); setCuTelefone(""); setCuPapel("VISITANTE"); setCuPwd1(""); setCuPwd2("");
    } catch (e: any) {
      setCuErr(e.message || "Erro ao criar usuário.");
    } finally {
      setCuSaving(false);
    }
  }

  // -------------------------- Efeitos --------------------------
  useEffect(() => { loadProfile(); }, []);
  useEffect(() => { if (isAdmin) loadUsers(); }, [isAdmin]);

  // atalhos: Ctrl+S salva, Alt+E desbloqueio, Esc bloqueia (sem interferir nos inputs)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName ?? "";
      const inField = /INPUT|TEXTAREA|SELECT/.test(tag);

      if (e.ctrlKey && e.key.toLowerCase() === "s") { if (canEdit) { e.preventDefault(); handleSave(); } return; }
      if (!canEdit && (e.altKey && e.key.toLowerCase() === "e") && !inField) { e.preventDefault(); onClickEditar(); return; }
      if (canEdit && e.key === "Escape") { e.preventDefault(); relock(); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [canEdit]);

  // -------------------------- UI --------------------------
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

  const titulo = form.nome || "Meu Perfil";
  const subtituloInfo = `Criado em ${fmt(createdAt)} • Último acesso ${fmt(lastSignInAt)}`;

  return (
    <div className="max-w-5xl mx-auto">
      {/* Cabeçalho com avatar e datas */}
      <div className="flex items-center gap-3 mb-6">
        <Avatar text={titulo || form.email} size={44} />
        <div className="flex-1">
          <h1 className="text-3xl font-bold">{titulo}</h1>
          <p className="text-xs text-slate-400">{subtituloInfo}</p>
        </div>

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

        {!canEdit ? (
          <div className="flex gap-2">
            <button
              onClick={onClickEditar}
              className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              Editar
            </button>
            <button
              onClick={openSelfPwdModal}
              className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-100"
              title="Trocar minha senha"
            >
              Trocar senha
            </button>
          </div>
        ) : (
          <div className="flex gap-2">
            <button
              onClick={refreshCurrentProfile}
              className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-100"
              title="Reverter para o último salvo"
            >
              Reverter
            </button>
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
            <button
              onClick={openSelfPwdModal}
              className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-100"
              title="Trocar minha senha"
            >
              Trocar senha
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

      {/* Card do perfil */}
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
            <div>
              <label className="block text-xs text-slate-400 mb-1">E-mail</label>
              <div className="flex items-center gap-3">
                <Avatar text={form.email || form.nome} size={36} />
                <input
                  type="email"
                  value={form.email}
                  disabled
                  className="flex-1 p-2 rounded-lg bg-slate-800 text-slate-300 border border-white/10 disabled:opacity-60"
                />
              </div>
              <p className="text-[11px] text-slate-500 mt-1">E-mail usado para entrar no sistema.</p>
            </div>

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
            </div>
          </div>

          {/* Linha 2 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <div className="flex items-center justify-between">
                <label className="block text-xs text-slate-400 mb-1">
                  Setor de trabalho <span className="text-rose-400">*</span>
                </label>
                {form.setor === "Atendimento" && isTeleAtendimento && (
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-indigo-600/20 text-indigo-200 ring-1 ring-indigo-400/30">
                    Teleatendimento
                  </span>
                )}
              </div>

              <div className="flex items-center gap-3">
                <select
                  value={form.setor}
                  onChange={(e) => {
                    const v = e.target.value;
                    setForm((f) => ({ ...f, setor: v }));
                    if (v !== "Atendimento") setIsTeleAtendimento(false);
                  }}
                  disabled={!canEdit}
                  className="flex-1 p-2 rounded-lg bg-slate-800 text-slate-200 border border-white/10 outline-none focus:ring-2 ring-indigo-400/40 disabled:opacity-60"
                >
                  {SETORES_CANON.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
            </div>

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
            </div>
          </div>

          {/* Linha 3 */}
          <div>
            <label className="block text-xs text-slate-400 mb-1">
              Grau de acesso <span className="text-rose-400">*</span>
            </label>
            <select
              value={form.papel}
              disabled={!canEdit || !isAdmin}
              onChange={(e) => setForm((f) => ({ ...f, papel: normalizePapel(e.target.value) }))}
              className="w-full p-2 rounded-lg bg-slate-800 text-slate-200 border border-white/10 outline-none focus:ring-2 ring-indigo-400/40 disabled:opacity-60"
              title={!isAdmin ? "Apenas administradores podem alterar o grau de acesso" : ""}
            >
              {PAPEIS.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Lista ADM */}
      {isAdmin && (
        <div className="mt-10">
          <div className="flex items-center justify-between mb-3 gap-2">
            <h2 className="text-lg font-semibold text-slate-200">Usuários do sistema</h2>
            <div className="flex items-center gap-2">
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Filtro"
                className="px-3 py-2 rounded-lg bg-slate-900 border border-white/10 text-sm text-slate-200 placeholder:text-slate-400"
              />
              <button
                onClick={openCreateModal}
                className="px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white"
                title="Criar novo usuário"
              >
                Novo usuário
              </button>
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl ring-1 ring-white/10">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-800/60 text-slate-300">
                <tr>
                  <th className="text-left px-4 py-2 font-semibold">Usuário</th>
                  <th className="text-left px-4 py-2 font-semibold">Nome</th>
                  <th className="text-left px-4 py-2 font-semibold">Setor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {usersLoading ? (
                  <tr><td colSpan={3} className="px-4 py-6 text-slate-400">Carregando…</td></tr>
                ) : filteredUsers.length === 0 ? (
                  <tr><td colSpan={3} className="px-4 py-6 text-slate-400">Nenhum usuário encontrado.</td></tr>
                ) : (
                  filteredUsers.map((u) => (
                    <tr
                      key={u.id}
                      onDoubleClick={() => openEditUser(u)}
                      onKeyDown={(e) => { if (e.key === "Enter") openEditUser(u); }}
                      tabIndex={0}
                      className="hover:bg-white/5 cursor-default outline-none focus:bg-white/10"
                      title="Duplo clique (ou Enter) para editar"
                    >
                      <td className="px-4 py-2 text-slate-200">
                        <div className="flex items-center gap-2">
                          <Avatar text={u.email || u.nome} size={26} />
                          <span>{u.email}</span>
                        </div>
                      </td>
                      <td className="px-4 py-2 text-slate-200">{u.nome || "Sem Nome"}</td>
                      <td className="px-4 py-2 text-slate-400">{u.setor || "—"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-slate-500 mt-2">
            Dica: clique duas vezes em uma linha (ou pressione Enter) para editar o usuário.
          </p>
        </div>
      )}

      {/* Modal: senha p/ liberar edição (próprio perfil) */}
      {showPwdModal && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          <div className="relative z-10 min-h-screen flex items-center justify-center p-4">
            <div className="w-full max-w-sm rounded-xl bg-slate-900 border border-white/10 p-5">
              <h2 className="text-lg font-bold text-slate-100 mb-2">Desbloquear edição</h2>
              <p className="text-sm text-slate-400 mb-4">Informe a senha para liberar a edição deste perfil.</p>
              <div className="flex gap-2">
                <input
                  autoFocus
                  type="password"
                  value={pwd}
                  onChange={(e) => { setPwd(e.target.value); setPwdErr(""); }}
                  onKeyDown={(e) => e.key === "Enter" && checkPwdAndUnlock()}
                  placeholder="Senha"
                  className="w-full p-2 rounded bg-slate-800 text-white mb-2 border border-white/10"
                />
              </div>
              {pwdErr && <div className="text-rose-400 text-sm mb-2">{pwdErr}</div>}
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => { setShowPwdModal(false); setPwd(""); setPwdErr(""); }}
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

      {/* Modal: trocar a própria senha */}
      {showSelfPwdModal && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          <div className="relative z-10 min-h-screen flex items-center justify-center p-4">
            <div className="w-full max-w-md rounded-xl bg-slate-900 border border-white/10 p-5">
              <h2 className="text-lg font-bold text-slate-100 mb-2">Trocar minha senha</h2>
              <p className="text-sm text-slate-400 mb-4">Confirme sua senha atual e defina uma nova.</p>

              <label className="block text-xs text-slate-400 mb-1">Senha atual</label>
              <div className="flex gap-2 mb-3">
                <input
                  type={showCur ? "text" : "password"}
                  value={selfCurPwd}
                  onChange={(e) => setSelfCurPwd(e.target.value)}
                  className="w-full p-2 rounded bg-slate-800 text-white border border-white/10"
                  autoFocus
                />
                <button
                  onClick={() => setShowCur((v) => !v)}
                  className="px-3 rounded bg-slate-700 hover:bg-slate-600 text-white text-xs"
                >
                  {showCur ? "Ocultar" : "Mostrar"}
                </button>
              </div>

              <label className="block text-xs text-slate-400 mb-1">Nova senha</label>
              <div className="flex gap-2 mb-3">
                <input
                  type={showNew1 ? "text" : "password"}
                  value={selfNewPwd}
                  onChange={(e) => setSelfNewPwd(e.target.value)}
                  className="w-full p-2 rounded bg-slate-800 text-white border border-white/10"
                  placeholder={`Mínimo ${PWD_MIN} caracteres`}
                />
                <button
                  onClick={() => setShowNew1((v) => !v)}
                  className="px-3 rounded bg-slate-700 hover:bg-slate-600 text-white text-xs"
                >
                  {showNew1 ? "Ocultar" : "Mostrar"}
                </button>
              </div>

              <label className="block text-xs text-slate-400 mb-1">Confirmar nova senha</label>
              <div className="flex gap-2 mb-3">
                <input
                  type={showNew2 ? "text" : "password"}
                  value={selfNewPwd2}
                  onChange={(e) => setSelfNewPwd2(e.target.value)}
                  className="w-full p-2 rounded bg-slate-800 text-white border border-white/10"
                />
                <button
                  onClick={() => setShowNew2((v) => !v)}
                  className="px-3 rounded bg-slate-700 hover:bg-slate-600 text-white text-xs"
                >
                  {showNew2 ? "Ocultar" : "Mostrar"}
                </button>
              </div>

              {selfPwdErr && (
                <div className="mb-3 rounded bg-rose-600/15 text-rose-200 ring-1 ring-rose-400/30 px-3 py-2">
                  {selfPwdErr}
                </div>
              )}

              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setShowSelfPwdModal(false)}
                  className="px-3 py-2 rounded bg-slate-700 hover:bg-slate-600 text-white"
                  disabled={selfPwdSaving}
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSelfChangePassword}
                  className="px-3 py-2 rounded bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-60"
                  disabled={selfPwdSaving}
                >
                  {selfPwdSaving ? "Alterando…" : "Alterar senha"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal ADM: editar usuário + alterar senha */}
      {showEditModal && editUser && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          <div className="relative z-10 min-h-screen flex items-center justify-center p-4">
            <div className="w-full max-w-2xl rounded-xl bg-slate-900 border border-white/10 p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <Avatar text={editUser.nome || editUser.email} size={40} />
                  <div>
                    <h3 className="text-lg font-semibold text-slate-100">Editar usuário</h3>
                    <p className="text-xs text-slate-400">
                      Criado em {fmt(editUser.created_at)}
                    </p>
                  </div>
                </div>
                <button
                  className="px-3 py-1.5 rounded bg-slate-700 hover:bg-slate-600 text-slate-100"
                  onClick={() => setShowEditModal(false)}
                >
                  Fechar
                </button>
              </div>

              {modalErr && <div className="mb-3 rounded bg-rose-600/15 text-rose-200 ring-1 ring-rose-400/30 px-3 py-2">{modalErr}</div>}
              {modalMsg && <div className="mb-3 rounded bg-emerald-600/15 text-emerald-200 ring-1 ring-emerald-400/30 px-3 py-2">{modalMsg}</div>}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">E-mail</label>
                  <div className="flex items-center gap-2">
                    <Avatar text={editUser.email || editUser.nome || ""} size={28} />
                    <input
                      type="email"
                      value={editUser.email}
                      disabled
                      className="flex-1 p-2 rounded-lg bg-slate-800 text-slate-300 border border-white/10 disabled:opacity-60"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Nome completo</label>
                  <input
                    type="text"
                    value={editUser.nome || ""}
                    onChange={(e) =>
                      setEditUser(prev => prev ? { ...prev, nome: e.target.value } : prev)
                    }
                    className="w-full p-2 rounded-lg bg-slate-800 text-slate-200 border border-white/10"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between">
                    <label className="block text-xs text-slate-400 mb-1">Setor</label>
                  </div>
                  <select
                    value={editUser.setor || "ADM"}
                    onChange={(e) =>
                      setEditUser(prev => prev ? { ...prev, setor: e.target.value } : prev)
                    }
                    className="w-full p-2 rounded-lg bg-slate-800 text-slate-200 border border-white/10"
                  >
                    {SETORES_CANON.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs text-slate-400 mb-1">Telefone</label>
                  <input
                    type="tel"
                    placeholder="DDD + número"
                    value={editUser.telefone || ""}
                    onChange={(e) =>
                      setEditUser(prev => prev ? { ...prev, telefone: e.target.value } : prev)
                    }
                    className="w-full p-2 rounded-lg bg-slate-800 text-slate-200 border border-white/10"
                  />
                </div>

                <div>
                  <label className="block text-xs text-slate-400 mb-1">Grau de acesso</label>
                  <select
                    value={normalizePapel(editUser.papel as any)}
                    onChange={(e) =>
                      setEditUser(prev => prev ? { ...prev, papel: normalizePapel(e.target.value) } : prev)
                    }
                    className="w-full p-2 rounded-lg bg-slate-800 text-slate-200 border border-white/10"
                  >
                    {PAPEIS.map((p) => (
                      <option key={p.value} value={p.value}>{p.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex gap-2 mt-4">
                <button
                  onClick={saveEditUser}
                  className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  Salvar dados
                </button>
              </div>

              {/* Alterar senha do usuário — SOMENTE ADMIN */}
              {isAdmin && (
                <>
                  <hr className="my-5 border-white/10" />
                  <h4 className="text-sm font-semibold text-slate-300 mb-3">Alterar senha do usuário</h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="flex gap-2">
                      <input
                        type={showAdmPwd1 ? "text" : "password"}
                        placeholder="Nova senha"
                        value={newPwd}
                        onChange={(e) => setNewPwd(e.target.value)}
                        className="w-full p-2 rounded-lg bg-slate-800 text-slate-200 border border-white/10"
                      />
                      <button
                        onClick={() => setShowAdmPwd1(v => !v)}
                        className="px-3 rounded bg-slate-700 hover:bg-slate-600 text-white text-xs"
                      >
                        {showAdmPwd1 ? "Ocultar" : "Mostrar"}
                      </button>
                    </div>
                    <div className="flex gap-2">
                      <input
                        type={showAdmPwd2 ? "text" : "password"}
                        placeholder="Confirmar senha"
                        value={newPwd2}
                        onChange={(e) => setNewPwd2(e.target.value)}
                        className="w-full p-2 rounded-lg bg-slate-800 text-slate-200 border border-white/10"
                      />
                      <button
                        onClick={() => setShowAdmPwd2(v => !v)}
                        className="px-3 rounded bg-slate-700 hover:bg-slate-600 text-white text-xs"
                      >
                        {showAdmPwd2 ? "Ocultar" : "Mostrar"}
                      </button>
                    </div>
                    <input
                      type="password"
                      placeholder="Senha-mestre"
                      value={adminPasscode}
                      onChange={(e) => setAdminPasscode(e.target.value)}
                      className="w-full p-2 rounded-lg bg-slate-800 text-slate-200 border border-white/10"
                    />
                  </div>
                  <div className="mt-3">
                    <button
                      onClick={changePasswordForUser}
                      disabled={changingPwd}
                      className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-60"
                    >
                      {changingPwd ? "Alterando…" : "Alterar senha"}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal ADM: criar novo usuário */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          <div className="relative z-10 min-h-screen flex items-center justify-center p-4">
            <div className="w-full max-w-2xl rounded-xl bg-slate-900 border border-white/10 p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <Avatar text={cuEmail || cuNome || "Novo Usuário"} size={40} />
                  <div>
                    <h3 className="text-lg font-semibold text-slate-100">Criar novo usuário</h3>
                    <p className="text-xs text-slate-400">Preencha os dados abaixo.</p>
                  </div>
                </div>
                <button
                  className="px-3 py-1.5 rounded bg-slate-700 hover:bg-slate-600 text-slate-100"
                  onClick={() => setShowCreateModal(false)}
                >
                  Fechar
                </button>
              </div>

              {cuErr && <div className="mb-3 rounded bg-rose-600/15 text-rose-200 ring-1 ring-rose-400/30 px-3 py-2">{cuErr}</div>}
              {cuMsg && <div className="mb-3 rounded bg-emerald-600/15 text-emerald-200 ring-1 ring-emerald-400/30 px-3 py-2">{cuMsg}</div>}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">E-mail</label>
                  <input
                    type="email"
                    value={cuEmail}
                    onChange={(e) => setCuEmail(e.target.value)}
                    className="w-full p-2 rounded-lg bg-slate-800 text-slate-200 border border-white/10"
                    placeholder="email@exemplo.com"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Nome completo</label>
                  <input
                    type="text"
                    value={cuNome}
                    onChange={(e) => setCuNome(e.target.value)}
                    className="w-full p-2 rounded-lg bg-slate-800 text-slate-200 border border-white/10"
                    placeholder="Ex.: João da Silva"
                  />
                </div>

                <div>
                  <label className="block text-xs text-slate-400 mb-1">Setor</label>
                  <select
                    value={cuSetor}
                    onChange={(e) => setCuSetor(e.target.value)}
                    className="w-full p-2 rounded-lg bg-slate-800 text-slate-200 border border-white/10"
                  >
                    {SETORES_CANON.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs text-slate-400 mb-1">Telefone</label>
                  <input
                    type="tel"
                    value={cuTelefone}
                    onChange={(e) => setCuTelefone(e.target.value)}
                    className="w-full p-2 rounded-lg bg-slate-800 text-slate-200 border border-white/10"
                    placeholder="DDD + número"
                  />
                </div>

                <div>
                  <label className="block text-xs text-slate-400 mb-1">Grau de acesso</label>
                  <select
                    value={cuPapel}
                    onChange={(e) => setCuPapel(normalizePapel(e.target.value))}
                    className="w-full p-2 rounded-lg bg-slate-800 text-slate-200 border border-white/10"
                  >
                    {PAPEIS.map((p) => (
                      <option key={p.value} value={p.value}>{p.label}</option>
                    ))}
                  </select>
                </div>

                <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Senha</label>
                    <div className="flex gap-2">
                      <input
                        type={cuShow1 ? "text" : "password"}
                        value={cuPwd1}
                        onChange={(e) => setCuPwd1(e.target.value)}
                        className="w-full p-2 rounded-lg bg-slate-800 text-slate-200 border border-white/10"
                        placeholder={`Mínimo ${PWD_MIN} caracteres`}
                      />
                      <button
                        onClick={() => setCuShow1(v => !v)}
                        className="px-3 rounded bg-slate-700 hover:bg-slate-600 text-white text-xs"
                      >
                        {cuShow1 ? "Ocultar" : "Mostrar"}
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Confirmar senha</label>
                    <div className="flex gap-2">
                      <input
                        type={cuShow2 ? "text" : "password"}
                        value={cuPwd2}
                        onChange={(e) => setCuPwd2(e.target.value)}
                        className="w-full p-2 rounded-lg bg-slate-800 text-slate-200 border border-white/10"
                      />
                      <button
                        onClick={() => setCuShow2(v => !v)}
                        className="px-3 rounded bg-slate-700 hover:bg-slate-600 text-white text-xs"
                      >
                        {cuShow2 ? "Ocultar" : "Mostrar"}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex gap-2 mt-5">
                <button
                  onClick={handleCreateUser}
                  disabled={cuSaving}
                  className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-60"
                >
                  {cuSaving ? "Criando…" : "Criar usuário"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
