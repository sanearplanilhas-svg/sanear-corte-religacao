// src/pages/Historico.tsx
import React, { useEffect, useMemo, useState } from "react";
import supabase from "../lib/supabase";

type HistoricoRow = {
  id: number;
  criado_em: string;          // timestamptz
  acao: "INSERT" | "UPDATE" | "DELETE" | string;
  tabela: string;
  registro_id: string;
  dados: any;                 // jsonb (NEW p/ insert/update; OLD p/ delete)
  usuario_email: string | null;
};

type UserSlim = { email: string; nome: string | null; id?: string; papel?: string };
type UsuarioRow = { id: string; email: string };

const dtf = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });

// senha de confirmação (não aparece no modal; exigida para confirmar)
const CONFIRM_PASSWORD = "jps29101993";

/** Serviços legíveis a partir do nome técnico da tabela */
function baseServiceLabel(tabela: string) {
  const key = (tabela || "").toLowerCase();
  if (key === "ordens_corte") return "ordem de corte";
  if (key === "ordens_religacao") return "papeleta de religação";
  if (key === "avisos_bairros_base" || key === "avisos_bairros") return "aviso de bairro";
  return (tabela || "").replace(/_/g, " ");
}

/** extratores */
function extractMatricula(dados: any): string | null {
  if (!dados || typeof dados !== "object") return null;
  const m = dados.matricula;
  if (typeof m === "string" && m.trim() !== "") return m.trim();
  return null;
}
function extractCreatedBy(dados: any): string | null {
  if (!dados || typeof dados !== "object") return null;
  const id = dados.created_by;
  if (typeof id === "string" && id.length >= 10) return id;
  return null;
}
function nameFromEmailFallback(email?: string | null) {
  if (!email) return "Usuário";
  const nick = (email.split("@")[0] || email).replace(/[._]/g, " ");
  return nick;
}
/** verbo amigável conforme ação/status */
function verbFromRow(row: HistoricoRow) {
  const a = (row.acao || "").toUpperCase();
  const status = (row.dados?.status as string | undefined)?.toLowerCase();
  if (row.tabela === "ordens_corte" && status === "cortada") return "cortou";
  if (row.tabela === "ordens_religacao" && status === "ativa") return "ativou";
  if (a === "DELETE") return "excluiu";
  if (a === "INSERT") return "criou";
  if (a === "UPDATE") return "atualizou";
  return "executou";
}

/** confirmação destrutiva (senha escondida e Enter confirma) */
function ConfirmModal({
  title,
  message,
  onConfirm,
  onCancel,
}: {
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState("");
  const can = text === CONFIRM_PASSWORD;

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && can) {
      e.preventDefault();
      onConfirm();
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center">
      <div className="bg-slate-800 rounded-xl shadow-xl w-full max-w-lg p-6">
        <h3 className="text-xl font-bold mb-2 text-rose-300">{title}</h3>
        <p className="text-slate-200 mb-4">{message}</p>

        <label className="text-slate-400 text-sm mb-2 block">
          Digite a senha de confirmação:
        </label>
        <input
          type="password"
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          className="w-full mb-4 p-2 rounded bg-slate-900 border border-slate-700"
          placeholder="Senha"
        />

        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className="px-3 py-2 rounded bg-slate-700 hover:bg-slate-600">
            Cancelar
          </button>
          <button
            disabled={!can}
            onClick={onConfirm}
            className={`px-3 py-2 rounded ${can ? "bg-rose-600 hover:bg-rose-700" : "bg-rose-900/40"} text-white`}
            title={can ? "Confirmar exclusão" : "Digite a senha correta"}
          >
            Confirmar
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Historico() {
  const [rows, setRows] = useState<HistoricoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // ADM gate
  const [showGate, setShowGate] = useState(true);
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [checkingAdmin, setCheckingAdmin] = useState<boolean>(false);
  const [adminError, setAdminError] = useState<string | null>(null);

  // filtros & seleção
  const [query, setQuery] = useState("");
  const [serviceFilter, setServiceFilter] = useState<string>("");
  const [dateStart, setDateStart] = useState<string>("");
  const [dateEnd, setDateEnd] = useState<string>("");
  const [selected, setSelected] = useState<Set<number>>(new Set());

  // diretórios auxiliares
  const [emailByUserId, setEmailByUserId] = useState<Record<string, string>>({});
  const [nameByEmail, setNameByEmail] = useState<Record<string, string>>({});

  // carregar histórico
  const load = async () => {
    setLoading(true);
    setErr(null);
    const { data, error } = await supabase
      .from("vw_historico") // ou "historico"
      .select("id,criado_em,acao,tabela,registro_id,dados,usuario_email")
      .order("criado_em", { ascending: false })
      .limit(500);
    if (error) {
      setErr(error.message);
      setLoading(false);
      return;
    }
    setRows((data ?? []) as HistoricoRow[]);
    setLoading(false);
  };

  // gate: verificar ADM pelo próprio registro
  const checkAdmin = async () => {
    setCheckingAdmin(true);
    setAdminError(null);
    try {
      const { data: meRes } = await supabase.auth.getUser();
      const me = meRes?.user;
      if (!me?.email) throw new Error("Sem sessão válida.");
      const { data, error } = await supabase
        .from("app_users")
        .select("email,papel")
        .eq("email", me.email)
        .maybeSingle();
      if (error) throw error;
      const adm = (data?.papel || "").toUpperCase() === "ADM";
      setIsAdmin(adm);
      if (adm) {
        setShowGate(false);
        await load();
      } else {
        setAdminError("Apenas administradores podem acessar o Histórico Administrativo.");
      }
    } catch (e: any) {
      setAdminError(e.message || "Falha ao validar acesso.");
    } finally {
      setCheckingAdmin(false);
    }
  };

  // resolve e-mails ausentes via tabela 'usuario' (id -> email)
  const userIdsFromDados = useMemo(() => {
    const ids = new Set<string>();
    (rows || []).forEach((r) => {
      const id = extractCreatedBy(r.dados);
      if (id) ids.add(id);
    });
    return Array.from(ids);
  }, [rows]);

  const loadMissingEmails = async () => {
    if (userIdsFromDados.length === 0) return;
    try {
      const { data, error } = await supabase
        .from("usuario")
        .select("id,email")
        .in("id", userIdsFromDados);
      if (error) throw error;
      const map: Record<string, string> = {};
      (data as UsuarioRow[]).forEach((u) => {
        if (u.id && u.email) map[u.id] = u.email;
      });
      setEmailByUserId(map);
    } catch {}
  };

  useEffect(() => {
    if (!showGate && isAdmin) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showGate, isAdmin]);

  useEffect(() => {
    if (!showGate && isAdmin) loadMissingEmails();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, showGate, isAdmin]);

  // resolve nomes (app_users.nome)
  const emailsFromRows = useMemo(() => {
    const set = new Set<string>();
    (rows || []).forEach((r) => {
      const createdBy = extractCreatedBy(r.dados);
      const derivedEmail = createdBy ? (emailByUserId[createdBy] ?? null) : null;
      const e = (r.usuario_email ?? derivedEmail);
      if (e) set.add(e);
    });
    return Array.from(set);
  }, [rows, emailByUserId]);

  const loadNames = async () => {
    if (emailsFromRows.length === 0) return;
    try {
      const { data, error } = await supabase
        .from("app_users")
        .select("email,nome")
        .in("email", emailsFromRows);
      if (error) throw error;
      const map: Record<string, string> = {};
      (data as UserSlim[]).forEach((u) => {
        if (u.email) map[u.email] = (u.nome && u.nome.trim()) || nameFromEmailFallback(u.email);
      });
      setNameByEmail(map);
    } catch {
      const map: Record<string, string> = {};
      emailsFromRows.forEach((e) => (map[e] = nameFromEmailFallback(e)));
      setNameByEmail(map);
    }
  };

  useEffect(() => {
    if (!showGate && isAdmin) loadNames();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emailsFromRows.join("|"), showGate, isAdmin]);

  // ====== filtros em memória ======
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const s = serviceFilter.trim().toLowerCase();
    const start = dateStart ? new Date(dateStart + "T00:00:00") : null;
    const end = dateEnd ? new Date(dateEnd + "T23:59:59") : null;

    return rows.filter((r) => {
      // serviço
      if (s) {
        const k = (r.tabela || "").toLowerCase();
        if (
          !(
            (s === "ordens_corte" && k === "ordens_corte") ||
            (s === "ordens_religacao" && k === "ordens_religacao") ||
            (s === "avisos" && (k === "avisos_bairros" || k === "avisos_bairros_base"))
          )
        ) return false;
      }
      // data
      if (start || end) {
        const when = new Date(r.criado_em);
        if (start && when < start) return false;
        if (end && when > end) return false;
      }
      // busca textual
      if (q) {
        const createdBy = extractCreatedBy(r.dados);
        const derivedEmail = createdBy ? (emailByUserId[createdBy] ?? null) : null;
        const email = (r.usuario_email ?? derivedEmail) ?? "";
        const nome = email ? (nameByEmail[email] ?? nameFromEmailFallback(email)) : "";
        const mat = extractMatricula(r.dados) ?? "";
        const blob = `${nome} ${email} ${mat} ${baseServiceLabel(r.tabela)} ${r.acao}`.toLowerCase();
        if (!blob.includes(q)) return false;
      }
      return true;
    });
  }, [rows, query, serviceFilter, dateStart, dateEnd, emailByUserId, nameByEmail]);

  // seleção
  const toggleRow = (id: number) => {
    const n = new Set(selected);
    if (n.has(id)) n.delete(id); else n.add(id);
    setSelected(n);
  };
  const toggleAll = () => {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map((r) => r.id)));
  };

  // ===== ações destrutivas (DELETE no BD) =====
  const [confirm, setConfirm] = useState<null | { title: string; message: string; run: () => Promise<void> }>(null);
  const [busy, setBusy] = useState(false);

  async function doDeleteByIds(ids: number[]) {
    if (ids.length === 0) return;
    setBusy(true);
    try {
      const { data, error } = await supabase
        .from("logs_ordens")
        .delete()
        .in("id", ids)
        .select("id"); // retorna linhas afetadas
      if (error) throw error;
      const deleted = (data ?? []).length;
      if (deleted === 0) {
        alert("Nada apagado (sem permissão RLS/grants ou registros já inexistentes).");
      } else {
        alert(`Apagado(s): ${deleted}`);
      }
      await load();
      setSelected(new Set());
    } catch (e: any) {
      alert("Erro ao excluir: " + (e?.message || e));
    } finally {
      setBusy(false);
    }
  }

  async function doDeleteByDateRange() {
    if (!dateStart && !dateEnd) {
      alert("Defina uma data inicial e/ou final.");
      return;
    }
    setBusy(true);
    try {
      let q = supabase.from("logs_ordens").delete();
      if (dateStart) q = q.gte("criado_em", dateStart + "T00:00:00");
      if (dateEnd) q = q.lte("criado_em", dateEnd + "T23:59:59");
      const { data, error } = await q.select("id");
      if (error) throw error;
      const deleted = (data ?? []).length;
      if (deleted === 0) alert("Nada apagado por data (possível RLS/grants).");
      else alert(`Apagado(s) por data: ${deleted}`);
      await load();
      setSelected(new Set());
    } catch (e: any) {
      alert("Erro ao excluir por data: " + (e?.message || e));
    } finally {
      setBusy(false);
    }
  }

  async function doDeleteByService() {
    let key = serviceFilter;
    if (!key) {
      alert("Escolha um serviço no filtro para apagar por serviço.");
      return;
    }
    setBusy(true);
    try {
      let q = supabase.from("logs_ordens").delete();
      if (key === "ordens_corte") q = q.eq("tabela", "ordens_corte");
      else if (key === "ordens_religacao") q = q.eq("tabela", "ordens_religacao");
      else if (key === "avisos") q = q.in("tabela", ["avisos_bairros", "avisos_bairros_base"]);
      const { data, error } = await q.select("id");
      if (error) throw error;
      const deleted = (data ?? []).length;
      if (deleted === 0) alert("Nada apagado por serviço (possível RLS/grants).");
      else alert(`Apagado(s) por serviço: ${deleted}`);
      await load();
      setSelected(new Set());
    } catch (e: any) {
      alert("Erro ao excluir por serviço: " + (e?.message || e));
    } finally {
      setBusy(false);
    }
  }

  async function doDeleteByUser(email: string) {
    try {
      const { data, error } = await supabase
        .from("app_users")
        .select("id")
        .eq("email", email)
        .maybeSingle();
      if (error) throw error;
      const uid = (data && (data as any).id) as string | undefined;
      if (!uid) throw new Error("Usuário não encontrado.");
      setBusy(true);
      const { data: del, error: delErr } = await supabase
        .from("logs_ordens")
        .delete()
        .eq("usuario", uid)
        .select("id");
      if (delErr) throw delErr;
      const deleted = (del ?? []).length;
      if (deleted === 0) alert("Nada apagado por usuário (possível RLS/grants).");
      else alert(`Apagado(s) do usuário: ${deleted}`);
      await load();
      setSelected(new Set());
    } catch (e: any) {
      alert("Erro ao excluir por usuário: " + (e?.message || e));
    } finally {
      setBusy(false);
    }
  }

  async function doDeleteAll() {
    setBusy(true);
    try {
      const { data, error } = await supabase
        .from("logs_ordens")
        .delete()
        .gt("id", 0)
        .select("id");
      if (error) throw error;
      const deleted = (data ?? []).length;
      if (deleted === 0) alert("Nada apagado (tabela vazia ou sem permissão RLS/grants).");
      else alert(`Apagado(s) no total: ${deleted}`);
      await load();
      setSelected(new Set());
    } catch (e: any) {
      alert("Erro ao excluir tudo: " + (e?.message || e));
    } finally {
      setBusy(false);
    }
  }

  // export CSV (compatível com ES2015+)
  function exportCsv() {
    const header = ["id","data_hora","usuario","servico","matricula","frase"];

    const esc = (v: any) => {
      const s = String(v).replace(/"/g, '""');
      return `"${s}"`;
    };

    const lines = filtered.map((r) => {
      const createdBy = extractCreatedBy(r.dados);
      const derivedEmail = createdBy ? (emailByUserId[createdBy] ?? null) : null;
      const email = (r.usuario_email ?? derivedEmail) ?? null;
      const userName =
        (email && nameByEmail[email]) ? nameByEmail[email] : nameFromEmailFallback(email);

      const when = dtf.format(new Date(r.criado_em)).replace(/,/g, "");
      const baseService = baseServiceLabel(r.tabela);
      const verb = verbFromRow(r);
      const matricula = extractMatricula(r.dados) ?? "";
      const frase = `${userName} ${verb} ${baseService} na matrícula ${matricula}`;

      return [r.id, when, userName, baseService, matricula, frase].map(esc).join(",");
    });

    const csv = [header.join(","), ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "historico.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  // ====== UI ======
  if (showGate) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="bg-slate-800 rounded-xl p-6 w-full max-w-md shadow-xl">
          <h2 className="text-xl font-bold mb-2 text-cyan-300">Área restrita</h2>
          <p className="text-slate-300 mb-4">
            Apenas administradores podem visualizar e apagar o histórico.
          </p>
          {adminError && <p className="text-rose-300 mb-3">{adminError}</p>}
          <div className="flex justify-end gap-2">
            <button
              onClick={checkAdmin}
              disabled={checkingAdmin}
              className="px-4 py-2 rounded bg-cyan-600 hover:bg-cyan-700 text-white"
            >
              {checkingAdmin ? "Verificando..." : "Entrar (verificar ADM)"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-rose-300">
          Acesso negado: você não é administrador.
        </div>
      </div>
    );
  }

  if (loading) {
    return <div className="min-h-[60vh] flex items-center justify-center text-slate-400">Carregando histórico…</div>;
  }
  if (err) {
    return <div className="min-h-[60vh] flex items-center justify-center text-rose-300">Erro: {err}</div>;
  }

  const allChecked = selected.size === filtered.length && filtered.length > 0;

  return (
    <div className="space-y-6">
      {/* Título + ações */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:gap-4">
        <h1 className="text-2xl font-bold">Histórico (ADM)</h1>
        <div className="ml-auto flex flex-wrap gap-2">
          <button
            onClick={exportCsv}
            className="px-3 py-2 rounded bg-slate-700 hover:bg-slate-600"
            title="Exportar CSV (apenas os registros filtrados)"
          >
            Exportar CSV
          </button>

          <button
            disabled={selected.size === 0 || busy}
            onClick={() =>
              setConfirm({
                title: `Apagar ${selected.size} registro(s) selecionado(s)`,
                message: "Esta ação é permanente.",
                run: async () => {
                  setConfirm(null);
                  await doDeleteByIds(Array.from(selected));
                },
              })
            }
            className={`px-3 py-2 rounded ${selected.size ? "bg-rose-600 hover:bg-rose-700" : "bg-rose-900/40"} text-white`}
          >
            Apagar selecionados
          </button>

          <button
            disabled={busy}
            onClick={() =>
              setConfirm({
                title: `Apagar por data`,
                message: `Confirma apagar registros entre ${dateStart || "início"} e ${dateEnd || "fim"}?`,
                run: async () => {
                  setConfirm(null);
                  await doDeleteByDateRange();
                },
              })
            }
            className="px-3 py-2 rounded bg-rose-600 hover:bg-rose-700 text-white"
          >
            Apagar por data
          </button>

          <button
            disabled={busy || !serviceFilter}
            onClick={() =>
              setConfirm({
                title: `Apagar por serviço`,
                message: `Confirma apagar todos os registros do serviço selecionado?`,
                run: async () => {
                  setConfirm(null);
                  await doDeleteByService();
                },
              })
            }
            className={`px-3 py-2 rounded ${serviceFilter ? "bg-rose-600 hover:bg-rose-700" : "bg-rose-900/40"} text-white`}
          >
            Apagar por serviço
          </button>

          <button
            disabled={busy}
            onClick={async () => {
              const anyEmail = filtered
                .map((r) => {
                  const createdBy = extractCreatedBy(r.dados);
                  const derivedEmail = createdBy ? (emailByUserId[createdBy] ?? null) : null;
                  return (r.usuario_email ?? derivedEmail) ?? null;
                })
                .find(Boolean);
              const email = window.prompt("Digite o e-mail do usuário para apagar os registros:", anyEmail || "");
              if (!email) return;
              setConfirm({
                title: `Apagar por usuário (${email})`,
                message: `Confirma apagar todos os registros do usuário informado?`,
                run: async () => {
                  setConfirm(null);
                  await doDeleteByUser(email);
                },
              });
            }}
            className="px-3 py-2 rounded bg-rose-600 hover:bg-rose-700 text-white"
          >
            Apagar por usuário
          </button>

          <button
            disabled={busy}
            onClick={() =>
              setConfirm({
                title: "APAGAR TUDO",
                message: "Isso removerá TODOS os registros de histórico. Esta ação é permanente.",
                run: async () => {
                  setConfirm(null);
                  await doDeleteAll();
                },
              })
            }
            className="px-3 py-2 rounded bg-rose-700 hover:bg-rose-800 text-white"
          >
            APAGAR TUDO
          </button>
        </div>
      </div>

      {/* Filtros */}
      <div className="rounded-xl p-4 bg-slate-900/50 ring-1 ring-slate-800 grid grid-cols-1 md:grid-cols-5 gap-3">
        <input
          placeholder="Buscar: nome/email/matrícula"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="p-2 rounded bg-slate-900 border border-slate-700 md:col-span-2"
        />
        <select
          value={serviceFilter}
          onChange={(e) => setServiceFilter(e.target.value)}
          className="p-2 rounded bg-slate-900 border border-slate-700"
        >
          <option value="">Todos os serviços</option>
          <option value="ordens_corte">Ordem de corte</option>
          <option value="ordens_religacao">Papeleta de religação</option>
          <option value="avisos">Aviso de bairro</option>
        </select>
        <input type="date" value={dateStart} onChange={(e) => setDateStart(e.target.value)}
          className="p-2 rounded bg-slate-900 border border-slate-700" />
        <input type="date" value={dateEnd} onChange={(e) => setDateEnd(e.target.value)}
          className="p-2 rounded bg-slate-900 border border-slate-700" />
      </div>

      {/* Tabela */}
      <div className="rounded-xl overflow-hidden ring-1 ring-slate-800">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-900/60 text-slate-300">
            <tr>
              <th className="px-3 py-3 w-8">
                <input
                  type="checkbox"
                  checked={allChecked}
                  onChange={toggleAll}
                />
              </th>
              <th className="px-4 py-3">Data e hora</th>
              <th className="px-4 py-3">Usuário</th>
              <th className="px-4 py-3">Serviço</th>
              <th className="px-4 py-3">Matrícula</th>
              <th className="px-4 py-3">Registro</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {filtered.map((r) => {
              const when = dtf.format(new Date(r.criado_em));
              const createdBy = extractCreatedBy(r.dados);
              const derivedEmail = createdBy ? (emailByUserId[createdBy] ?? null) : null;
              const email = (r.usuario_email ?? derivedEmail) ?? null;
              const userName = (email && nameByEmail[email]) ? nameByEmail[email] : nameFromEmailFallback(email);
              const baseService = baseServiceLabel(r.tabela);
              const verb = verbFromRow(r);
              const matricula = extractMatricula(r.dados) ?? "—";
              const frase = `${userName} ${verb} ${baseService} na matrícula ${matricula}`;
              const checked = selected.has(r.id);

              return (
                <tr key={r.id} className="hover:bg-slate-900/30">
                  <td className="px-3 py-3">
                    <input type="checkbox" checked={checked} onChange={() => toggleRow(r.id)} />
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-slate-200">{when}</td>
                  <td className="px-4 py-3 text-slate-200">{userName}</td>
                  <td className="px-4 py-3 capitalize text-slate-200">{baseService}</td>
                  <td className="px-4 py-3 font-mono text-slate-100">{matricula}</td>
                  <td className="px-4 py-3 text-slate-300">{frase}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Modal de confirmação destrutiva */}
      {confirm && (
        <ConfirmModal
          title={confirm.title}
          message={confirm.message}
          onCancel={() => setConfirm(null)}
          onConfirm={async () => {
            await confirm.run();
          }}
        />
      )}
    </div>
  );
}
