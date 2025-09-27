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
  X,
} from "lucide-react";

type Props = {
  active: NavKey;
  onSelect: (k: NavKey) => void;

  /** controle do drawer mobile (opcional — usado no Dashboard) */
  mobileOpen?: boolean;
  onMobileClose?: () => void;
};

function Item({
  icon: Icon,
  label,
  k,
  active,
  onClick,
}: {
  icon: React.ElementType;
  label: string;
  k: NavKey;
  active: boolean;
  onClick: (k: NavKey) => void;
}) {
  return (
    <button
      onClick={() => onClick(k)}
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

function Section({
  title,
  children,
  defaultOpen = true,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = React.useState(defaultOpen);
  return (
    <div className="mb-1">
      <button
        className="w-full flex items-center justify-between px-3 mt-3 mb-2 text-[11px] uppercase tracking-wide text-slate-400/80"
        onClick={() => setOpen((v) => !v)}
      >
        <span>{title}</span>
        <ChevronDown
          size={16}
          className={`transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      <div
        className={`grid gap-1 overflow-hidden transition-[grid-template-rows,opacity] duration-200 ${
          open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
        }`}
      >
        <div className="min-h-0">{children}</div>
      </div>
    </div>
  );
}

export default function Sidebar({
  active,
  onSelect,
  mobileOpen,
  onMobileClose,
}: Props) {
  async function handleSignOut() {
    try {
      await supabase.auth.signOut();
    } finally {
      window.location.href = "/"; // volta para login
    }
  }

  // Ao clicar em item no mobile: seleciona e fecha o drawer
  const handleSelect = (k: NavKey) => {
    onSelect(k);
    if (onMobileClose) onMobileClose();
  };

  // Conteúdo do menu (reutilizado em desktop e mobile)
  const MenuContent = (
    <>
      {/* topo */}
      <div className="px-4 py-4 border-b border-white/10 flex items-center justify-between">
        <div>
          <div className="text-lg font-semibold">
            <span className="text-indigo-400">SANEAR</span>{" "}
          </div>
          <div className="text-xs text-slate-400">Corte & Religação</div>
        </div>

        {/* botão fechar (somente mobile) */}
        <button
          onClick={onMobileClose}
          className="md:hidden p-2 rounded-lg hover:bg-white/10"
          aria-label="Fechar menu"
        >
          <X size={18} />
        </button>
      </div>

      {/* navegação com rolagem */}
      <div className="flex-1 p-3 space-y-1 overflow-y-auto">
        <Section title="Principal">
          <Item
            icon={LayoutDashboard}
            label="Dashboard"
            k="dashboard"
            active={active === "dashboard"}
            onClick={handleSelect}
          />
        </Section>

        <Section title="Cadastro de serviços">
          <Item
            icon={Scissors}
            label="Nova ordem de corte"
            k="corteNew"
            active={active === "corteNew"}
            onClick={handleSelect}
          />
          <Item
            icon={PlugZap}
            label="Nova papeleta de religação"
            k="religacaoNew"
            active={active === "religacaoNew"}
            onClick={handleSelect}
          />
        </Section>

        <Section title="Serviços pendentes">
          <Item
            icon={ClipboardList}
            label="OS de corte pendentes"
            k="cortePend"
            active={active === "cortePend"}
            onClick={handleSelect}
          />
          <Item
            icon={ClipboardCheck}
            label="Papeletas pendentes"
            k="papeletasPend"
            active={active === "papeletasPend"}
            onClick={handleSelect}
          />
        </Section>

        <Section title="Consultas">
          <Item
            icon={FileClock}
            label="Todos os corte"
            k="ordensAll"
            active={active === "ordensAll"}
            onClick={handleSelect}
          />
          <Item
            icon={FileCheck}
            label="Todas as religação"
            k="papeletasAll"
            active={active === "papeletasAll"}
            onClick={handleSelect}
          />
        </Section>

        <Section title="Administração">
          <Item
            icon={BarChart2}
            label="Relatórios"
            k="relatorios"
            active={active === "relatorios"}
            onClick={handleSelect}
          />
          <Item
            icon={Users}
            label="Usuários"
            k="usuarios"
            active={active === "usuarios"}
            onClick={handleSelect}
          />
          <Item
            icon={History}
            label="Histórico"
            k="historico"
            active={active === "historico"}
            onClick={handleSelect}
          />
        </Section>
      </div>

      {/* rodapé */}
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
    </>
  );

  return (
    <>
      {/* DESKTOP: sidebar fixa */}
      <aside className="hidden md:flex w-72 min-h-screen bg-slate-950/95 border-r border-white/10 flex-col">
        {MenuContent}
      </aside>

      {/* MOBILE: drawer + backdrop */}
      <div
        className={`md:hidden fixed inset-0 z-50 transition ${
          mobileOpen ? "pointer-events-auto" : "pointer-events-none"
        }`}
      >
        {/* backdrop */}
        <div
          className={`absolute inset-0 bg-black/50 transition-opacity ${
            mobileOpen ? "opacity-100" : "opacity-0"
          }`}
          onClick={onMobileClose}
        />

        {/* drawer */}
        <aside
          className={`absolute top-0 left-0 h-full w-72 bg-slate-950/95 border-r border-white/10 flex flex-col transform transition-transform ${
            mobileOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          {MenuContent}
        </aside>
      </div>
    </>
  );
}
