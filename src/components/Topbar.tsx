// src/components/Topbar.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Search, X, Sun, Moon, User, Lock, Eye, EyeOff, LogOut } from "lucide-react";
import supabase from "../lib/supabase";

type OrdemBase = {
  matricula: string;
  rua: string;
  bairro: string;
  numero: string;
  ponto_referencia: string | null;
  created_at: string;
  status: string;
};

function pad5(m: string) {
  const onlyDigits = m.replace(/\D/g, "").slice(0, 5);
  return onlyDigits.padStart(5, "0");
}
function fmt(iso?: string) {
  if (!iso) return "—";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleString("pt-BR");
}
function badgeStyle(status: string) {
  const s = (status || "").toLowerCase();
  if (s.includes("ativa")) return "bg-emerald-600 text-white";
  if (s.includes("aguardando religação") || s.includes("aguardando_religacao")) return "bg-amber-500 text-black";
  if (s.includes("cortad")) return "bg-rose-600 text-white";
  if (s.includes("aguardando corte")) return "bg-fuchsia-500 text-white";
  return "bg-slate-500 text-white";
}
function derivarStatusAtual(corte: OrdemBase | null, relig: OrdemBase | null): string {
  const rc = relig?.status?.toLowerCase() || "";
  const cc = corte?.status?.toLowerCase() || "";
  if (rc.includes("ativa")) return "Ativa";
  if (rc.includes("aguardando_religacao")) return "Aguardando religação";
  if (cc.includes("cortad")) return "Cortada";
  if (cc.includes("aguardando_corte")) return "Aguardando corte";
  return "—";
}

export default function Topbar() {
  // ================= Tema =================
  const [theme, setTheme] = useState<"dark" | "light">(
    (localStorage.getItem("theme") as "dark" | "light") || "dark"
  );
  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") root.classList.add("dark");
    else root.classList.remove("dark");
    localStorage.setItem("theme", theme);
  }, [theme]);

  // ============ Usuário logado (nome + email) ============
  const [authEmail, setAuthEmail] = useState<string>("");
  const [displayName, setDisplayName] = useState<string>("");
  const [isAuthed, setIsAuthed] = useState(false);

  useEffect(() => {
    let unsub: { subscription: { unsubscribe: () => void } } | null = null;

    (async () => {
      const { data } = await supabase.auth.getUser();
      setIsAuthed(!!data.user);
      const email = data.user?.email ?? "";
      const uid = data.user?.id ?? null;
      setAuthEmail(email);

      // nome vindo da aba de usuários (tabela app_users). Fallback: email.
      if (uid) {
        const { data: row } = await supabase
          .from("app_users")
          .select("nome")
          .eq("id", uid)
          .maybeSingle();
        const nome = row?.nome?.trim();
        setDisplayName(nome || email || "—");
      } else {
        setDisplayName(email || "—");
      }
    })();

    const sub = supabase.auth.onAuthStateChange((_e, session) => {
      setIsAuthed(!!session?.user);
      const email = session?.user?.email ?? "";
      setAuthEmail(email);
      // tenta pegar nome do meta primeiro
      const metaNome =
        (session?.user?.user_metadata?.nome ||
          session?.user?.user_metadata?.full_name ||
          session?.user?.user_metadata?.name ||
          "")?.toString()
          .trim();
      if (metaNome) setDisplayName(metaNome);
      else if (email) setDisplayName(email);
    });
    unsub = sub.data as any;

    return () => unsub?.subscription.unsubscribe();
  }, []);

  // ================= Congelar Tela =================
  const readLSLocked = () => localStorage.getItem("app:locked") === "1";
  const [locked, setLocked] = useState<boolean>(() => isAuthed && readLSLocked());
  const [lockNonce, setLockNonce] = useState(0); // força remontar o portal
  const [unlockPass, setUnlockPass] = useState("");
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showUnlockPass, setShowUnlockPass] = useState(false);

  // sincroniza estado com localStorage + entre abas
  useEffect(() => {
    const sync = () => setLocked(isAuthed && readLSLocked());
    const onStorage = (e: StorageEvent) => {
      if (e.key === "app:locked") sync();
    };
    const id = window.setInterval(sync, 300); // pequeno poll pra garantir
    window.addEventListener("storage", onStorage);
    sync();
    return () => {
      window.clearInterval(id);
      window.removeEventListener("storage", onStorage);
    };
  }, [isAuthed]);

  function openLock() {
    if (!isAuthed) return; // nunca abre lock sem usuário
    localStorage.setItem("app:locked", "1");
    setUnlockPass("");
    setUnlockError(null);
    setShowUnlockPass(false);
    setLocked(true);
    setLockNonce((n) => n + 1); // garante que o portal atualiza e aparece
    // impedir scroll
    document.body.style.overflow = "hidden";
  }

  // bloqueio de scroll somente
  useEffect(() => {
    const prev = document.body.style.overflow;
    if (locked) document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev || "";
    };
  }, [locked]);

  // refs p/ foco
  const emailRef = useRef<HTMLInputElement>(null);
  const passRef = useRef<HTMLInputElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const focusables = useMemo(() => [emailRef, passRef, btnRef], []);

  useEffect(() => {
    if (!locked) return;
    setTimeout(() => passRef.current?.focus(), 0); // e-mail é disabled
  }, [locked, lockNonce]);

  function onKeyDownTrap(e: React.KeyboardEvent) {
    if (e.key !== "Tab") return;
    const nodes = focusables.map((r) => r.current).filter(Boolean) as HTMLElement[];
    if (!nodes.length) return;
    const i = nodes.findIndex((n) => n === document.activeElement);
    const next = e.shiftKey ? (i <= 0 ? nodes.length - 1 : i - 1) : (i === nodes.length - 1 ? 0 : i + 1);
    e.preventDefault();
    nodes[next]?.focus();
  }

  async function tryUnlock() {
    setSubmitting(true);
    setUnlockError(null);
    try {
      const { data } = await supabase.auth.getUser();
      const sessionEmail = (data?.user?.email ?? authEmail).toString().trim().toLowerCase();
      if (!sessionEmail) {
        setUnlockError("Sessão inválida. Faça login novamente.");
        setSubmitting(false);
        return;
      }
      if (!unlockPass) {
        setUnlockError("Informe a senha.");
        setSubmitting(false);
        return;
      }
      const { error } = await supabase.auth.signInWithPassword({
        email: sessionEmail,
        password: unlockPass,
      });
      if (error) {
        setUnlockError("Senha inválida.");
      } else {
        localStorage.removeItem("app:locked");
        setLocked(false);
        setUnlockPass("");
        setShowUnlockPass(false);
      }
    } catch (e) {
      setUnlockError("Falha ao validar. Tente novamente.");
    } finally {
      setSubmitting(false);
      // sempre restaura o scroll
      document.body.style.overflow = "";
    }
  }

  // ================= Busca (inalterado) =================
  const [searchMatricula, setSearchMatricula] = useState("");
  const [loading, setLoading] = useState(false);
  const [openCard, setOpenCard] = useState(false);
  const [corte, setCorte] = useState<OrdemBase | null>(null);
  const [relig, setRelig] = useState<OrdemBase | null>(null);
  const [statusAtual, setStatusAtual] = useState<string>("—");
  const [matriculaMostrada, setMatriculaMostrada] = useState<string>("");

  async function onSearch() {
    const m = pad5(searchMatricula);
    if (!m) return;
    setSearchMatricula(m);
    setLoading(true);
    setOpenCard(false);
    try {
      const { data: c } = await supabase
        .from("ordens_corte")
        .select("matricula,rua,bairro,numero,ponto_referencia,created_at,status")
        .eq("matricula", m)
        .order("created_at", { ascending: false })
        .limit(1);
      const corteRow = (c?.[0] as OrdemBase) || null;
      setCorte(corteRow);

      const { data: r } = await supabase
        .from("ordens_religacao")
        .select("matricula,rua,bairro,numero,ponto_referencia,created_at,status")
        .eq("matricula", m)
        .order("created_at", { ascending: false })
        .limit(1);
      const religRow = (r?.[0] as OrdemBase) || null;
      setRelig(religRow);

      setStatusAtual(derivarStatusAtual(corteRow, religRow));
      setMatriculaMostrada(m);
      setOpenCard(true);
    } finally {
      setLoading(false);
    }
  }
  function handleChangeMatricula(e: React.ChangeEvent<HTMLInputElement>) {
    const onlyDigits = e.target.value.replace(/\D/g, "").slice(0, 5);
    setSearchMatricula(onlyDigits);
  }
  function handleBlurMatricula() {
    if (!searchMatricula) return;
    setSearchMatricula(pad5(searchMatricula));
  }

  // ================= Sair (top e modal) =================
  async function onSignOut() {
    try {
      await supabase.auth.signOut();
    } finally {
      localStorage.removeItem("app:locked");
      setLocked(false);
      setUnlockPass("");
      setShowUnlockPass(false);
      document.body.style.overflow = "";
      if (typeof window !== "undefined") window.location.replace("/login");
    }
  }

  return (
    <>
      <div className="relative border-b border-white/5 bg-slate-950/60 backdrop-blur">
        <div className="mx-auto max-w-7xl px-6 py-3 flex items-center justify-between gap-4">
          {/* Busca */}
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                value={searchMatricula}
                onChange={handleChangeMatricula}
                onBlur={handleBlurMatricula}
                onKeyDown={(e) => e.key === "Enter" && onSearch()}
                placeholder="Matrícula..."
                inputMode="numeric"
                pattern="\d*"
                maxLength={5}
                className="pl-8 pr-3 py-2 rounded-lg bg-slate-900 border border-white/10 text-sm outline-none focus:ring-2 ring-emerald-400/40 text-slate-200 placeholder:text-slate-400"
              />
            </div>
            <button
              onClick={onSearch}
              disabled={loading || !searchMatricula}
              className="px-3 py-2 text-sm rounded-lg bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-400/40 hover:bg-emerald-500/30 disabled:opacity-50"
            >
              {loading ? "Buscando..." : "Buscar"}
            </button>
          </div>

          {/* Ações à direita */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              className="p-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10"
            >
              {theme === "dark" ? <Sun className="h-4 w-4 text-amber-300" /> : <Moon className="h-4 w-4 text-slate-700" />}
            </button>

            {/* Chip com NOME (fallback: email) */}
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10" title={authEmail || ""}>
              <User className="h-4 w-4 text-pink-300" />
              <span className="text-sm text-slate-200">{displayName || "—"}</span>
            </div>

            {/* Botão Congelar tela */}
            <button
              onClick={openLock}
              className="px-3 py-2 text-sm rounded-lg bg-rose-500/20 text-rose-300 ring-1 ring-rose-400/40 hover:bg-rose-500/30 flex items-center gap-2"
              title="Congelar a tela (bloquear)"
            >
              <Lock className="h-4 w-4" />
              <span>Congelar tela</span>
            </button>

            {/* Botão Sair */}
            <button
              onClick={onSignOut}
              className="px-3 py-2 text-sm rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 flex items-center gap-2 text-slate-200"
              title="Sair"
            >
              <LogOut className="h-4 w-4" />
              <span>Sair</span>
            </button>
          </div>
        </div>

        {/* Card da busca (inalterado) */}
        {/* ... (seu bloco do card de resultado permanece igual) ... */}
      </div>

      {/* MODAL do Congelar */}
      {locked && isAuthed && createPortal(
        <div
          key={lockNonce}
          className="fixed inset-0 z-[2147483647]"
          onKeyDown={onKeyDownTrap}
          aria-modal="true"
          role="dialog"
        >
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onWheel={(e) => e.preventDefault()}
            onTouchMove={(e) => e.preventDefault()}
            onMouseDown={(e) => e.preventDefault()}
            onClick={(e) => e.preventDefault()}
          />
          {/* Modal */}
          <div className="relative z-[2147483647] min-h-full flex items-center justify-center p-6">
            <div className="w-full max-w-md bg-gray-900 border border-white/10 rounded-2xl shadow-2xl p-6">
              <h3 className="text-xl font-semibold text-white">Tela congelada</h3>
              <p className="text-sm text-gray-400 mt-1">
                Confirme sua senha para desbloquear ou saia do sistema.
              </p>

              <div className="mt-5 space-y-4">
                <div>
                  <label className="text-sm text-gray-300">E-mail</label>
                  <input
                    type="email"
                    value={authEmail || ""}
                    readOnly
                    aria-readonly="true"
                    disabled
                    className="mt-1 w-full p-3 rounded-lg bg-gray-800 text-white/70 border border-white/10 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="text-sm text-gray-300">Senha</label>
                  <div className="mt-1 relative">
                    <input
                      ref={passRef}
                      type={showUnlockPass ? "text" : "password"}
                      value={unlockPass}
                      onChange={(e) => setUnlockPass(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") tryUnlock(); }}
                      placeholder="Digite sua senha"
                      autoComplete="current-password"
                      className="w-full p-3 pr-12 rounded-lg bg-gray-800 text-white border border-white/10 focus:outline-none focus:ring-2 focus:ring-emerald-600/50"
                    />
                    <button
                      type="button"
                      onClick={() => setShowUnlockPass(s => !s)}
                      className="absolute inset-y-0 right-2 my-auto h-9 px-2 rounded-md bg-white/5 hover:bg-white/10 border border-white/10 text-xs text-slate-200 flex items-center gap-1"
                      aria-label={showUnlockPass ? "Ocultar senha" : "Mostrar senha"}
                      ref={btnRef}
                    >
                      {showUnlockPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      {showUnlockPass ? "Ocultar" : "Mostrar"}
                    </button>
                  </div>
                </div>

                {unlockError && <p className="text-sm text-red-300">{unlockError}</p>}

                <div className="flex gap-3 pt-1">
                  <button
                    onClick={tryUnlock}
                    disabled={submitting}
                    className="flex-1 px-5 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-medium shadow disabled:opacity-60"
                  >
                    {submitting ? "Verificando..." : "Desbloquear"}
                  </button>
                  <button
                    type="button"
                    onClick={onSignOut}
                    className="px-4 py-2.5 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 text-slate-200 flex items-center gap-2"
                    title="Sair do sistema"
                  >
                    <LogOut className="h-4 w-4" />
                    <span>Sair</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
