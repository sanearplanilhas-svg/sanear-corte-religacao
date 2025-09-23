import * as React from "react";
import supabase from "../lib/supabase";

type HistRow = {
  id: number;
  criado_em: string;
  acao: string;
  tabela: string;
  registro_id: string;
  dados: any;
  usuario_email: string | null;
};

export default function Historico() {
  const [rows, setRows] = React.useState<HistRow[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      // 1) Preferir a view (já traz email sem depender de embed/RLS de app_users)
      let { data, error } = await supabase
        .from("vw_historico")
        .select("*")
        .order("criado_em", { ascending: false })
        .limit(500);

      // 2) fallback: alias "historico"
      if (error) {
        const alt = await supabase
          .from("historico")
          .select("*")
          .order("criado_em", { ascending: false })
          .limit(500);

        if (alt.error) {
          setErr(alt.error.message);
          setRows([]);
          return;
        }
        setRows((alt.data ?? []) as HistRow[]);
        return;
      }

      setRows((data ?? []) as HistRow[]);
    } catch (e: any) {
      setErr(e?.message ?? "Falha ao carregar histórico.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    load();
  }, []);

  if (loading) return <div className="p-4 text-slate-300">Carregando…</div>;
  if (err) return <div className="p-4 text-rose-300">Erro: {err}</div>;
  if (rows.length === 0) return <div className="p-4 text-slate-400">Sem registros.</div>;

  return (
    <div className="p-4">
      <h1 className="text-lg font-semibold mb-3">Histórico de atividades</h1>
      <div className="rounded-xl overflow-x-auto ring-1 ring-white/10">
        <table className="w-full text-sm table-auto">
          <thead className="bg-white/5 text-slate-300">
            <tr>
              <th className="text-left py-2 px-3">Data/Hora</th>
              <th className="text-left py-2 px-3">Usuário</th>
              <th className="text-left py-2 px-3">Tabela</th>
              <th className="text-left py-2 px-3">Ação</th>
              <th className="text-left py-2 px-3">Registro</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {rows.map((r) => (
              <tr key={r.id} className="bg-slate-950/40">
                <td className="py-2 px-3 whitespace-nowrap">
                  {new Date(r.criado_em).toLocaleString("pt-BR")}
                </td>
                <td className="py-2 px-3">{r.usuario_email ?? "—"}</td>
                <td className="py-2 px-3">{r.tabela}</td>
                <td className="py-2 px-3">{r.acao}</td>
                <td className="py-2 px-3 font-mono text-xs">{r.registro_id}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
