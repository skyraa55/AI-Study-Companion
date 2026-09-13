import React, { useEffect, useState } from 'react';
import api from '../api/axios';
import Loader from '../components/Loader';
import MiniTrendChart from '../components/MiniTrendChart';

const shortDate = (iso) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

export default function GlobalAnalytics() {
  const [detail, setDetail] = useState(null);
  const [loaded, setLoaded] = useState(false);

  const load = async () => {
    const res = await api.get('/analytics/global/detail');
    setDetail(res.data);
    setLoaded(true);
  };

  useEffect(() => {
    load();
  }, []);

  if (!loaded || !detail) return <Loader label="Loading your growth overview..." />;

  const { overallLearning, learningPerformance, aiUsage, trends } = detail;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-800">Your Growth</h1>
          <p className="text-sm text-slate-500">A global view of learning activity across all Spaces & Projects.</p>
        </div>
        <button onClick={load} className="btn-secondary text-sm">↻ Refresh</button>
      </div>

      <Section title="Overall Learning">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Metric label="Total Learning Activity" value={overallLearning.totalLearningActivity} />
          <Metric label="Active Days" value={overallLearning.activeDays} />
          <Metric label="Spaces" value={overallLearning.spaceCount} />
          <Metric label="Projects" value={overallLearning.projectCount} />
        </div>
      </Section>

      <Section title="Learning Performance">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Metric label="Overall Mastery" value={`${learningPerformance.overallMastery}%`} />
          <Metric label="Avg. Assessment Performance" value={`${learningPerformance.averageAssessmentPerformance}%`} />
          <Metric label="Concepts Improving" value={learningPerformance.conceptsImproving} accent="text-green-600" />
          <Metric label="Concepts Needing Attention" value={learningPerformance.conceptsNeedingAttention} accent="text-amber-600" />
        </div>
      </Section>

      <Section title="AI Usage">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Metric label="Tutor Interactions" value={aiUsage.tutorInteractions} />
          <Metric label="Questions Asked" value={aiUsage.questionsAsked} />
          <Metric label="Quiz Activity" value={aiUsage.quizActivity} />
          <Metric label="AI-Generated Feedback" value={aiUsage.aiGeneratedFeedback} />
        </div>
      </Section>

      <Section title="Trends">
        <div className="grid sm:grid-cols-3 gap-4">
          <div className="card p-4">
            <p className="text-xs font-medium text-slate-500 mb-2">Learning Activity Over Time (14d)</p>
            <MiniTrendChart
              data={trends.learningActivityOverTime.map((d) => ({ date: d.date, total: d.tutorMessages + d.quizActivity }))}
              valueKey="total"
              labelKey="date"
              formatLabel={shortDate}
              color="bg-slate-400"
            />
          </div>
          <div className="card p-4">
            <p className="text-xs font-medium text-slate-500 mb-2">Mastery Over Time</p>
            <MiniTrendChart
              data={trends.masteryOverTime}
              valueKey="averageMastery"
              labelKey="date"
              formatLabel={shortDate}
              formatValue={(v) => `${v}%`}
            />
          </div>
          <div className="card p-4">
            <p className="text-xs font-medium text-slate-500 mb-2">Assessment Performance</p>
            <MiniTrendChart
              data={trends.assessmentPerformanceTrend}
              valueKey="score"
              labelKey="date"
              formatLabel={shortDate}
              formatValue={(v) => `${v}%`}
            />
          </div>
        </div>
      </Section>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div>
      <h2 className="font-semibold text-slate-800 mb-3">{title}</h2>
      {children}
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