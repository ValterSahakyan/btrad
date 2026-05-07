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
      <div className="mb-4 text-lg font-semibold">{title}</div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
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
              <tr key={rowIndex} className="border-b border-white/5 last:border-none">
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
    </Card>
  );
}
