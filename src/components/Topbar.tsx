// src/components/Topbar.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Search, X, Sun, Moon, User, Lock } from "lucide-react";
import supabase from "../lib/supabase"; // se for export nomeado, use { supabase }

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
  const [theme, setTheme] = useState<"dark" | "light">(
    (localStorage.getItem("theme") as "dark" | "light") || "dark"
  );
  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") root.classList.add("dark");
    else root.classList.remove("dark");
    localStorage.setItem("theme", theme);
  }, [theme]);

  // Nome no lugar do e-mail
  const [displayName, setDisplayName] = useState<string>("Usuário");
  const [authEmail, setAuthEmail] = useState<string>("");
  useEffect(() => {
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id ?? null;
      const email = auth.user?.email ?? "";
      setAuthEmail(email);

      if (!uid) {
        setDisplayName("Usuário");
        return;
      }
      const { data, error } = await supabase
        .from("app_users")
        .select("nome")
        .eq("id", uid)
        .maybeSingle();
      if (error) console.warn("Topbar: erro ao buscar nome:", error.message);
      const nome = data?.nome?.trim();
      setDisplayName(nome || email || "Usuário");
    })();
  }, []);

  // ====== Congelar tela (persistente) ======
  const [locked, setLocked] = useState<boolean>(() => localStorage.getItem("app:locked") === "1");
  const [unlockEmail, setUnlockEmail] = useState("");
  const [unlockPass, setUnlockPass] = useState("");
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function openLock() {
    localStorage.setItem("app:locked", "1");
    setLocked(true);
    setUnlockEmail("");
    setUnlockPass("");
    setUnlockError(null);
  }

  // bloqueia scroll + desabilita interação do app root (inert + pointer-events none)
  useEffect(() => {
    const roots = ["#root", "#app", "#__next"]
      .map(sel => document.querySelector<HTMLElement>(sel))
      .filter(Boolean) as HTMLElement[];

    const prevOverflow = document.body.style.overflow;
    const prevStyles = new Map<HTMLElement, { pe?: string; us?: string }>();

    if (locked) {
      document.body.style.overflow = "hidden";
      roots.forEach(r => {
        // salva estilos anteriores
        prevStyles.set(r, { pe: r.style.pointerEvents, us: r.style.userSelect });
        // @ts-ignore
        if ("inert" in r) (r as any).inert = true;
        r.setAttribute("aria-hidden", "true");
        r.style.pointerEvents = "none";
        r.style.userSelect = "none";
      });
    }

    return () => {
      document.body.style.overflow = prevOverflow || "";
      roots.forEach(r => {
        // @ts-ignore
        if ("inert" in r) (r as any).inert = false;
        r.removeAttribute("aria-hidden");
        const prev = prevStyles.get(r);
        r.style.pointerEvents = prev?.pe || "";
        r.style.userSelect = prev?.us || "";
      });
    };
  }, [locked]);

  // focus-trap dentro do modal
  const emailRef = useRef<HTMLInputElement>(null);
  const passRef = useRef<HTMLInputElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const focusables = useMemo(() => [emailRef, passRef, btnRef], []);

  useEffect(() => {
    if (!locked) return;
    setTimeout(() => emailRef.current?.focus(), 0);
  }, [locked]);

  function onKeyDownTrap(e: React.KeyboardEvent) {
    if (e.key !== "Tab") return;
    const nodes = focusables.map(r => r.current).filter(Boolean) as HTMLElement[];
    if (!nodes.length) return;
    const currentIndex = nodes.findIndex(n => n === document.activeElement);
    let nextIndex = currentIndex;
    if (e.shiftKey) nextIndex = currentIndex <= 0 ? nodes.length - 1 : currentIndex - 1;
    else nextIndex = currentIndex === nodes.length - 1 ? 0 : currentIndex + 1;
    e.preventDefault();
    nodes[nextIndex]?.focus();
  }

  // Desbloqueio usando MESMO login/senha do Supabase
  async function tryUnlock() {
    setSubmitting(true);
    setUnlockError(null);
    try {
      const { data: udata, error: uerr } = await supabase.auth.getUser();
      if (uerr) console.warn("Erro ao obter usuário atual:", uerr.message);

      const sessionEmail =
        udata?.user?.email?.toString().trim().toLowerCase() ??
        authEmail.toString().trim().toLowerCase();

      const inputEmail = unlockEmail.toString().trim().toLowerCase();
      const inputPass = unlockPass.toString();

      if (!inputEmail || !inputPass) {
        setUnlockError("Informe e-mail e senha.");
        setSubmitting(false);
        return;
      }
      if (inputEmail !== sessionEmail) {
        setUnlockError("E-mail não confere com o usuário logado.");
        setSubmitting(false);
        return;
      }

      const { error: signErr } = await supabase.auth.signInWithPassword({
        email: sessionEmail,
        password: inputPass,
      });

      if (signErr) {
        setUnlockError("E-mail ou senha inválidos.");
      } else {
        localStorage.removeItem("app:locked");
        setLocked(false);
        setUnlockEmail("");
        setUnlockPass("");
        setUnlockError(null);
      }
    } catch (e: any) {
      console.error(e);
      setUnlockError("Falha ao validar. Tente novamente.");
    } finally {
      setSubmitting(false);
    }
  }

  // ====== Busca (igual antes) ======
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

            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10">
              <User className="h-4 w-4 text-pink-300" />
              <span className="text-sm text-slate-200">{displayName}</span>
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
          </div>
        </div>

        {/* Card de resultado da busca */}
        {openCard && (
          <div className="absolute z-40 left-0 right-0 mx-auto max-w-7xl px-6">
            <div className="relative mt-3 rounded-xl bg-slate-900/95 border border-white/10 shadow-2xl p-4">
              <button
                onClick={() => setOpenCard(false)}
                className="absolute right-3 top-3 p-1 rounded-md hover:bg-white/10"
              >
                <X className="h-4 w-4 text-slate-300" />
              </button>

              <div className="mb-4 p-3 rounded-lg bg-slate-800 flex items-center gap-3">
                <span className="text-slate-300 font-semibold text-lg">Status:</span>
                <span className={`px-3 py-1.5 rounded-lg font-bold text-base ring-1 ${badgeStyle(statusAtual)}`}>
                  {statusAtual.toUpperCase()}
                </span>
              </div>

              <h3 className="font-semibold text-slate-200 mb-3">
                Resultado da matrícula <span className="text-emerald-300">{matriculaMostrada}</span>
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div className="p-3 rounded-lg bg-slate-800/40">
                  <h4 className="font-semibold text-rose-300 mb-1">Última ordem de corte</h4>
                  {corte ? (
                    <ul className="space-y-1 text-slate-200">
                      <li><b>Status:</b> {corte.status}</li>
                      <li><b>Bairro:</b> {corte.bairro}</li>
                      <li><b>End.:</b> {corte.rua}, nº {corte.numero}</li>
                      <li><b>Ponto ref.:</b> {corte.ponto_referencia || "-"}</li>
                      <li><b>Data:</b> {fmt(corte.created_at)}</li>
                    </ul>
                  ) : (
                    <p className="text-slate-400">Nenhum registro de corte.</p>
                  )}
                </div>

                <div className="p-3 rounded-lg bg-slate-800/40">
                  <h4 className="font-semibold text-emerald-300 mb-1">Última ordem de religação</h4>
                  {relig ? (
                    <ul className="space-y-1 text-slate-200">
                      <li><b>Status:</b> {relig.status}</li>
                      <li><b>Bairro:</b> {relig.bairro}</li>
                      <li><b>End.:</b> {relig.rua}, nº {relig.numero}</li>
                      <li><b>Ponto ref.:</b> {relig.ponto_referencia || "-"}</li>
                      <li><b>Data:</b> {fmt(relig.created_at)}</li>
                    </ul>
                  ) : (
                    <p className="text-slate-400">Nenhum registro de religação.</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* OVERLAY/MODAL — quando locked=true, via PORTAL no body */}
      {locked &&
        createPortal(
          <div
            className="fixed inset-0 z-[2147483647]"
            onKeyDown={onKeyDownTrap}
            aria-modal="true"
            role="dialog"
          >
            {/* Backdrop intercepta todo pointer/scroll atrás */}
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
                  Para voltar a usar, confirme seu e-mail e senha do login.
                </p>

                <div className="mt-5 space-y-4">
                  <div>
                    <label className="text-sm text-gray-300">E-mail</label>
                    <input
                      ref={emailRef}
                      type="email"
                      value={unlockEmail}
                      onChange={(e) => setUnlockEmail(e.target.value)}
                      placeholder={authEmail || "seu@email.com"}
                      autoComplete="email"
                      className="mt-1 w-full p-3 rounded-lg bg-gray-800 text-white border border-white/10 focus:outline-none focus:ring-2 focus:ring-emerald-600/50"
                    />
                  </div>
                  <div>
                    <label className="text-sm text-gray-300">Senha</label>
                    <input
                      ref={passRef}
                      type="password"
                      value={unlockPass}
                      onChange={(e) => setUnlockPass(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") tryUnlock(); }}
                      placeholder="Digite sua senha"
                      autoComplete="current-password"
                      className="mt-1 w-full p-3 rounded-lg bg-gray-800 text-white border border-white/10 focus:outline-none focus:ring-2 focus:ring-emerald-600/50"
                    />
                  </div>
                  {unlockError && <p className="text-sm text-red-300">{unlockError}</p>}
                  <button
                    ref={btnRef}
                    onClick={tryUnlock}
                    disabled={submitting}
                    className="w-full mt-2 px-5 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-medium shadow disabled:opacity-60"
                  >
                    {submitting ? "Verificando..." : "Desbloquear"}
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
