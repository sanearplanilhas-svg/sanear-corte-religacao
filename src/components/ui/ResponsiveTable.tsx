import * as React from "react";
import useBreakpoint from "../../hooks/useBreakpoint";

export type Column<Row> = {
  /** ID única da coluna */
  id: string;
  /** Cabeçalho da coluna (título) */
  header: React.ReactNode;
  /** Conteúdo da célula */
  cell: (row: Row, index: number) => React.ReactNode;
  /** Classe Tailwind aplicada à <td> */
  className?: string;
  /** Classe Tailwind aplicada ao <th> */
  headerClassName?: string;
  /** Largura base da coluna no desktop (ex.: "w-40"). Evite comentários/whitespace em <colgroup>. */
  widthClassName?: string;
  /** Esconder esta informação no cartão mobile */
  hideOnMobile?: boolean;
  /** Rótulo para o cartão (mobile). Se não informado, tenta derivar do header (string) */
  mobileLabel?: string;
};

export type ResponsiveTableProps<Row> = {
  data: Row[];
  columns: Column<Row>[];
  /** Chave única por linha (id) */
  rowKey: (row: Row, index: number) => string;
  /** Mensagem quando não houver dados */
  emptyMessage?: string;
  /** Mostrar estado de carregamento no botão/área externa */
  loading?: boolean;
  /** Breakpoint a partir do qual mostra tabela (default: "md") */
  tableFrom?: "sm" | "md" | "lg";
  /** Classe da <table> */
  tableClassName?: string;
  /** Classe do wrapper com scroll horizontal */
  scrollClassName?: string;
  /** Classe do card (mobile) */
  cardClassName?: string;
};

/**
 * Componente responsivo:
 * - < md (ou breakpoint configurado): mostra cartões empilhados
 * - >= md: mostra tabela com colgroup configurável
 */
export default function ResponsiveTable<Row>({
  data,
  columns,
  rowKey,
  emptyMessage = "Nenhum registro encontrado.",
  loading = false,
  tableFrom = "md",
  tableClassName = "w-full text-sm table-auto",
  scrollClassName = "rounded-xl overflow-x-auto ring-1 ring-white/10",
  cardClassName = "rounded-xl bg-slate-950/40 ring-1 ring-white/10 p-4",
}: ResponsiveTableProps<Row>) {
  const bp = useBreakpoint();

  const isTable =
    tableFrom === "sm" ? bp.isSm : tableFrom === "md" ? bp.isMd : bp.isLg;

  // Deriva labels de mobile
  const safeColumns = React.useMemo(() => {
    return columns.map((c) => {
      let mobileLabel = c.mobileLabel;
      if (!mobileLabel) {
        if (typeof c.header === "string") mobileLabel = c.header;
        else if (React.isValidElement(c.header)) {
          const txt =
            typeof (c.header as any).props?.children === "string"
              ? (c.header as any).props.children
              : "";
          mobileLabel = txt || c.id;
        } else {
          mobileLabel = c.id;
        }
      }
      return { ...c, mobileLabel };
    });
  }, [columns]);

  if (!data || data.length === 0) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/5 p-6 text-center text-slate-400">
        {loading ? "Carregando…" : emptyMessage}
      </div>
    );
  }

  if (!isTable) {
    // ====== MOBILE: CARDS ======
    return (
      <div className="grid gap-3">
        {data.map((row, idx) => {
          const id = rowKey(row, idx);
          return (
            <div key={id} className={cardClassName}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {safeColumns.map((col) => {
                  if (col.hideOnMobile) return null;
                  return (
                    <div key={col.id} className="min-w-0">
                      <div className="text-[11px] uppercase tracking-wide text-slate-400">
                        {col.mobileLabel}
                      </div>
                      <div className="mt-0.5 text-slate-200 break-words">
                        {col.cell(row, idx)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  // ====== DESKTOP: TABELA ======
  // Monta colgroup sem whitespace/comentários dentro (evita warning do React)
  const colEls = safeColumns.map((c) => {
    const cls = c.widthClassName ? c.widthClassName : undefined;
    return <col key={c.id} className={cls} />;
  });

  return (
    <div className={scrollClassName}>
      <table className={tableClassName}>
        <colgroup>{colEls}</colgroup>
        <thead className="bg-white/5 text-slate-300">
          <tr>
            {safeColumns.map((c) => (
              <th key={c.id} className={`text-left font-medium py-2 px-3 ${c.headerClassName || ""}`}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-white/10">
          {data.map((row, idx) => {
            const id = rowKey(row, idx);
            return (
              <tr key={id} className="bg-slate-950/40 align-middle">
                {safeColumns.map((c) => (
                  <td key={c.id} className={`py-2 px-3 ${c.className || ""}`}>
                    {c.cell(row, idx)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
