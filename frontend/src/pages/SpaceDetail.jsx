import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import api from '../api/axios';
import Loader from '../components/Loader';
import EmptyState from '../components/EmptyState';
import ProgressBar from '../components/ProgressBar';

// Small inline icon set — keeps the file dependency-free while dropping the emojis.
const IconAlert = (props) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
    <line x1="12" y1="9" x2="12" y2="13" />
    <line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
);

const IconTarget = (props) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="12" r="5" />
    <circle cx="12" cy="12" r="1" />
  </svg>
);

const IconPlus = (props) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

const IconFolder = (props) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
  </svg>
);

export default function SpaceDetail() {
  const { spaceId } = useParams();
  const [data, setData] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', goal: '' });
  const [creating, setCreating] = useState(false);

  const load = () => {
    api.get(`/spaces/${spaceId}/dashboard`).then((res) => setData(res.data));
  };

  useEffect(load, [spaceId]);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setCreating(true);
    try {
      await api.post(`/spaces/${spaceId}/projects`, form);
      setForm({ name: '', description: '', goal: '' });
      setShowForm(false);
      load();
    } finally {
      setCreating(false);
    }
  };

  if (!data) return <Loader label="Loading Space..." />;

  const { space, projectCount, overallProgress, activeProjects, recentlyAccessedProjects, areasRequiringAttention } = data;

  return (
    <div className="animate-fade-in">
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes fadeSlideUp {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes growWidth {
          from { width: 0%; }
        }
        @keyframes expand {
          from { opacity: 0; max-height: 0; transform: translateY(-6px); }
          to { opacity: 1; max-height: 480px; transform: translateY(0); }
        }
        .animate-fade-in {
          animation: fadeIn 0.35s ease-out;
        }
        .stagger-in {
          opacity: 0;
          animation: fadeSlideUp 0.45s ease-out forwards;
        }
        .form-expand {
          animation: expand 0.28s ease-out;
          overflow: hidden;
        }
        .project-card {
          transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
        }
        .project-card:hover {
          transform: translateY(-3px);
          box-shadow: 0 10px 24px -8px rgba(15, 23, 42, 0.18);
        }
        .icon-btn {
          transition: transform 0.2s ease;
        }
        .icon-btn:hover svg {
          transform: rotate(90deg);
        }
        .icon-btn svg {
          transition: transform 0.2s ease;
        }
        @media (prefers-reduced-motion: reduce) {
          .animate-fade-in, .stagger-in, .form-expand, .project-card, .icon-btn svg {
            animation: none !important;
            transition: none !important;
          }
        }
      `}</style>

      <Link to="/dashboard" className="text-sm text-brand-600 hover:underline">&larr; All Spaces</Link>

      <div className="flex items-start justify-between mt-3 mb-6">
        <div className="flex items-center gap-3">
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl"
            style={{ backgroundColor: `${space.color}20` }}
          >
            {space.icon}
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-slate-800">{space.name}</h1>
            <p className="text-sm text-slate-500">{space.description || 'No description yet.'}</p>
          </div>
        </div>
        <button onClick={() => setShowForm((s) => !s)} className="btn-primary icon-btn flex items-center gap-1.5">
          <IconPlus className="w-4 h-4" />
          New Project
        </button>
      </div>

      <div className="grid sm:grid-cols-3 gap-4 mb-6">
        <div className="card p-4 stagger-in" style={{ animationDelay: '0ms' }}>
          <p className="text-xs text-slate-500">Projects</p>
          <p className="text-2xl font-semibold text-slate-800">{projectCount}</p>
        </div>
        <div className="card p-4 stagger-in" style={{ animationDelay: '60ms' }}>
          <p className="text-xs text-slate-500">Overall Progress</p>
          <p className="text-2xl font-semibold text-slate-800">{overallProgress}%</p>
          <ProgressBar value={overallProgress} />
        </div>
        <div className="card p-4 stagger-in" style={{ animationDelay: '120ms' }}>
          <p className="text-xs text-slate-500">Areas Requiring Attention</p>
          <p className="text-2xl font-semibold text-slate-800">{areasRequiringAttention.length}</p>
        </div>
      </div>

      {areasRequiringAttention.length > 0 && (
        <div className="card p-4 mb-6 border-amber-200 bg-amber-50 stagger-in">
          <p className="text-sm font-medium text-amber-800 mb-2 flex items-center gap-2">
            <IconAlert className="w-4 h-4 text-amber-600" />
            Needs attention
          </p>
          <ul className="text-sm text-amber-700 space-y-1">
            {areasRequiringAttention.map((a, i) => (
              <li key={i}>
                <span className="font-medium">{a.project}:</span> {a.note}
              </li>
            ))}
          </ul>
        </div>
      )}

      {showForm && (
        <form onSubmit={handleCreate} className="card p-5 mb-6 space-y-3 form-expand">
          <input
            className="input-field"
            placeholder="Project name (e.g. React Fundamentals)"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            required
          />
          <input
            className="input-field"
            placeholder="Learning goal (e.g. Be comfortable building SPAs with hooks)"
            value={form.goal}
            onChange={(e) => setForm((f) => ({ ...f, goal: e.target.value }))}
          />
          <textarea
            className="input-field"
            placeholder="Description (optional)"
            rows={2}
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          />
          <div className="flex gap-2">
            <button type="submit" disabled={creating} className="btn-primary">
              {creating ? 'Creating...' : 'Create Project'}
            </button>
            <button type="button" onClick={() => setShowForm(false)} className="btn-secondary">Cancel</button>
          </div>
        </form>
      )}

      <h2 className="font-semibold text-slate-700 mb-3">Projects</h2>
      {recentlyAccessedProjects.length === 0 ? (
        <EmptyState
          icon={<IconFolder className="w-8 h-8" />}
          title="No Projects yet"
          description="Create a focused Project inside this Space to start adding materials and learning with your AI Tutor."
          action={<button onClick={() => setShowForm(true)} className="btn-primary mt-2">Create your first Project</button>}
        />
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {recentlyAccessedProjects.map((project, i) => (
            <Link
              key={project._id}
              to={`/projects/${project._id}`}
              className="card project-card stagger-in p-5 block"
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold text-slate-800">{project.name}</h3>
                <span className={`badge ${project.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600'}`}>
                  {project.status}
                </span>
              </div>
              {project.goal && (
                <p className="text-xs text-slate-500 mb-3 flex items-center gap-1.5">
                  <IconTarget className="w-3.5 h-3.5 shrink-0" />
                  {project.goal}
                </p>
              )}
              <ProgressBar value={project.progress} />
              <p className="text-xs text-slate-400 mt-1">{project.progress}% mastery progress</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}