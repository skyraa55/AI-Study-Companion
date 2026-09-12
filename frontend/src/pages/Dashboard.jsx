import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/axios';
import Loader from '../components/Loader';
import EmptyState from '../components/EmptyState';
import ProgressBar from '../components/ProgressBar';

const ICONS = ['📘', '💻', '🎨', '🧪', '🎯', '🗣️', '📈', '🎵', '⚖️', '🏗️'];

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
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-800">Your Spaces</h1>
          <p className="text-sm text-slate-500">Organize your learning into broad areas of growth.</p>
        </div>
        <button onClick={() => setShowForm((s) => !s)} className="btn-primary">
          + New Space
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="card p-5 mb-6 space-y-3">
          <div className="flex gap-2 flex-wrap">
            {ICONS.map((icon) => (
              <button
                type="button"
                key={icon}
                onClick={() => setForm((f) => ({ ...f, icon }))}
                className={`w-9 h-9 rounded-lg border text-lg flex items-center justify-center ${
                  form.icon === icon ? 'border-brand-500 bg-brand-50' : 'border-slate-200'
                }`}
              >
                {icon}
              </button>
            ))}
          </div>
          <input
            className="input-field"
            placeholder="Space name (e.g. Frontend Engineering)"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            required
          />
          <textarea
            className="input-field"
            placeholder="What is this Space about? (optional)"
            rows={2}
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          />
          <div className="flex gap-2">
            <button type="submit" disabled={creating} className="btn-primary">
              {creating ? 'Creating...' : 'Create Space'}
            </button>
            <button type="button" onClick={() => setShowForm(false)} className="btn-secondary">
              Cancel
            </button>
          </div>
        </form>
      )}

      {spaces.length === 0 ? (
        <EmptyState
          icon="📚"
          title="No Spaces yet"
          description="Create your first Space to start organizing your learning journey - a skill, subject, or long-term goal."
          action={<button onClick={() => setShowForm(true)} className="btn-primary mt-2">Create your first Space</button>}
        />
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {spaces.map((space) => (
            <Link
              key={space._id}
              to={`/spaces/${space._id}`}
              className="card p-5 hover:shadow-md transition block"
            >
              <div className="flex items-center gap-3 mb-2">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center text-xl"
                  style={{ backgroundColor: `${space.color}20` }}
                >
                  {space.icon}
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
