import * as React from "react";
import useBreakpoint from "../../hooks/useBreakpoint";

export type ColumnDef<T> = {
  /** chave única da coluna */
  key: string;
  /** rótulo para cabeçalho (desktop) e para linha empilhada (mobile) */
  header: string;
  /** Render opcional; se ausente, mostra row[key] */
  render?: (row: T, index: number) => React.ReactNode;
  /** classes utilitárias (aplicadas à célula no desktop) */
  className?: string;
  /** largura (desktop) usada em <col> (ex.: "w-40" ou "w-[300px]") */
  widthClassName?: string;
  /** esconder coluna no mobile (ex.: colunas auxiliares) */
  hideOnMobile?: boolean;
};

type ResponsiveDataTableProps<T> = {
  rows: T[];
  columns: ColumnDef<T>[];
  /** id único da linha (string) */
  rowKey: (row: T, index: number) => string;
  /** quando true, exibe uma faixa de “Carregando…” */
  loading?: boolean;
  /** mensagem quando não houver linhas */
  emptyMessage?: string;
  /** classes adicionais do container */
  className?: string;
  /** classe extra na tabela (desktop) */
  tableClassName?: string;
  /** cabeçalho fixo no desktop */
  stickyHeader?: boolean;
  /** slot de ações por linha (à direita no desktop e rodapé no mobile) */
  rowActions?: (row: T, index: number) => React.ReactNode;
};

/**
 * Tabela responsiva:
 * - >= md: table com thead/colgroup; suporta larguras por coluna
 * - <  md: lista de “cards” com pares Label/Valor (linhas empilhadas)
 *
 * Observações:
 * - Evita whitespace dentro do <colgroup> (elimina warning de validação)
 * - Não aplica estilos opinativos; só util classes base e props de largura
 */
export default function ResponsiveDataTable<T>({
  rows,
  columns,
  rowKey,
  loading = false,
  emptyMessage = "Nenhum registro.",
  className = "",
  tableClassName = "",
  stickyHeader = false,
  rowActions,
}: ResponsiveDataTableProps<T>) {
  const { isMd } = useBreakpoint();

  // ===== Desktop (table) =====
  if (isMd) {
    return (
      <div className={`rounded-xl overflow-x-auto ring-1 ring-white/10 ${className}`}>
        <table className={`w-full text-sm table-auto ${tableClassName}`}>
          {/* colgroup: sem whitespaces entre <col/> para evitar warning */}
          <colgroup>
            {columns.map((c) => (
              <col key={c.key} className={c.widthClassName || ""} />
            ))}
            {rowActions ? <col className="w-40" /> : null}
          </colgroup>

          <thead className={`bg-white/5 text-slate-300 ${stickyHeader ? "sticky top-0 z-10" : ""}`}>
            <tr>
              {columns.map((c) => (
                <th key={c.key} className="text-left font-medium py-2 px-3">
                  {c.header}
                </th>
              ))}
              {rowActions ? (
                <th className="text-right font-medium py-2 px-3">Ações</th>
              ) : null}
            </tr>
          </thead>

          <tbody className="divide-y divide-white/10">
            {loading ? (
              <tr>
                <td colSpan={columns.length + (rowActions ? 1 : 0)} className="py-6 px-3 text-slate-400">
                  Carregando…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length + (rowActions ? 1 : 0)} className="py-6 px-3 text-center text-slate-400">
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              rows.map((row, idx) => (
                <tr key={rowKey(row, idx)} className="bg-slate-950/40 align-middle">
                  {columns.map((c) => (
                    <td key={c.key} className={`py-2 px-3 ${c.className || ""}`}>
                      {c.render ? c.render(row, idx) : (row as any)[c.key]}
                    </td>
                  ))}
                  {rowActions ? (
                    <td className="py-2 px-3 text-right whitespace-nowrap">
                      {rowActions(row, idx)}
                    </td>
                  ) : null}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    );
  }

  // ===== Mobile (stacked cards) =====
  const visibleCols = columns.filter((c) => !c.hideOnMobile);

  return (
    <div className={`space-y-3 ${className}`}>
      {loading ? (
        <div className="text-sm text-slate-400 px-1">Carregando…</div>
      ) : rows.length === 0 ? (
        <div className="text-sm text-slate-400 px-1">{emptyMessage}</div>
      ) : (
        rows.map((row, idx) => (
          <div
            key={rowKey(row, idx)}
            className="rounded-xl bg-slate-950/60 ring-1 ring-white/10 p-3"
          >
            <dl className="grid grid-cols-1 gap-2">
              {visibleCols.map((c) => (
                <div key={c.key} className="flex items-start justify-between gap-3">
                  <dt className="text-[12px] text-slate-400 mt-1">{c.header}</dt>
                  <dd className="text-sm text-slate-200 text-right break-words">
                    {c.render ? c.render(row, idx) : (row as any)[c.key]}
                  </dd>
                </div>
              ))}
            </dl>

            {rowActions ? (
              <div className="mt-3 pt-2 border-t border-white/10 flex justify-end">
                <div className="flex items-center gap-2">{rowActions(row, idx)}</div>
              </div>
            ) : null}
          </div>
        ))
      )}
    </div>
  );
}
