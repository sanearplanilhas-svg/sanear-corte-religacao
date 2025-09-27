// src/components/Sidebar.tsx
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
  History,
  ChevronDown,
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
      <span className="text-sm font-medium truncate">{label}</span>
      <span
        className={[
          "ml-auto h-5 w-1 rounded-full transition-all",
          active ? "bg-indigo-400" : "bg-transparent group-hover:bg-white/20",
        ].join(" ")}
      />
    </button>
  );
}

function SectionHeader({
  title,
  open,
  onToggle,
  accent = "text-slate-400/80",
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  accent?: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="w-full flex items-center justify-between px-3 mt-4 mb-2"
      aria-expanded={open}
    >
      <span className={`text-[11px] uppercase tracking-wide ${accent}`}>{title}</span>
      <ChevronDown
        className={[
          "h-4 w-4 text-slate-400 transition-transform duration-150 md:hidden",
          open ? "rotate-180" : "rotate-0",
        ].join(" ")}
      />
    </button>
  );
}

/** Wrapper de seção: no mobile é “sanfona” (abre/fecha); no desktop sempre aberto */
function Section({
  title,
  open,
  onToggle,
  children,
  accent,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  accent?: string;
}) {
  return (
    <div>
      <SectionHeader title={title} open={open} onToggle={onToggle} accent={accent} />
      {/* No desktop (md+) sempre mostra; no mobile respeita o “open” */}
      <div className={`md:block ${open ? "block" : "hidden"}`}>{children}</div>
    </div>
  );
}

export default function Sidebar({ active, onSelect }: Props) {
  // Detecta desktop x mobile para definir comportamento “sanfona”
  const [isDesktop, setIsDesktop] = React.useState<boolean>(() =>
    typeof window !== "undefined" ? window.matchMedia("(min-width: 768px)").matches : true
  );

  React.useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    // set inicial e listener
    setIsDesktop(mq.matches);
    mq.addEventListener?.("change", handler);
    return () => mq.removeEventListener?.("change", handler);
  }, []);

  // Sanfona: no mobile só 1 aberto; no desktop tudo aberto
  // Guardamos qual seção está aberta (apenas para mobile)
  type SecKey = "principal" | "cadastro" | "pendentes" | "consultas" | "admin";
  const [openSec, setOpenSec] = React.useState<SecKey | null>("principal");

  const toggle = (key: SecKey) => {
    if (isDesktop) return; // no desktop não colapsa
    setOpenSec((prev) => (prev === key ? null : key));
  };

  const isOpen = (key: SecKey) => (isDesktop ? true : openSec === key);

  async function handleSignOut() {
    try {
      await supabase.auth.signOut();
    } finally {
      window.location.href = "/"; // volta para login
    }
  }

  return (
    <aside className="w-72 h-screen bg-slate-950/95 border-r border-white/10 flex flex-col">
      {/* topo */}
      <div className="px-4 py-4 border-b border-white/10 shrink-0">
        <div className="text-lg font-semibold truncate">
          <span className="text-indigo-400">SANEAR</span>{" "}
        </div>
        <div className="text-xs text-slate-400">Corte & Religação</div>
      </div>

      {/* navegação com rolagem própria */}
      <div className="flex-1 p-3 space-y-1 overflow-y-auto overscroll-contain">
        {/* Principal */}
        <Section title="Principal" open={isOpen("principal")} onToggle={() => toggle("principal")}>
          <Item
            icon={LayoutDashboard}
            label="Dashboard"
            k="dashboard"
            active={active === "dashboard"}
            onSelect={onSelect}
          />
        </Section>

        {/* Cadastro */}
        <Section
          title="Cadastro de serviços"
          open={isOpen("cadastro")}
          onToggle={() => toggle("cadastro")}
        >
          <Item
            icon={Scissors}
            label="Nova ordem de corte"
            k="corteNew"
            active={active === "corteNew"}
            onSelect={onSelect}
          />
          <Item
            icon={PlugZap}
            label="Nova papeleta de religação"
            k="religacaoNew"
            active={active === "religacaoNew"}
            onSelect={onSelect}
          />
        </Section>

        {/* Pendentes */}
        <Section
          title="Serviços pendentes"
          open={isOpen("pendentes")}
          onToggle={() => toggle("pendentes")}
        >
          <Item
            icon={ClipboardList}
            label="OS de corte pendentes"
            k="cortePend"
            active={active === "cortePend"}
            onSelect={onSelect}
          />
          <Item
            icon={ClipboardCheck}
            label="Papeletas pendentes"
            k="papeletasPend"
            active={active === "papeletasPend"}
            onSelect={onSelect}
          />
        </Section>

        {/* Consultas */}
        <Section
          title="Consultas"
          open={isOpen("consultas")}
          onToggle={() => toggle("consultas")}
        >
          <Item
            icon={FileClock}
            label="Todos os corte"
            k="ordensAll"
            active={active === "ordensAll"}
            onSelect={onSelect}
          />
          <Item
            icon={FileCheck}
            label="Todas as religação"
            k="papeletasAll"
            active={active === "papeletasAll"}
            onSelect={onSelect}
          />
        </Section>

        {/* Administração */}
        <Section
          title="Administração"
          open={isOpen("admin")}
          onToggle={() => toggle("admin")}
        >
          <Item
            icon={BarChart2}
            label="Relatórios"
            k="relatorios"
            active={active === "relatorios"}
            onSelect={onSelect}
          />
          <Item
            icon={Users}
            label="Usuários"
            k="usuarios"
            active={active === "usuarios"}
            onSelect={onSelect}
          />
          <Item
            icon={History}
            label="Histórico"
            k="historico"
            active={active === "historico"}
            onSelect={onSelect}
          />
        </Section>
      </div>

      {/* rodapé */}
      <div className="p-3 border-t border-white/10 space-y-2 shrink-0">
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
