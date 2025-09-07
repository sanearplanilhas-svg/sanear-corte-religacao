import * as React from "react";
import { type NavKey } from "../types/nav";
import supabase from "../lib/supabase";
import {
  LayoutDashboard,
  Scissors,
  PlugZap,
  ClipboardList,
  ClipboardCheck,
  FileClock,
  FileCheck,
  BarChart2,
  Users,
  LogOut,
} from "lucide-react";

type Props = {
  active: NavKey;
  onSelect: (k: NavKey) => void;
};

function Item({
  icon: Icon,
  label,
  k,
  active,
  onSelect,
}: {
  icon: React.ElementType;
  label: string;
  k: NavKey;
  active: boolean;
  onSelect: (k: NavKey) => void;
}) {
  return (
    <button
      onClick={() => onSelect(k)}
      className={[
        "group w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all",
        active
          ? "bg-indigo-500/15 ring-1 ring-indigo-400/30 text-indigo-200"
          : "text-slate-300 hover:bg-white/5 hover:ring-1 hover:ring-white/10",
      ].join(" ")}
    >
      <span
        className={[
          "inline-flex items-center justify-center w-8 h-8 rounded-lg transition-all",
          active
            ? "bg-indigo-500/20 text-indigo-300"
            : "bg-white/5 text-slate-300 group-hover:text-white",
        ].join(" ")}
      >
        <Icon size={18} />
      </span>
      <span className="text-sm font-medium">{label}</span>
      <span
        className={[
          "ml-auto h-5 w-1 rounded-full transition-all",
          active ? "bg-indigo-400" : "bg-transparent group-hover:bg-white/20",
        ].join(" ")}
      />
    </button>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-3 mt-4 mb-2 text-[11px] uppercase tracking-wide text-slate-400/80">
      {children}
    </div>
  );
}

export default function Sidebar({ active, onSelect }: Props) {
  async function handleSignOut() {
    try {
      await supabase.auth.signOut();
    } finally {
      window.location.href = "/"; // volta para login
    }
  }

  return (
    <aside className="w-72 min-h-screen bg-slate-950/95 border-r border-white/10 flex flex-col">
      {/* topo */}
      <div className="px-4 py-4 border-b border-white/10">
        <div className="text-lg font-semibold">
          <span className="text-indigo-400">SANEAR</span>{" "}
        </div>
        <div className="text-xs text-slate-400">Corte & Religação</div>
      </div>

      {/* navegação */}
      <div className="flex-1 p-3 space-y-1 overflow-y-auto">
        <SectionTitle>Principal</SectionTitle>
        <Item icon={LayoutDashboard} label="Dashboard" k="dashboard" active={active === "dashboard"} onSelect={onSelect} />

        <SectionTitle>Cadastro de serviços</SectionTitle>
        <Item icon={Scissors} label="Nova ordem de corte" k="corteNew" active={active === "corteNew"} onSelect={onSelect} />
        <Item icon={PlugZap} label="Nova papeleta de religação" k="religacaoNew" active={active === "religacaoNew"} onSelect={onSelect} />

        <SectionTitle>Serviços pendentes</SectionTitle>
        <Item icon={ClipboardList} label="OS de corte pendentes" k="cortePend" active={active === "cortePend"} onSelect={onSelect} />
        <Item icon={ClipboardCheck} label="Papeletas pendentes" k="papeletasPend" active={active === "papeletasPend"} onSelect={onSelect} />

        <SectionTitle>Consultas</SectionTitle>
        <Item icon={FileClock} label="Todos os corte" k="ordensAll" active={active === "ordensAll"} onSelect={onSelect} />
        <Item icon={FileCheck} label="Todas as religação" k="papeletasAll" active={active === "papeletasAll"} onSelect={onSelect} />

        <SectionTitle>Administração</SectionTitle>
        <Item icon={BarChart2} label="Relatórios" k="relatorios" active={active === "relatorios"} onSelect={onSelect} />
        <Item icon={Users} label="Usuários" k="usuarios" active={active === "usuarios"} onSelect={onSelect} />
      </div>

      {/* rodapé: só o botão Sair (removemos “Histórico/Config”) */}
      <div className="p-3 border-t border-white/10 space-y-2">
        <button
          onClick={handleSignOut}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl bg-rose-600/15 text-rose-200 ring-1 ring-rose-400/30 hover:bg-rose-600/25 transition-all"
        >
          <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-rose-600/20">
            <LogOut size={18} />
          </span>
          <span className="text-sm font-medium">Sair</span>
          <span className="ml-auto h-5 w-1 rounded-full bg-rose-400" />
        </button>
      </div>
    </aside>
  );
}
