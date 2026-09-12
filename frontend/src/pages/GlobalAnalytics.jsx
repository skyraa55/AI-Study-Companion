import React, { useEffect, useState } from 'react';
import api from '../api/axios';
import Loader from '../components/Loader';
import EmptyState from '../components/EmptyState';

export default function GlobalAnalytics() {
  const [snapshot, setSnapshot] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    const res = await api.get('/analytics/global');
    setSnapshot(res.data.snapshot);
    setLoaded(true);
  };

  useEffect(() => {
    load();
  }, []);

  const refresh = async () => {
    setRefreshing(true);
    await api.post('/analytics/global/refresh');
    let attempts = 0;
    const poll = setInterval(async () => {
      attempts += 1;
      const res = await api.get('/analytics/global');
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

  if (!loaded) return <Loader label="Loading your growth overview..." />;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-800">Your Growth</h1>
          <p className="text-sm text-slate-500">A global view of learning activity across all Spaces & Projects.</p>
        </div>
        <button onClick={refresh} disabled={refreshing} className="btn-primary">
          {refreshing ? 'Refreshing...' : '↻ Refresh'}
        </button>
      </div>

      {!snapshot ? (
        <EmptyState icon="📈" title="No global analytics yet" description="Generate a snapshot to see your learning activity across every Space and Project." />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Metric label="Total Quizzes" value={snapshot.metrics.quizzesTaken} />
          <Metric label="Average Score" value={`${snapshot.metrics.averageScore}%`} />
          <Metric label="Concepts Mastered" value={snapshot.metrics.conceptsMastered} accent="text-green-600" />
          <Metric label="Needs Attention" value={snapshot.metrics.conceptsNeedingAttention} accent="text-amber-600" />
          <Metric label="Longest Active Streak" value={`${snapshot.metrics.studyStreakDays}d`} />
          <Metric label="Tutor Messages" value={snapshot.metrics.totalTutorMessages} />
          <Metric label="Concepts Tracked" value={snapshot.metrics.conceptsTracked} />
          <Metric label="Est. Study Time" value={`${snapshot.metrics.totalTimeMinutesEstimate}m`} />
        </div>
      )}
    </div>
  );
}

function Metric({ label, value, accent = 'text-slate-800' }) {
  return (
    <div className="card p-5 text-center">
      <p className={`text-2xl font-semibold ${accent}`}>{value}</p>
      <p className="text-xs text-slate-500 mt-1">{label}</p>
    </div>
  );
}
