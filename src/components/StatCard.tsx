import React from 'react';

export default function StatCard({ title, value, accent }: { title: string; value: string; accent: 'rose'|'orange'|'green'|'cyan' }) {
  const map = {
    rose: 'from-rose-500/90 to-pink-500/90',
    orange: 'from-orange-500/90 to-amber-500/90',
    green: 'from-emerald-500/90 to-lime-500/90',
    cyan: 'from-cyan-500/90 to-sky-500/90',
  } as const;
  return (
    <div className="rounded-2xl bg-slate-900/50 p-4 ring-1 ring-white/10">
      <div className={`inline-flex mb-3 rounded-xl px-3 py-2 text-sm font-semibold text-white bg-gradient-to-br ${map[accent]}`}>{title}</div>
      <div className="text-3xl font-bold text-white">{value}</div>
    </div>
  )
}
