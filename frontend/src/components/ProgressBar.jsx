import React from 'react';

export default function ProgressBar({ value = 0, colorClass = 'bg-brand-500' }) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
      <div className={`h-full ${colorClass} rounded-full transition-all`} style={{ width: `${clamped}%` }} />
    </div>
  );
}
