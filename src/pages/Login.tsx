
import React, { useState } from 'react'
import { motion } from 'framer-motion'
import { User, Lock, LogIn, RotateCcw, HelpCircle } from 'lucide-react'
import { supabase } from '../supabaseClient'

export default function Login() {
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [showPwd, setShowPwd] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [msg, setMsg] = useState('')

  const limpar = () => { setEmail(''); setSenha(''); setError(''); setMsg('') }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(''); setMsg('')
    if (!email || !senha) { setError('Preencha e-mail e senha.'); return }
    try {
      setLoading(true)
      const { error } = await supabase.auth.signInWithPassword({ email, password: senha })
      if (error) throw error
      setMsg('Login efetuado!')
    } catch (err: any) {
      setError(err.message || 'Não foi possível entrar.')
    } finally { setLoading(false) }
  }

  async function handleCadastroRapido() {
    setError(''); setMsg('')
    if (!email || !senha) { setError('Informe e-mail e senha para cadastrar.'); return }
    try {
      setLoading(true)
      const { data, error } = await supabase.auth.signUp({ email, password: senha })
      if (error) throw error
      setMsg('Cadastro criado! Verifique seu e-mail (se confirmado nas políticas do projeto).')
    } catch (err: any) {
      setError(err.message || 'Erro no cadastro.')
    } finally { setLoading(false) }
  }

  return (
    <div className="min-h-screen grid-bg from-slate-950 via-slate-900 to-black text-slate-100 relative overflow-hidden">
      <div className="pointer-events-none absolute -top-24 -left-24 h-72 w-72 rounded-full bg-cyan-500/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -right-24 h-72 w-72 rounded-full bg-fuchsia-500/20 blur-3xl" />

      <div className="relative z-10 flex items-center justify-center min-h-screen p-4">
        <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="w-full max-w-md">
          <div className="group relative rounded-2xl bg-white/5 backdrop-blur-xl p-8 shadow-2xl ring-1 ring-white/10">
            <div className="absolute -inset-px rounded-2xl bg-gradient-to-br from-cyan-500/30 via-fuchsia-500/30 to-emerald-500/30 opacity-0 blur transition-opacity duration-500 group-hover:opacity-100" />
            <div className="relative">
              <div className="mb-8 text-center">
                <div className="mx-auto mb-3 h-14 w-14 rounded-xl bg-gradient-to-br from-cyan-400 to-fuchsia-500 p-[2px]">
                  <div className="h-full w-full rounded-xl bg-slate-900 flex items-center justify-center">
                    <LogIn className="h-6 w-6 text-cyan-300" />
                  </div>
                </div>
                <h1 className="text-2xl font-semibold tracking-tight">SANEAR - Corte e Religação</h1>
                <p className="text-sm text-slate-400">Não tem credenciais? Entre em contato com o ADM</p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label className="mb-1.5 block text-sm text-slate-300">E-mail</label>
                  <div className="flex items-center gap-2 rounded-xl bg-slate-900/60 ring-1 ring-white/10 focus-within:ring-cyan-400/60 transition">
                    <span className="pl-3 text-slate-400"><User className="h-5 w-5" /></span>
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
                  <label className="mb-1.5 block text-sm text-slate-300">Senha</label>
                  <div className="flex items-center gap-2 rounded-xl bg-slate-900/60 ring-1 ring-white/10 focus-within:ring-fuchsia-400/60 transition">
                    <span className="pl-3 text-slate-400"><Lock className="h-5 w-5" /></span>
                    <input
                      type={showPwd ? 'text' : 'password'}
                      value={senha}
                      onChange={(e) => setSenha(e.target.value)}
                      placeholder="••••••••"
                      className="w-full bg-transparent p-3 pr-12 text-slate-100 placeholder:text-slate-500 focus:outline-none"
                      autoComplete="current-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPwd((s) => !s)}
                      className="mr-2 rounded-lg px-2 py-1 text-xs text-slate-300 hover:text-white hover:bg-white/5"
                      aria-label={showPwd ? 'Ocultar senha' : 'Mostrar senha'}
                    >
                      {showPwd ? 'Ocultar' : 'Mostrar'}
                    </button>
                  </div>
                </div>

                {error && (
                  <div className="rounded-lg bg-rose-500/10 p-3 text-sm text-rose-300 ring-1 ring-rose-500/30">{error}</div>
                )}
                {msg && (
                  <div className="rounded-lg bg-emerald-500/10 p-3 text-sm text-emerald-300 ring-1 ring-emerald-500/30">{msg}</div>
                )}

                <div className="flex items-center justify-between gap-3">
                  <button type="submit" disabled={loading} className="inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-medium text-white ring-1 ring-white/10 transition disabled:opacity-60 bg-gradient-to-r from-cyan-500 to-fuchsia-500 hover:from-cyan-400 hover:to-fuchsia-400">
                    <LogIn className="h-4 w-4" />
                    {loading ? 'Entrando...' : 'Entrar'}
                  </button>

                  <button type="button" onClick={limpar} className="inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-medium text-slate-200 ring-1 ring-white/10 transition hover:bg-white/5">
                    <RotateCcw className="h-4 w-4" /> Limpar
                  </button>

                  <a href="#recuperar" className="inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-medium text-cyan-300/90 ring-1 ring-white/10 transition hover:bg-white/5 hover:text-cyan-200">
                    <HelpCircle className="h-4 w-4" /> Esqueci a senha
                  </a>
                </div>

                <div className="flex items-center justify-between gap-3 pt-2">
                  <button type="button" onClick={handleCadastroRapido} className="text-xs text-slate-300 hover:text-white underline underline-offset-4">Cadastrar rapidamente</button>
                  <span className="text-xs text-slate-500">UID conhecido: ab2c2233-10c7-4bcf-97f3-0f3f2f1724e8</span>
                </div>
              </form>
            </div>
          </div>

          <div className="mt-6 text-center text-xs text-slate-500">
            © {new Date().getFullYear()} João Paulo Sperandio. Todos os direitos reservados.
          </div>
        </motion.div>
      </div>
    </div>
  )
}
