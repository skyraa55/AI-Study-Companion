import React from 'react';

/**
 * Minimal bar-style trend visualization for Analytics "Trends" sections
 * (PRD 34/36). No charting library dependency - just proportional bars with
 * a native title tooltip, consistent with the rest of the app's lightweight
 * component style.
 */
export default function MiniTrendChart({ data, valueKey, labelKey = 'date', color = 'bg-brand-500', formatValue, formatLabel }) {
  if (!data || data.length === 0) {
    return <p className="text-xs text-slate-400">Not enough data yet.</p>;
  }

  const max = Math.max(...data.map((d) => d[valueKey]), 1);

  return (
    <div className="flex items-end gap-1 h-20">
      {data.map((d, i) => {
        const value = d[valueKey] || 0;
        const height = value > 0 ? Math.max((value / max) * 100, 6) : 2;
        const label = formatLabel ? formatLabel(d[labelKey]) : d[labelKey];
        return (
          <div
            key={i}
            className="flex-1 h-full flex items-end"
            title={`${label}: ${formatValue ? formatValue(value) : value}`}
          >
            <div className={`${color} rounded-sm w-full transition-all`} style={{ height: `${height}%` }} />
          </div>
        );
      })}
    </div>
  );
}