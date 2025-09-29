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
  Upload, // 👈 novo ícone para Importar OS de Corte (PDF)
} from "lucide-react";

type Props = {
  active: NavKey;
  onSelect: (k: NavKey) => void;
  onAfterSelect?: () => void; // fecha o menu no mobile após clicar
};

function Item({
  icon: Icon,
  label,
  k,
  active,
  onSelect,
  onAfterSelect,
}: {
  icon: React.ElementType;
  label: string;
  k: NavKey;
  active: boolean;
  onSelect: (k: NavKey) => void;
  onAfterSelect?: () => void;
}) {
  return (
    <button
      onClick={() => {
        onSelect(k);
        onAfterSelect?.();
      }}
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

function AccordionSection({
  title,
  children,
  storageKey,
  defaultOpen = true,
}: {
  title: string;
  children: React.ReactNode;
  storageKey: string;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = React.useState<boolean>(() => {
    try {
      const v = localStorage.getItem(`sb:section:${storageKey}`);
      return v === null ? defaultOpen : v === "1";
    } catch {
      return defaultOpen;
    }
  });

  React.useEffect(() => {
    try {
      localStorage.setItem(`sb:section:${storageKey}`, open ? "1" : "0");
    } catch {}
  }, [open, storageKey]);

  return (
    <div className="border-t border-white/10 first:border-t-0 pt-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center justify-between px-2 py-2 rounded-lg text-[11px] uppercase tracking-wide text-slate-400/90 hover:bg-white/5"
      >
        <span className="px-1">{title}</span>
        <ChevronDown
          size={16}
          className={`transition-transform duration-200 ${open ? "rotate-0" : "-rotate-90"}`}
        />
      </button>

      {/* Conteúdo (sanfona) */}
      <div className={`${open ? "block" : "hidden"} mt-2 space-y-1 px-1`}>{children}</div>
    </div>
  );
}

export default function Sidebar({ active, onSelect, onAfterSelect }: Props) {
  async function handleSignOut() {
    try {
      await supabase.auth.signOut();
    } finally {
      window.location.href = "/"; // volta para login
    }
  }

  return (
    <aside className="w-72 h-full bg-slate-950/95 border-r border-white/10 flex flex-col">
      {/* topo */}
      <div className="px-4 py-4 border-b border-white/10">
        <div className="text-lg font-semibold">
          <span className="text-indigo-400">SANEAR</span>{" "}
        </div>
        <div className="text-xs text-slate-400">Corte & Religação</div>
      </div>

      {/* navegação com scroll */}
      <div className="flex-1 p-3 overflow-y-auto">
        <AccordionSection title="Principal" storageKey="principal" defaultOpen>
          <Item
            icon={LayoutDashboard}
            label="Dashboard"
            k="dashboard"
            active={active === "dashboard"}
            onSelect={onSelect}
            onAfterSelect={onAfterSelect}
          />
        </AccordionSection>

        <AccordionSection title="Cadastro de serviços" storageKey="cadastro" defaultOpen>
          <Item
            icon={Scissors}
            label="Nova ordem de corte"
            k="corteNew"
            active={active === "corteNew"}
            onSelect={onSelect}
            onAfterSelect={onAfterSelect}
          />
          <Item
            icon={PlugZap}
            label="Nova papeleta de religação"
            k="religacaoNew"
            active={active === "religacaoNew"}
            onSelect={onSelect}
            onAfterSelect={onAfterSelect}
          />
          {/* NOVO: Importar OS de corte (PDF em lote) */}
          <Item
            icon={Upload}
            label="Importar OS de corte (PDF)"
            k={"importarOSCorte" as NavKey} // ajuste o tipo em ../types/nav se necessário
            active={active === ("importarOSCorte" as NavKey)}
            onSelect={onSelect}
            onAfterSelect={onAfterSelect}
          />
        </AccordionSection>

        <AccordionSection title="Serviços pendentes" storageKey="pendentes" defaultOpen>
          <Item
            icon={ClipboardList}
            label="OS de corte pendentes"
            k="cortePend"
            active={active === "cortePend"}
            onSelect={onSelect}
            onAfterSelect={onAfterSelect}
          />
          <Item
            icon={ClipboardCheck}
            label="Papeletas pendentes"
            k="papeletasPend"
            active={active === "papeletasPend"}
            onSelect={onSelect}
            onAfterSelect={onAfterSelect}
          />
        </AccordionSection>

        <AccordionSection title="Consultas" storageKey="consultas">
          <Item
            icon={FileClock}
            label="Todos os corte"
            k="ordensAll"
            active={active === "ordensAll"}
            onSelect={onSelect}
            onAfterSelect={onAfterSelect}
          />
          <Item
            icon={FileCheck}
            label="Todas as religação"
            k="papeletasAll"
            active={active === "papeletasAll"}
            onSelect={onSelect}
            onAfterSelect={onAfterSelect}
          />
        </AccordionSection>

        <AccordionSection title="Administração" storageKey="admin">
          <Item
            icon={BarChart2}
            label="Relatórios"
            k="relatorios"
            active={active === "relatorios"}
            onSelect={onSelect}
            onAfterSelect={onAfterSelect}
          />
          <Item
            icon={Users}
            label="Usuários"
            k="usuarios"
            active={active === "usuarios"}
            onSelect={onSelect}
            onAfterSelect={onAfterSelect}
          />
          <Item
            icon={History}
            label="Histórico"
            k="historico"
            active={active === "historico"}
            onSelect={onSelect}
            onAfterSelect={onAfterSelect}
          />
        </AccordionSection>
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
    </aside>
  );
}
