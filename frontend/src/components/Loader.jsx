import React from 'react';

export default function Loader({ label = 'Loading...' }) {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-slate-500">
      <div className="w-5 h-5 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
      <span className="text-sm">{label}</span>
    </div>
  );
}
