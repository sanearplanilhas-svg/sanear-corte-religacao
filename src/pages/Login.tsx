// src/pages/Login.tsx
import React, { useState } from "react";
import { motion } from "framer-motion";
import { User, Lock, LogIn, RotateCcw, HelpCircle } from "lucide-react";
import { supabase } from "../lib/supabase";

// Imagens (coloque em src/assets/)
import logoColatina from "../assets/colatina.png";
import logoSanear from "../assets/sanear1.png";

export default function Login() {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

  const limpar = () => {
    setEmail("");
    setSenha("");
    setError("");
    setMsg("");
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setMsg("");
    if (!email || !senha) {
      setError("Preencha e-mail e senha.");
      return;
    }
    try {
      setLoading(true);
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password: senha,
      });
      if (error) throw error;
      setMsg("Login efetuado!");
    } catch (err: any) {
      setError(err.message || "Não foi possível entrar.");
    } finally {
      setLoading(false);
    }
  }

  async function handleCadastroRapido() {
    setError("");
    setMsg("");
    if (!email || !senha) {
      setError("Informe e-mail e senha para cadastrar.");
      return;
    }
    try {
      setLoading(true);
      const { error } = await supabase.auth.signUp({ email, password: senha });
      if (error) throw error;
      setMsg("Cadastro criado! Verifique seu e-mail.");
    } catch (err: any) {
      setError(err.message || "Erro no cadastro.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-black text-slate-100">
      {/* Grid principal */}
      <div className="mx-auto max-w-7xl px-4">
        <div className="grid min-h-screen grid-cols-1 gap-10 lg:grid-cols-12">
          {/* COLUNA ESQUERDA (HERO) */}
          <div className="relative hidden lg:col-span-7 lg:block">
            {/* Glows sutis */}
            <div className="pointer-events-none absolute -left-24 top-10 h-80 w-80 rounded-full bg-cyan-500/10 blur-3xl" />
            <div className="pointer-events-none absolute right-0 bottom-10 h-72 w-72 rounded-full bg-fuchsia-500/10 blur-3xl" />

            {/* Marcas d'água (mais visíveis) */}
            <img
              src={logoColatina}
              alt=""
              aria-hidden
              className="pointer-events-none absolute left-4 select-none opacity-[0.45] grayscale brightness-50 contrast-150 mix-blend-overlay"
              style={{
                top: "clamp(40px, 6vh, 80px)",
                height: "clamp(160px, 22vw, 280px)",
              }}
            />
            <img
              src={logoSanear}
              alt=""
              aria-hidden
              className="pointer-events-none absolute left-6 select-none opacity-[0.50] grayscale brightness-90 contrast-150 mix-blend-overlay"
              style={{
                top: "clamp(220px, 30vw, 360px)", // logo abaixo do brasão
                height: "clamp(90px, 14vw, 180px)",
              }}
            />

            {/* Bloco de conteúdo DESCIDO para melhor leitura */}
            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="relative z-10 max-w-2xl pt-[44vh] md:pt-[52vh] lg:pt-[58vh] xl:pt-[62vh]"
            >
              <div className="mb-6 inline-flex items-center gap-3 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-300">
                <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
                Sistema Corte & Religação • SANEAR Colatina
              </div>

              <h1 className="text-4xl font-bold leading-tight tracking-tight text-white md:text-5xl">
                Portal de <span className="text-cyan-300">Corte</span> &{" "}
                <span className="text-fuchsia-300">Religação</span>
              </h1>

              <p className="mt-4 max-w-xl text-slate-300/85">
                Operações ágeis e transparência na informação. Acesse suas tarefas e
                relatórios em tempo real.
              </p>

              <div className="mt-8 grid max-w-lg grid-cols-3 gap-4">
                <Feature k="24/7" s="Disponível" />
                <Feature k="+Rápido" s="Fluxo otimizado" />
                <Feature k="Ágil" s="Visualização rápida" />
              </div>
            </motion.div>
          </div>

          {/* COLUNA DIREITA (FORMULÁRIO) */}
          <div className="relative flex items-center justify-center lg:col-span-5">
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="relative z-10 w-full max-w-md"
            >
              <div className="group relative overflow-hidden rounded-2xl border border-white/10 bg-white/5 p-7 shadow-2xl backdrop-blur-xl">
                {/* Glow de borda no hover */}
                <div className="absolute -inset-px rounded-2xl bg-gradient-to-br from-cyan-500/20 via-fuchsia-500/20 to-emerald-500/20 opacity-0 blur transition-opacity duration-500 group-hover:opacity-100" />
                <div className="relative">
                  <div className="mb-7 text-center">
                    <div className="mx-auto mb-3 h-14 w-14 rounded-xl bg-gradient-to-br from-cyan-400 to-fuchsia-500 p-[2px]">
                      <div className="flex h-full w-full items-center justify-center rounded-xl bg-slate-900">
                        <LogIn className="h-6 w-6 text-cyan-200" />
                      </div>
                    </div>
                    <h2 className="text-xl font-semibold tracking-tight">
                      Acessar o sistema
                    </h2>
                    <p className="text-sm text-slate-400">
                      Não tem credenciais? Contate o ADM.
                    </p>
                  </div>

                  <form onSubmit={handleSubmit} className="space-y-5">
                    <div>
                      <label className="mb-1.5 block text-sm text-slate-300">
                        E-mail
                      </label>
                      <div className="flex items-center gap-2 rounded-xl bg-slate-900/60 ring-1 ring-white/10 transition focus-within:ring-cyan-400/60">
                        <span className="pl-3 text-slate-400">
                          <User className="h-5 w-5" />
                        </span>
                        <input
                          type="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="seu_nome@sanear.com"
                          className="w-full bg-transparent p-3 pr-4 text-slate-100 placeholder:text-slate-500 focus:outline-none"
                          autoComplete="email"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="mb-1.5 block text-sm text-slate-300">
                        Senha
                      </label>
                      <div className="flex items-center gap-2 rounded-xl bg-slate-900/60 ring-1 ring-white/10 transition focus-within:ring-fuchsia-400/60">
                        <span className="pl-3 text-slate-400">
                          <Lock className="h-5 w-5" />
                        </span>
                        <input
                          type={showPwd ? "text" : "password"}
                          value={senha}
                          onChange={(e) => setSenha(e.target.value)}
                          placeholder="••••••••"
                          className="w-full bg-transparent p-3 pr-12 text-slate-100 placeholder:text-slate-500 focus:outline-none"
                          autoComplete="current-password"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPwd((s) => !s)}
                          className="mr-2 rounded-lg px-2 py-1 text-xs text-slate-300 hover:bg-white/5 hover:text-white"
                          aria-label={showPwd ? "Ocultar senha" : "Mostrar senha"}
                        >
                          {showPwd ? "Ocultar" : "Mostrar"}
                        </button>
                      </div>
                    </div>

                    {error && (
                      <div className="rounded-lg bg-rose-500/10 p-3 text-sm text-rose-300 ring-1 ring-rose-500/30">
                        {error}
                      </div>
                    )}
                    {msg && (
                      <div className="rounded-lg bg-emerald-500/10 p-3 text-sm text-emerald-300 ring-1 ring-emerald-500/30">
                        {msg}
                      </div>
                    )}

                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <button
                        type="submit"
                        disabled={loading}
                        className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-fuchsia-500 px-4 py-3 text-sm font-medium text-white ring-1 ring-white/10 transition hover:from-cyan-400 hover:to-fuchsia-400 disabled:opacity-60"
                      >
                        <LogIn className="h-4 w-4" />
                        {loading ? "Entrando..." : "Entrar"}
                      </button>

                      <button
                        type="button"
                        onClick={limpar}
                        className="inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-medium text-slate-200 ring-1 ring-white/10 transition hover:bg-white/5"
                      >
                        <RotateCcw className="h-4 w-4" /> Limpar
                      </button>

                      <a
                        href="#recuperar"
                        className="inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-medium text-cyan-300/90 ring-1 ring-white/10 transition hover:bg-white/5 hover:text-cyan-200"
                      >
                        <HelpCircle className="h-4 w-4" /> Esqueci a senha
                      </a>
                    </div>

                    <div className="flex items-center justify-between gap-3 pt-2">
                      <button
                        type="button"
                        onClick={handleCadastroRapido}
                        className="text-xs text-slate-300 underline underline-offset-4 hover:text-white"
                      >
                        Cadastrar rapidamente
                      </button>
                      <span className="text-xs text-slate-500">
                        UID conhecido: ab2c2233-10c7-4bcf-97f3-0f3f2f1724e8
                      </span>
                    </div>
                  </form>
                </div>
              </div>

              <div className="mt-6 text-center text-xs text-slate-500">
                © {new Date().getFullYear()} Todos direitos reservados a João Paulo Sperandio • SANEAR Colatina
              </div>
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Feature({ k, s }: { k: string; s: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-center shadow-sm">
      <div className="text-2xl font-semibold text-white">{k}</div>
      <div className="text-xs text-slate-400">{s}</div>
    </div>
  );
}
