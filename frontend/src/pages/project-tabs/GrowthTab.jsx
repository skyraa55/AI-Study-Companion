import React, { useEffect, useState } from 'react';
import api from '../../api/axios';
import Loader from '../../components/Loader';
import EmptyState from '../../components/EmptyState';

const TREND_STYLE = {
  improving: { icon: '📈', color: 'text-green-600', label: 'Improving' },
  stable: { icon: '➡️', color: 'text-slate-500', label: 'Stable' },
  declining: { icon: '⚠️', color: 'text-red-600', label: 'Needs Attention' },
  new: { icon: '✨', color: 'text-brand-600', label: 'New' },
};

export default function GrowthTab({ projectId }) {
  const [snapshot, setSnapshot] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    const res = await api.get(`/projects/${projectId}/growth`);
    setSnapshot(res.data.snapshot);
    setLoaded(true);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line
  }, [projectId]);

  const refresh = async () => {
    setRefreshing(true);
    await api.post(`/projects/${projectId}/growth/refresh`);
    let attempts = 0;
    const poll = setInterval(async () => {
      attempts += 1;
      const res = await api.get(`/projects/${projectId}/growth`);
      if (res.data.snapshot && (!snapshot || res.data.snapshot._id !== snapshot._id)) {
        clearInterval(poll);
        setSnapshot(res.data.snapshot);
        setRefreshing(false);
      } else if (attempts > 10) {
        clearInterval(poll);
        setRefreshing(false);
        load();
      }
    }, 2000);
  };

  if (!loaded) return <Loader label="Loading growth analysis..." />;

  if (!snapshot) {
    return (
      <EmptyState
        icon="🌱"
        title="No growth analysis yet"
        description="Take a quiz first, then generate a growth analysis to see how your understanding is changing concept by concept."
        action={<button onClick={refresh} disabled={refreshing} className="btn-primary mt-2">{refreshing ? 'Analyzing...' : 'Generate Growth Analysis'}</button>}
      />
    );
  }

  const { concepts, recommendations, generatedAt } = snapshot;
  const strong = concepts.filter((c) => c.isStrong);
  const weak = concepts.filter((c) => c.isWeak);
  const improving = concepts.filter((c) => c.trend === 'improving');
  const stable = concepts.filter((c) => c.trend === 'stable');
  const needsAttention = concepts.filter((c) => c.needsAttention);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-400">Last updated {new Date(generatedAt).toLocaleString()}</p>
        <button onClick={refresh} disabled={refreshing} className="btn-secondary text-sm">
          {refreshing ? 'Refreshing...' : '↻ Refresh Growth Analysis'}
        </button>
      </div>

      {recommendations?.length > 0 && (
        <div className="card p-5 bg-brand-50 border-brand-100">
          <h3 className="font-semibold text-slate-800 mb-2">🧭 What should I do next?</h3>
          <ul className="space-y-2">
            {recommendations.map((r, i) => (
              <li key={i} className="text-sm text-slate-700">{r}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="card p-5">
        <h3 className="font-semibold text-slate-800 mb-4">Growth Trends</h3>
        {concepts.length === 0 ? (
          <p className="text-sm text-slate-400">No concepts tracked yet.</p>
        ) : (
          <div className="space-y-3">
            {concepts.map((c, i) => {
              const trend = TREND_STYLE[c.trend] || TREND_STYLE.new;
              return (
                <div key={i} className="flex items-center justify-between text-sm border-b border-slate-50 pb-2 last:border-0">
                  <span className="font-medium text-slate-700">{c.name}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-slate-400">{c.previousScore}%</span>
                    <span className="text-slate-300">→</span>
                    <span className="font-medium text-slate-700">{c.currentScore}%</span>
                    <span className={`${trend.color} font-medium`}>{trend.icon} {trend.label}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <GrowthGroup title="💪 Strong Areas" concepts={strong} emptyText="No concepts at 80%+ yet." />
        <GrowthGroup title="🎯 Weak Areas" concepts={weak} emptyText="No weak concepts right now." />
        <GrowthGroup title="📈 Improving" concepts={improving} emptyText="Nothing trending up yet." />
        <GrowthGroup title="➡️ Stable" concepts={stable} emptyText="Nothing steady yet." />
      </div>

      {needsAttention.length > 0 && (
        <div className="card p-5 border-amber-200 bg-amber-50">
          <h3 className="font-semibold text-amber-800 mb-2">⚠️ Areas Requiring Attention</h3>
          <div className="flex flex-wrap gap-2">
            {needsAttention.map((c, i) => (
              <span key={i} className="badge bg-white text-amber-700 border border-amber-200">{c.name}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function GrowthGroup({ title, concepts, emptyText }) {
  return (
    <div className="card p-4">
      <h4 className="text-sm font-semibold text-slate-700 mb-2">{title}</h4>
      {concepts.length === 0 ? (
        <p className="text-xs text-slate-400">{emptyText}</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {concepts.map((c, i) => (
            <span key={i} className="badge bg-slate-100 text-slate-600">{c.name} · {c.currentScore}%</span>
          ))}
        </div>
      )}
    </div>
  );
}