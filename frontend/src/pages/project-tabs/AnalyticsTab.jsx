import React, { useEffect, useState } from 'react';
import api from '../../api/axios';
import Loader from '../../components/Loader';
import EmptyState from '../../components/EmptyState';

export default function AnalyticsTab({ projectId }) {
  const [snapshot, setSnapshot] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const load = async () => {
    const res = await api.get(`/projects/${projectId}/analytics`);
    setSnapshot(res.data.snapshot);
    setLoaded(true);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line
  }, [projectId]);

  const refresh = async () => {
    setRefreshing(true);
    await api.post(`/projects/${projectId}/analytics/refresh`);
    // Poll briefly for the new snapshot (job runs async)
    let attempts = 0;
    const poll = setInterval(async () => {
      attempts += 1;
      const res = await api.get(`/projects/${projectId}/analytics`);
      if (res.data.snapshot && (!snapshot || res.data.snapshot._id !== snapshot._id)) {
        clearInterval(poll);
        setSnapshot(res.data.snapshot);
        setRefreshing(false);
      } else if (attempts > 8) {
        clearInterval(poll);
        setRefreshing(false);
        load();
      }
    }, 2000);
  };

  if (!loaded) return <Loader label="Loading analytics..." />;

  if (!snapshot) {
    return (
      <EmptyState
        icon="📊"
        title="No analytics yet"
        description="Generate your first analytics snapshot to see quiz performance, mastery breakdown, and personalized recommendations."
        action={<button onClick={refresh} disabled={refreshing} className="btn-primary mt-2">{refreshing ? 'Analyzing...' : 'Generate Analytics'}</button>}
      />
    );
  }

  const { metrics, recommendations, generatedAt } = snapshot;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-400">Last updated {new Date(generatedAt).toLocaleString()}</p>
        <button onClick={refresh} disabled={refreshing} className="btn-secondary text-sm">
          {refreshing ? 'Refreshing...' : '↻ Refresh Analytics'}
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Metric label="Quizzes Taken" value={metrics.quizzesTaken} />
        <Metric label="Average Score" value={`${metrics.averageScore}%`} />
        <Metric label="Concepts Mastered" value={metrics.conceptsMastered} accent="text-green-600" />
        <Metric label="Needs Attention" value={metrics.conceptsNeedingAttention} accent="text-amber-600" />
        <Metric label="Study Streak" value={`${metrics.studyStreakDays}d`} />
        <Metric label="Tutor Messages" value={metrics.totalTutorMessages} />
        <Metric label="Concepts Tracked" value={metrics.conceptsTracked} />
        <Metric label="Est. Study Time" value={`${metrics.totalTimeMinutesEstimate}m`} />
      </div>

      {recommendations?.length > 0 && (
        <div className="card p-5">
          <h3 className="font-semibold text-slate-800 mb-3">🧭 Next Learning Actions</h3>
          <ul className="space-y-2">
            {recommendations.map((r, i) => (
              <li key={i} className="text-sm text-slate-600 flex gap-2">
                <span className="text-brand-600">→</span> {r}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Metric({ label, value, accent = 'text-slate-800' }) {
  return (
    <div className="card p-4 text-center">
      <p className={`text-xl font-semibold ${accent}`}>{value}</p>
      <p className="text-xs text-slate-500 mt-0.5">{label}</p>
    </div>
  );
}
