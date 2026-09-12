import React from 'react';

export default function EmptyState({ icon = '✨', title, description, action }) {
  return (
    <div className="card p-10 text-center flex flex-col items-center gap-3">
      <div className="text-4xl">{icon}</div>
      <h3 className="font-semibold text-slate-800">{title}</h3>
      {description && <p className="text-sm text-slate-500 max-w-sm">{description}</p>}
      {action}
    </div>
  );
}
