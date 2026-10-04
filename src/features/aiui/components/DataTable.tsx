'use client';

import type { ViewProps } from './types';

export default function DataTable({ columns, rows, density = 'screen' }: ViewProps<{ columns: string[]; rows: (string | number)[][] }>) {
    const cellCls = density === 'card' ? 'px-2 py-1.5' : 'px-4 py-2';
    return (
        <div className="overflow-x-auto rounded-xl border border-white/10 bg-white/[0.03]">
            <table className={`w-full text-left ${density === 'card' ? 'text-[12px]' : 'text-[13px]'}`}>
                <thead>
                    <tr className="border-b border-white/10 text-[11px] uppercase tracking-wider text-white/40">
                        {columns.map((c) => <th key={c} className={`${cellCls} font-normal`}>{c}</th>)}
                    </tr>
                </thead>
                <tbody>
                    {rows.map((r, i) => (
                        <tr key={i} className="border-b border-white/5 last:border-0">
                            {r.map((cell, j) => (
                                <td key={j} className={`${cellCls} ${typeof cell === 'number' ? 'font-mono text-cyan-200' : 'text-white/80'}`}>
                                    {typeof cell === 'number' ? cell.toLocaleString('pl-PL') : cell}
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
