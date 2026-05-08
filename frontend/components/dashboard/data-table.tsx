import { ReactNode } from 'react';

export function DataTable({
  title,
  headers,
  rows,
  action,
}: {
  title: string;
  headers: string[];
  rows: ReactNode[][];
  action?: ReactNode;
}) {
  return (
    <div className="panel flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
        <span className="text-[12px] font-semibold text-white">{title}</span>
        <div className="flex items-center gap-2">
          {rows.length > 0 && (
            <span className="text-[11px] font-mono text-dim">{rows.length}</span>
          )}
          {action}
        </div>
      </div>
      {rows.length === 0 ? (
        <div className="py-10 text-center text-[12px] text-dim">No data</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="t-table">
            <thead>
              <tr>
                {headers.map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i}>
                  {row.map((cell, j) => (
                    <td key={j}>{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
