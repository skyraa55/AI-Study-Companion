import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/axios';
import Loader from '../components/Loader';
import EmptyState from '../components/EmptyState';
import ProgressBar from '../components/ProgressBar';

const ICONS = ['book', 'code', 'palette', 'flask', 'target', 'chat', 'chart', 'music', 'scale', 'build'];

function SpaceIcon({ name, className = 'w-5 h-5' }) {
  const common = {
    className,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.7,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
  };
  switch (name) {
    case 'book':
      return (
        <svg {...common}>
          <path d="M12 6.5C10.4 5 7.7 4.3 5 4.2v14c2.7.1 5.4.8 7 2.3 1.6-1.5 4.3-2.2 7-2.3v-14c-2.7.1-5.4.8-7 2.3z" />
        </svg>
      );
    case 'code':
      return (
        <svg {...common}>
          <path d="M8.5 9L5 12l3.5 3M15.5 9L19 12l-3.5 3M13 7l-2 10" />
        </svg>
      );
    case 'palette':
      return (
        <svg {...common}>
          <path d="M12 3a9 8 0 100 16c1.1 0 1.7-.9 1.7-1.8 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.2 0-.9.7-1.6 1.6-1.6H16a4 4 0 004-4c0-4.4-3.6-6.2-8-6.2z" />
          <circle cx="7.5" cy="10.5" r="0.9" fill="currentColor" stroke="none" />
          <circle cx="10.5" cy="7.5" r="0.9" fill="currentColor" stroke="none" />
          <circle cx="14.5" cy="7.8" r="0.9" fill="currentColor" stroke="none" />
        </svg>
      );
    case 'flask':
      return (
        <svg {...common}>
          <path d="M9.5 3h5M10 3v5.8L5.8 16.6A2 2 0 007.5 19.6h9a2 2 0 001.7-3L14 8.8V3" />
          <path d="M8.3 14.5h7.4" />
        </svg>
      );
    case 'target':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8" />
          <circle cx="12" cy="12" r="4.5" />
          <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
        </svg>
      );
    case 'chat':
      return (
        <svg {...common}>
          <path d="M4.5 5h15a1 1 0 011 1v9a1 1 0 01-1 1H9l-4.5 3.5V17H4.5a1 1 0 01-1-1V6a1 1 0 011-1z" />
        </svg>
      );
    case 'chart':
      return (
        <svg {...common}>
          <path d="M5 19V10M12 19V5M19 19v-7" />
        </svg>
      );
    case 'music':
      return (
        <svg {...common}>
          <path d="M9 18V5l11-2v13" />
          <circle cx="7" cy="18" r="2.4" />
          <circle cx="18" cy="16" r="2.4" />
        </svg>
      );
    case 'scale':
      return (
        <svg {...common}>
          <path d="M12 3v18M5 8h14M12 3L6 8M12 3l6 5" />
          <path d="M2.5 14a3.5 3.5 0 007 0L6 8l-3.5 6zM14.5 14a3.5 3.5 0 007 0L18 8l-3.5 6z" />
        </svg>
      );
    case 'build':
      return (
        <svg {...common}>
          <path d="M4 21h16M6 21V9l6-5 6 5v12" />
          <path d="M10 21v-6h4v6" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <path d="M12 3l1.9 5.8L19.8 10l-5.9 1.2L12 17l-1.9-5.8L4.2 10l5.9-1.2L12 3z" />
        </svg>
      );
  }
}

export default function Dashboard() {
  const [spaces, setSpaces] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', icon: ICONS[0] });
  const [creating, setCreating] = useState(false);

  const loadSpaces = () => {
    api.get('/spaces').then((res) => setSpaces(res.data.spaces));
  };

  useEffect(loadSpaces, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setCreating(true);
    try {
      await api.post('/spaces', form);
      setForm({ name: '', description: '', icon: ICONS[0] });
      setShowForm(false);
      loadSpaces();
    } finally {
      setCreating(false);
    }
  };

  if (!spaces) return <Loader label="Loading your Spaces..." />;

  return (
    <div>
      <style>{`
        @keyframes fadeSlideUp {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes cardPop {
          from { opacity: 0; transform: translateY(-6px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        .dash-enter { animation: fadeSlideUp 0.45s ease-out both; }
        .form-pop { animation: cardPop 0.28s cubic-bezier(0.4,0,0.2,1) both; }
        .space-card { animation: fadeSlideUp 0.45s ease-out both; }
      `}</style>

      <div className="dash-enter flex items-center justify-between mb-7">
        <div>
          <h1
            className="text-2xl font-semibold text-indigo-950 tracking-tight"
            style={{ fontFamily: "'Lora', Georgia, serif" }}
          >
            Your Spaces
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">Organize your learning into broad areas of growth.</p>
        </div>
        <button
          onClick={() => setShowForm((s) => !s)}
          className="group relative flex items-center gap-1.5 overflow-hidden rounded-xl bg-indigo-700 px-4 py-2.5 text-sm font-medium text-white shadow-md shadow-indigo-700/25 transition-transform duration-200 hover:-translate-y-0.5 active:scale-[0.98]"
        >
          <span className="absolute inset-0 -z-10 bg-gradient-to-r from-indigo-600 to-violet-600 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
          New Space
        </button>
      </div>

      {showForm && (
        <form
          onSubmit={handleCreate}
          className="form-pop bg-white rounded-2xl border border-indigo-100/70 shadow-[0_12px_30px_-15px_rgba(67,56,202,0.25)] p-6 mb-7 space-y-4"
        >
          <div>
            <p className="text-xs font-medium text-slate-500 mb-2">Choose an icon</p>
            <div className="flex gap-2 flex-wrap">
              {ICONS.map((icon) => {
                const active = form.icon === icon;
                return (
                  <button
                    type="button"
                    key={icon}
                    onClick={() => setForm((f) => ({ ...f, icon }))}
                    className={`w-10 h-10 rounded-xl border flex items-center justify-center transition-all duration-200 ${
                      active
                        ? 'border-transparent bg-gradient-to-br from-indigo-600 to-violet-600 text-white shadow-md shadow-indigo-600/30 scale-105'
                        : 'border-slate-200 text-slate-500 hover:border-indigo-300 hover:text-indigo-600 hover:-translate-y-0.5'
                    }`}
                  >
                    <SpaceIcon name={icon} className="w-4.5 h-4.5" />
                  </button>
                );
              })}
            </div>
          </div>

          <input
            className="w-full rounded-xl border border-slate-200 bg-slate-50/60 px-3.5 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-4 focus:ring-indigo-100"
            placeholder="Space name (e.g. Frontend Engineering)"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            required
          />
          <textarea
            className="w-full rounded-xl border border-slate-200 bg-slate-50/60 px-3.5 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-4 focus:ring-indigo-100"
            placeholder="What is this Space about? (optional)"
            rows={2}
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          />
          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              disabled={creating}
              className="rounded-xl bg-indigo-700 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-indigo-800 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {creating ? 'Creating...' : 'Create Space'}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {spaces.length === 0 ? (
        <EmptyState
          icon={<SpaceIcon name="book" className="w-7 h-7" />}
          title="No Spaces yet"
          description="Create your first Space to start organizing your learning journey - a skill, subject, or long-term goal."
          action={
            <button
              onClick={() => setShowForm(true)}
              className="mt-2 rounded-xl bg-indigo-700 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-indigo-800"
            >
              Create your first Space
            </button>
          }
        />
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {spaces.map((space, i) => (
            <Link
              key={space._id}
              to={`/spaces/${space._id}`}
              style={{ animationDelay: `${i * 45}ms` }}
              className="space-card group block rounded-2xl border border-slate-100 bg-white p-5 transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_16px_32px_-16px_rgba(67,56,202,0.35)] hover:border-indigo-100"
            >
              <div className="flex items-center gap-3 mb-2">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center transition-transform duration-300 group-hover:scale-110"
                  style={{ backgroundColor: `${space.color}20`, color: space.color }}
                >
                  <SpaceIcon name={space.icon} className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-800">{space.name}</h3>
                  <p className="text-xs text-slate-500">{space.stats?.projectCount || 0} project(s)</p>
                </div>
              </div>
              {space.description && <p className="text-sm text-slate-500 mb-3 line-clamp-2">{space.description}</p>}
              <ProgressBar value={space.stats?.overallProgress || 0} />
              <p className="text-xs text-slate-400 mt-1">{space.stats?.overallProgress || 0}% overall progress</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}