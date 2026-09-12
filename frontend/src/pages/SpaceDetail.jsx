import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import api from '../api/axios';
import Loader from '../components/Loader';
import EmptyState from '../components/EmptyState';
import ProgressBar from '../components/ProgressBar';

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
    <div>
      <Link to="/dashboard" className="text-sm text-brand-600 hover:underline">&larr; All Spaces</Link>

      <div className="flex items-start justify-between mt-3 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl" style={{ backgroundColor: `${space.color}20` }}>
            {space.icon}
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-slate-800">{space.name}</h1>
            <p className="text-sm text-slate-500">{space.description || 'No description yet.'}</p>
          </div>
        </div>
        <button onClick={() => setShowForm((s) => !s)} className="btn-primary">+ New Project</button>
      </div>

      <div className="grid sm:grid-cols-3 gap-4 mb-6">
        <div className="card p-4">
          <p className="text-xs text-slate-500">Projects</p>
          <p className="text-2xl font-semibold text-slate-800">{projectCount}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-slate-500">Overall Progress</p>
          <p className="text-2xl font-semibold text-slate-800">{overallProgress}%</p>
          <ProgressBar value={overallProgress} />
        </div>
        <div className="card p-4">
          <p className="text-xs text-slate-500">Areas Requiring Attention</p>
          <p className="text-2xl font-semibold text-slate-800">{areasRequiringAttention.length}</p>
        </div>
      </div>

      {areasRequiringAttention.length > 0 && (
        <div className="card p-4 mb-6 border-amber-200 bg-amber-50">
          <p className="text-sm font-medium text-amber-800 mb-2">⚠️ Needs attention</p>
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
        <form onSubmit={handleCreate} className="card p-5 mb-6 space-y-3">
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
          icon="🎯"
          title="No Projects yet"
          description="Create a focused Project inside this Space to start adding materials and learning with your AI Tutor."
          action={<button onClick={() => setShowForm(true)} className="btn-primary mt-2">Create your first Project</button>}
        />
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {recentlyAccessedProjects.map((project) => (
            <Link key={project._id} to={`/projects/${project._id}`} className="card p-5 hover:shadow-md transition block">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold text-slate-800">{project.name}</h3>
                <span className={`badge ${project.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600'}`}>
                  {project.status}
                </span>
              </div>
              {project.goal && <p className="text-xs text-slate-500 mb-3">🎯 {project.goal}</p>}
              <ProgressBar value={project.progress} />
              <p className="text-xs text-slate-400 mt-1">{project.progress}% mastery progress</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
