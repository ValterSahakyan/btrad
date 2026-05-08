import { ReactNode } from 'react';
import { Card } from '../ui/card';

export function DataTable({
  title,
  headers,
  rows,
}: {
  title: string;
  headers: string[];
  rows: ReactNode[][];
}) {
  return (
    <Card>
      <div className="mb-4 flex items-center justify-between">
        <div className="text-lg font-semibold">{title}</div>
        {rows.length > 0 && (
          <div className="rounded-full bg-white/10 px-2.5 py-0.5 text-xs text-muted">{rows.length}</div>
        )}
      </div>
      {rows.length === 0 ? (
        <div className="py-8 text-center text-sm text-muted">No data</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="app-table min-w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 text-left text-muted">
                {headers.map((header) => (
                  <th key={header} className="px-3 py-2 font-medium">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIndex) => (
                <tr key={rowIndex} className="border-b border-white/5 last:border-none hover:bg-white/[0.02]">
                  {row.map((cell, cellIndex) => (
                    <td key={cellIndex} className="px-3 py-3">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
