import React, { useEffect, useState } from 'react';
import api from '../../api/axios';
import Loader from '../../components/Loader';
import EmptyState from '../../components/EmptyState';
import MiniTrendChart from '../../components/MiniTrendChart';

const shortDate = (iso) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

export default function AnalyticsTab({ projectId }) {
  const [detail, setDetail] = useState(null);
  const [snapshot, setSnapshot] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const loadDetail = async () => {
    const res = await api.get(`/projects/${projectId}/analytics/detail`);
    setDetail(res.data);
  };

  const loadSnapshot = async () => {
    const res = await api.get(`/projects/${projectId}/analytics`);
    setSnapshot(res.data.snapshot);
  };

  useEffect(() => {
    Promise.all([loadDetail(), loadSnapshot()]).finally(() => setLoaded(true));
    // eslint-disable-next-line
  }, [projectId]);

  const refreshRecommendations = async () => {
    setRefreshing(true);
    await api.post(`/projects/${projectId}/analytics/refresh`);
    let attempts = 0;
    const poll = setInterval(async () => {
      attempts += 1;
      const res = await api.get(`/projects/${projectId}/analytics`);
      if (res.data.snapshot && (!snapshot || res.data.snapshot._id !== snapshot._id)) {
        clearInterval(poll);
        setSnapshot(res.data.snapshot);
        setRefreshing(false);
        loadDetail();
      } else if (attempts > 8) {
        clearInterval(poll);
        setRefreshing(false);
      }
    }, 2000);
  };

  if (!loaded || !detail) return <Loader label="Loading analytics..." />;

  const { activity, performance, growth, aiActivity } = detail;
  const hasAnyActivity = activity.learningSessions > 0 || activity.materialInteractions > 0;

  if (!hasAnyActivity) {
    return (
      <EmptyState
        icon="📊"
        title="No activity yet"
        description="Add materials, chat with the AI Tutor, and take a quiz to start seeing analytics for this Project."
      />
    );
  }

  return (
    <div className="space-y-6">
      <Section title="Activity">
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <Metric label="Learning Sessions" value={activity.learningSessions} />
          <Metric label="Tutor Questions" value={activity.tutorQuestions} />
          <Metric label="Quiz Attempts" value={activity.quizAttempts} />
          <Metric label="Questions Answered" value={activity.questionsAnswered} />
          <Metric label="Material Interactions" value={activity.materialInteractions} />
        </div>
      </Section>

      <Section title="Performance">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Metric label="Quiz Accuracy" value={`${performance.quizAccuracy}%`} />
          <Metric label="Current Mastery" value={`${performance.currentMastery}%`} />
          <Metric label="Concepts Mastered" value={performance.conceptsMastered} accent="text-green-600" />
          <Metric label="Needs Attention" value={performance.conceptsNeedingAttention} accent="text-amber-600" />
        </div>
      </Section>

      <Section title="Growth">
        <div className="grid sm:grid-cols-3 gap-4">
          <div className="card p-4">
            <p className="text-xs font-medium text-slate-500 mb-2">Mastery Trends</p>
            <div className="space-y-1 text-sm">
              <TrendRow label="Improving" value={growth.masteryTrends.improving} color="text-green-600" />
              <TrendRow label="Stable" value={growth.masteryTrends.stable} color="text-slate-500" />
              <TrendRow label="Declining" value={growth.masteryTrends.declining} color="text-red-600" />
              <TrendRow label="New" value={growth.masteryTrends.new} color="text-brand-600" />
            </div>
          </div>
          <div className="card p-4">
            <p className="text-xs font-medium text-slate-500 mb-2">Assessment Trend</p>
            <MiniTrendChart
              data={growth.assessmentTrend}
              valueKey="score"
              labelKey="date"
              formatLabel={shortDate}
              formatValue={(v) => `${v}%`}
            />
          </div>
          <div className="card p-4">
            <p className="text-xs font-medium text-slate-500 mb-2">Learning Activity (14d)</p>
            <MiniTrendChart
              data={growth.activityOverTime.map((d) => ({ date: d.date, total: d.tutorMessages + d.quizActivity }))}
              valueKey="total"
              labelKey="date"
              formatLabel={shortDate}
              color="bg-slate-400"
            />
          </div>
        </div>
      </Section>

      <Section title="AI Activity">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Metric label="Tutor Interactions" value={aiActivity.tutorInteractions} />
          <Metric label="AI Assessments" value={aiActivity.aiGeneratedAssessments} />
          <Metric label="AI Evaluations" value={aiActivity.aiEvaluations} />
          <Metric label="Recommendations Generated" value={aiActivity.recommendationsGenerated} />
        </div>
      </Section>

      <Section
        title="Recommendations"
        action={
          <button onClick={refreshRecommendations} disabled={refreshing} className="btn-secondary text-xs">
            {refreshing ? 'Refreshing...' : '↻ Refresh'}
          </button>
        }
      >
        {!snapshot ? (
          <p className="text-sm text-slate-400">No recommendations generated yet - click refresh to generate some.</p>
        ) : (
          <>
            <p className="text-xs text-slate-400 mb-2">Generated {new Date(snapshot.generatedAt).toLocaleString()}</p>
            <ul className="space-y-2">
              {snapshot.recommendations.map((r, i) => (
                <li key={i} className="text-sm text-slate-600 flex gap-2">
                  <span className="text-brand-600">→</span> {r}
                </li>
              ))}
            </ul>
          </>
        )}
      </Section>
    </div>
  );
}

function Section({ title, action, children }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-slate-800">{title}</h3>
        {action}
      </div>
      {children}
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

function TrendRow({ label, value, color }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-slate-500">{label}</span>
      <span className={`font-medium ${color}`}>{value}</span>
    </div>
  );
}