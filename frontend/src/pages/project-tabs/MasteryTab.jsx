import React, { useEffect, useState } from 'react';
import api from '../../api/axios';
import EmptyState from '../../components/EmptyState';
import Loader from '../../components/Loader';
import ProgressBar from '../../components/ProgressBar';

const TREND_STYLE = {
  improving: { icon: '📈', color: 'text-green-600' },
  stable: { icon: '➡️', color: 'text-slate-500' },
  declining: { icon: '📉', color: 'text-red-600' },
  new: { icon: '✨', color: 'text-brand-600' },
};

export default function MasteryTab({ projectId }) {
  const [masteries, setMasteries] = useState(null);

  useEffect(() => {
    api.get(`/projects/${projectId}/mastery`).then((res) => setMasteries(res.data.masteries));
  }, [projectId]);

  if (!masteries) return <Loader label="Loading mastery data..." />;

  if (masteries.length === 0) {
    return (
      <EmptyState
        icon="🎯"
        title="No concepts tracked yet"
        description="Add materials and take a quiz - concepts are automatically extracted and mastery is tracked as you learn."
      />
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-500 mb-2">
        Mastery blends your quiz history over time, weighted toward recent performance. Concepts below 60% are flagged as needing attention.
      </p>
      {masteries.map((m) => {
        const trend = TREND_STYLE[m.trend] || TREND_STYLE.new;
        return (
          <div key={m._id} className="card p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="font-medium text-slate-800">{m.concept?.name || 'Unknown concept'}</span>
                {m.needsAttention && <span className="badge bg-amber-100 text-amber-700">Needs attention</span>}
              </div>
              <span className={`text-sm font-medium ${trend.color}`}>{trend.icon} {m.trend}</span>
            </div>
            <ProgressBar
              value={m.masteryScore}
              colorClass={m.masteryScore >= 80 ? 'bg-green-500' : m.masteryScore >= 60 ? 'bg-brand-500' : 'bg-amber-500'}
            />
            <div className="flex items-center justify-between mt-1.5 text-xs text-slate-400">
              <span>{m.masteryScore}% mastery</span>
              <span>{m.correctCount}/{m.attemptsCount} correct attempts</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
