// src/components/Topbar.tsx
import React, { useEffect, useState } from "react";
import { Search, X, Sun, Moon, LogOut, User } from "lucide-react";
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
  if (s.includes("aguardando religação") || s.includes("aguardando_religacao"))
    return "bg-amber-500 text-black";
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

  const [userEmail, setUserEmail] = useState<string>("");

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUserEmail(data.user?.email ?? "");
    });
  }, []);

  async function handleLogout() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

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
            {theme === "dark" ? (
              <Sun className="h-4 w-4 text-amber-300" />
            ) : (
              <Moon className="h-4 w-4 text-slate-700" />
            )}
          </button>

          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10">
            <User className="h-4 w-4 text-pink-300" />
            <span className="text-sm text-slate-200">{userEmail || "Usuário"}</span>
          </div>

          <button
            onClick={handleLogout}
            className="px-3 py-2 text-sm rounded-lg bg-rose-500/20 text-rose-300 ring-1 ring-rose-400/40 hover:bg-rose-500/30"
          >
            <LogOut className="h-4 w-4" />
            <span>Sair</span>
          </button>
        </div>
      </div>

      {/* Card de resultado da busca */}
      {openCard && (
        <div className="absolute z-50 left-0 right-0 mx-auto max-w-7xl px-6">
          <div className="relative mt-3 rounded-xl bg-slate-900/95 border border-white/10 shadow-2xl p-4">
            <button
              onClick={() => setOpenCard(false)}
              className="absolute right-3 top-3 p-1 rounded-md hover:bg-white/10"
            >
              <X className="h-4 w-4 text-slate-300" />
            </button>

            {/* 🔥 Destaque de status */}
            <div className="mb-4 p-3 rounded-lg bg-slate-800 flex items-center gap-3">
              <span className="text-slate-300 font-semibold text-lg">Status:</span>
              <span
                className={`px-3 py-1.5 rounded-lg font-bold text-base ring-1 ${badgeStyle(
                  statusAtual
                )}`}
              >
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
  );
}
