// src/pages/Dashboard.tsx
import React, { useEffect, useState } from "react";
import type { NavKey } from "../types/nav";
import { supabase } from "../supabaseClient";

import Sidebar from "../components/Sidebar";
import Topbar from "../components/Topbar";

import CutOrderForm from "../components/forms/CutOrderForm";
import ReconnectionOrderForm from "../components/forms/ReconnectionOrderForm";

import PendingCutsTable from "../tables/PendingCutsTable";
import PendingReconnectionsTable from "../tables/PendingReconnectionsTable";

import AllOrdersTable from "../components/tables/AllOrdersTable";
import AllReconnectionsTable from "../components/tables/AllReconnectionsTable";

import UsersPage from "./UsersPage";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";

export default function Dashboard() {
  const [active, setActive] = useState<NavKey>("dashboard");

  const [aguardandoCorte, setAguardandoCorte] = useState(0);
  const [aguardandoRelig, setAguardandoRelig] = useState(0);
  const [cortadas, setCortadas] = useState(0);
  const [ativas, setAtivas] = useState(0);

  // Filtro
  const [showFiltro, setShowFiltro] = useState(false);
  const [dateStart, setDateStart] = useState("");
  const [dateEnd, setDateEnd] = useState("");
  const [allDates, setAllDates] = useState(true);

  // Bairros
  const [bairros, setBairros] = useState<{ id: string; bairro: string }[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [novoBairro, setNovoBairro] = useState("");
  const [deleteMode, setDeleteMode] = useState(false);
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());

  // ---------- helpers ----------
  const norm = (s?: string | null) =>
    (s ?? "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .trim();

  const TXT_PENDENTE = new Set([
    "pendente",
    "aguardando corte",
    "aguardado corte",
    "aguardando_corte",
  ]);
  const TXT_AGUARD_RELI = new Set([
    "aguardando religacao",
    "aguardando religação",
    "aguardando_religacao",
  ]);
  const TXT_CORTADA = new Set(["cortada"]);
  const TXT_ATIVA = new Set(["ativa"]);

  const countRobusto = async ({
    table,
    statusId,
    textoSet,
    start,
    end,
  }: {
    table: "ordens_corte" | "ordens_religacao";
    statusId: number;
    textoSet: Set<string>;
    start?: string;
    end?: string;
  }) => {
    try {
      let query = supabase.from(table).select("id,status_id,status,created_at");
      if (!allDates && start && end) {
        query = query.gte("created_at", start).lte("created_at", end);
      }
      const { data, error } = await query;
      if (error) throw error;

      let total = 0;
      for (const r of data ?? []) {
        const sid = (r as any).status_id as number | null;
        const st = norm((r as any).status as string | null);
        if (sid === statusId || textoSet.has(st)) total++;
      }
      return total;
    } catch (e) {
      console.error(`countRobusto(${table}, ${statusId})`, e);
      return 0;
    }
  };

  const fetchCounts = async () => {
    try {
      const [pendCorte, aguardRelig, qtdCortadas, qtdAtivas] = await Promise.all([
        countRobusto({
          table: "ordens_corte",
          statusId: 1,
          textoSet: TXT_PENDENTE,
          start: dateStart,
          end: dateEnd,
        }),
        countRobusto({
          table: "ordens_religacao",
          statusId: 3,
          textoSet: TXT_AGUARD_RELI,
          start: dateStart,
          end: dateEnd,
        }),
        countRobusto({
          table: "ordens_corte",
          statusId: 2,
          textoSet: TXT_CORTADA,
          start: dateStart,
          end: dateEnd,
        }),
        countRobusto({
          table: "ordens_religacao",
          statusId: 4,
          textoSet: TXT_ATIVA,
          start: dateStart,
          end: dateEnd,
        }),
      ]);

      setAguardandoCorte(pendCorte);
      setAguardandoRelig(aguardRelig);
      setCortadas(qtdCortadas);
      setAtivas(qtdAtivas);
    } catch (err) {
      console.error("Erro ao buscar contagens:", err);
    }
  };

  const fetchBairros = async () => {
    const { data, error } = await supabase
      .from("avisos_bairros")
      .select("*")
      .order("created_at", { ascending: false });
    if (!error && data) setBairros(data);
  };

  const salvarBairro = async () => {
    const bairrosLista = novoBairro
      .split("\n")
      .map((b) => b.trim().toUpperCase())
      .filter((b) => b.length > 0);

    const { data, error } = await supabase
      .from("avisos_bairros")
      .insert(bairrosLista.map((b) => ({ bairro: b })))
      .select();

    if (!error && data) {
      setBairros([...data, ...bairros]);
      setShowModal(false);
      setNovoBairro("");
    }
  };

  const excluirBairros = async () => {
    const ids = Array.from(selecionados);
    const { error } = await supabase.from("avisos_bairros").delete().in("id", ids);
    if (!error) {
      setBairros(bairros.filter((b) => !selecionados.has(b.id)));
      setSelecionados(new Set());
      setDeleteMode(false);
    }
  };

  useEffect(() => {
    fetchCounts();
    fetchBairros();
  }, [dateStart, dateEnd, allDates]);

  // ---------- componente interno (definido ANTES do uso) ----------
  function BigStat({
    title,
    value,
    accent,
    onClick,
  }: {
    title: string;
    value: number;
    accent: string;
    onClick?: () => void;
  }) {
    return (
      <div
        onClick={onClick}
        className="cursor-pointer rounded-2xl bg-slate-900/50 ring-1 transition-colors duration-150"
      >
        <div className="h-48 flex flex-col items-center justify-center text-center px-4">
          <div className="text-xl font-semibold" style={{ color: accent }}>
            {title}
          </div>
          <div className="mt-4 font-extrabold text-6xl" style={{ color: accent }}>
            {value}
          </div>
        </div>
      </div>
    );
  }

  // ---------- UI ----------
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* Sidebar fixa */}
      <div className="fixed top-0 left-0 h-full w-72 z-40">
        <Sidebar active={active} onSelect={(k: NavKey) => setActive(k)} />
      </div>

      {/* Main deslocado pela sidebar */}
      <main className="ml-72 flex-1 relative">
        {/* Topbar fixa */}
        <div className="fixed top-0 left-72 right-0 h-16 z-30">
          <Topbar />
        </div>

        {/* Conteúdo rolável (não passa por baixo da Topbar) */}
        <div className="pt-24 px-8">
          <div className="h-[calc(100vh-6rem)] overflow-y-auto pr-3 pb-10">
            <div className="max-w-7xl mx-auto space-y-8">
              {active === "dashboard" && (
                <>
                  {/* Título + Ações */}
                  <div className="flex items-center gap-3 mt-6">
                    <h1 className="text-3xl font-bold">Informações Rápidas</h1>
                    <div className="ml-auto flex gap-3">
                      <button
                        onClick={() => setShowFiltro(true)}
                        className="px-4 py-2 rounded-lg bg-indigo-500/20 text-indigo-200 ring-1 ring-indigo-400/40 hover:bg-indigo-500/30"
                      >
                        Filtro
                      </button>
                      <button
                        onClick={() => {
                          fetchCounts();
                          fetchBairros();
                        }}
                        className="px-4 py-2 rounded-lg bg-emerald-500/20 text-emerald-200 ring-1 ring-emerald-400/40 hover:bg-emerald-500/30"
                      >
                        Atualizar
                      </button>
                    </div>
                  </div>

                  {/* Cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-8 mt-6">
                    <BigStat
                      title="Aguardando Corte"
                      value={aguardandoCorte}
                      accent="#f97316"
                      onClick={() => setActive("cortePend")}
                    />
                    <BigStat
                      title="Cortadas"
                      value={cortadas}
                      accent="#dc2626"
                      onClick={() => setActive("ordensAll")}
                    />
                    <BigStat
                      title="Aguardando Religação"
                      value={aguardandoRelig}
                      accent="#facc15"
                      onClick={() => setActive("papeletasPend")}
                    />
                    <BigStat
                      title="Ativas"
                      value={ativas}
                      accent="#22c55e"
                      onClick={() => setActive("papeletasAll")}
                    />
                  </div>

                  {/* Gráficos */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-8">
                    <div className="bg-slate-900/50 p-6 rounded-2xl">
                      <h3 className="text-lg font-semibold mb-4 text-center">Cortes</h3>
                      <ResponsiveContainer width="100%" height={250}>
                        <PieChart>
                          <Pie
                            data={[
                              { name: "Aguardando Corte", value: aguardandoCorte },
                              { name: "Cortadas", value: cortadas },
                            ]}
                            innerRadius={70}
                            outerRadius={100}
                            startAngle={180}
                            endAngle={0}
                            dataKey="value"
                            cx="50%"
                            cy="100%"
                          >
                            <Cell fill="#f97316" />
                            <Cell fill="#dc2626" />
                          </Pie>
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="flex justify-center gap-4 mt-2">
                        <span className="px-2 py-1 rounded bg-[#f97316]/30 text-[#f97316]">
                          Aguardando Corte: {aguardandoCorte}
                        </span>
                        <span className="px-2 py-1 rounded bg-[#dc2626]/30 text-[#dc2626]">
                          Cortadas: {cortadas}
                        </span>
                      </div>
                    </div>

                    <div className="bg-slate-900/50 p-6 rounded-2xl">
                      <h3 className="text-lg font-semibold mb-4 text-center">Religações</h3>
                      <ResponsiveContainer width="100%" height={250}>
                        <PieChart>
                          <Pie
                            data={[
                              { name: "Aguardando Religação", value: aguardandoRelig },
                              { name: "Ativas", value: ativas },
                            ]}
                            innerRadius={70}
                            outerRadius={100}
                            startAngle={180}
                            endAngle={0}
                            dataKey="value"
                            cx="50%"
                            cy="100%"
                          >
                            <Cell fill="#facc15" />
                            <Cell fill="#22c55e" />
                          </Pie>
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="flex justify-center gap-4 mt-2">
                        <span className="px-2 py-1 rounded bg-[#facc15]/30 text-[#facc15]">
                          Aguardando Religação: {aguardandoRelig}
                        </span>
                        <span className="px-2 py-1 rounded bg-[#22c55e]/30 text-[#22c55e]">
                          Ativas: {ativas}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Bairros */}
                  <div className="rounded-2xl bg-slate-900/50 ring-1 ring-cyan-400/30 p-6 mt-8">
                    <h3 className="text-lg font-bold text-cyan-300 mb-4 text-center">
                      BAIRROS QUE ESTÃO CORTANDO ÁGUA
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                      {bairros.length === 0 && <p>Nenhum bairro listado</p>}
                      {bairros.map((b) => (
                        <div key={b.id} className="flex items-center gap-2">
                          {deleteMode && (
                            <input
                              type="checkbox"
                              checked={selecionados.has(b.id)}
                              onChange={(e) => {
                                const novo = new Set(selecionados);
                                e.target.checked ? novo.add(b.id) : novo.delete(b.id);
                                setSelecionados(novo);
                              }}
                            />
                          )}
                          <span className="text-cyan-400">➤</span> {b.bairro.toUpperCase()}
                        </div>
                      ))}
                    </div>
                    <div className="flex justify-end gap-2 mt-3">
                      <button
                        onClick={() => setShowModal(true)}
                        className="px-2 py-1 text-xs rounded bg-cyan-600 hover:bg-cyan-700"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => (deleteMode ? excluirBairros() : setDeleteMode(true))}
                        className="px-2 py-1 text-xs rounded bg-rose-600 hover:bg-rose-700"
                      >
                        {deleteMode ? "Confirmar Exclusão" : "Excluir"}
                      </button>
                    </div>
                  </div>
                </>
              )}

              {/* Outras abas */}
              {active === "corteNew" && (
                <>
                  <h1 className="text-2xl">Nova ordem de corte</h1>
                  <CutOrderForm />
                </>
              )}

              {active === "religacaoNew" && (
                <>
                  <h1 className="text-2xl">Nova ordem de religação</h1>
                  <ReconnectionOrderForm />
                </>
              )}

              {active === "cortePend" && (
                <>
                  <h1 className="text-2xl">Cortes pendentes</h1>
                  <PendingCutsTable />
                </>
              )}

              {active === "papeletasPend" && (
                <>
                  <h1 className="text-2xl">Religações pendentes</h1>
                  <PendingReconnectionsTable />
                </>
              )}

              {active === "ordensAll" && (
                <>
                  <h1 className="text-2xl">Todas as ordens</h1>
                  <AllOrdersTable />
                </>
              )}

              {active === "papeletasAll" && (
                <>
                  <h1 className="text-2xl">Todas as papeletas</h1>
                  <AllReconnectionsTable />
                </>
              )}

              {active === "usuarios" && <UsersPage />}

              {active === "relatorios" && (
                <div className="flex items-center justify-center min-h-[60vh]">
                  <h1 className="text-3xl font-bold text-slate-300 text-center">
                    Em breve ficará à disposição
                  </h1>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* Modal Filtro */}
      {showFiltro && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-slate-800 rounded-xl p-6 w-96">
            <h2 className="text-lg font-bold mb-4 text-cyan-300">Filtro</h2>
            <label className="flex items-center gap-2 mb-2">
              <input type="radio" checked={allDates} onChange={() => setAllDates(true)} />
              Todos
            </label>
            <label className="flex items-center gap-2 mb-2">
              <input type="radio" checked={!allDates} onChange={() => setAllDates(false)} />
              Intervalo de datas
            </label>
            {!allDates && (
              <div className="space-y-2">
                <input
                  type="date"
                  value={dateStart}
                  onChange={(e) => setDateStart(e.target.value)}
                  className="w-full p-2 rounded bg-slate-900 border border-slate-700"
                />
                <input
                  type="date"
                  value={dateEnd}
                  onChange={(e) => setDateEnd(e.target.value)}
                  className="w-full p-2 rounded bg-slate-900 border border-slate-700"
                />
              </div>
            )}
            <div className="flex justify-end space-x-2 mt-4">
              <button onClick={() => setShowFiltro(false)} className="px-3 py-1 rounded bg-slate-700">
                Cancelar
              </button>
              <button
                onClick={() => {
                  fetchCounts();
                  fetchBairros();
                  setShowFiltro(false);
                }}
                className="px-3 py-1 rounded bg-cyan-600"
              >
                Aplicar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal editar bairros */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-slate-800 rounded-xl p-6 w-96">
            <h2 className="text-lg font-bold mb-4 text-cyan-300">Adicionar Bairros</h2>
            <textarea
              placeholder="Digite um bairro por linha"
              value={novoBairro}
              onChange={(e) => setNovoBairro(e.target.value)}
              className="w-full h-40 p-2 rounded bg-slate-900 border border-slate-700 uppercase"
            />
            <div className="flex justify-end gap-2 mt-3">
              <button onClick={() => setShowModal(false)} className="px-3 py-1 rounded bg-slate-600">
                Cancelar
              </button>
              <button onClick={salvarBairro} className="px-3 py-1 rounded bg-cyan-600">
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
