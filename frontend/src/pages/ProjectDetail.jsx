import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import api from '../api/axios';
import Loader from '../components/Loader';
import ProgressBar from '../components/ProgressBar';

import MaterialsTab from './project-tabs/MaterialsTab';
import TutorTab from './project-tabs/TutorTab';
import QuizTab from './project-tabs/QuizTab';
import MasteryTab from './project-tabs/MasteryTab';
import AnalyticsTab from './project-tabs/AnalyticsTab';

const TABS = [
  { key: 'materials', label: '📄 Materials' },
  { key: 'tutor', label: '🤖 AI Tutor' },
  { key: 'quiz', label: '📝 Quiz' },
  { key: 'mastery', label: '🎯 Mastery' },
  { key: 'analytics', label: '📊 Analytics' },
];

export default function ProjectDetail() {
  const { projectId } = useParams();
  const [summary, setSummary] = useState(null);
  const [activeTab, setActiveTab] = useState('materials');

  const loadSummary = () => {
    api.get(`/projects/${projectId}/summary`).then((res) => setSummary(res.data));
  };

  useEffect(loadSummary, [projectId]);

  if (!summary) return <Loader label="Loading Project..." />;

  const { project, materialCount, readyMaterialCount, conceptCount, masteredConceptCount, needsAttentionCount, quizAttemptCount } = summary;

  return (
    <div>
      <Link to={`/spaces/${project.space}`} className="text-sm text-brand-600 hover:underline">&larr; Back to Space</Link>

      <div className="mt-3 mb-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-slate-800">{project.name}</h1>
          <span className={`badge ${project.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600'}`}>
            {project.status}
          </span>
        </div>
        {project.goal && <p className="text-sm text-slate-500 mt-1">🎯 Goal: {project.goal}</p>}
        <div className="mt-2 max-w-sm">
          <ProgressBar value={project.progress} />
          <p className="text-xs text-slate-400 mt-1">{project.progress}% overall mastery</p>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <StatChip label="Materials" value={`${readyMaterialCount}/${materialCount} ready`} />
        <StatChip label="Concepts" value={conceptCount} />
        <StatChip label="Mastered" value={masteredConceptCount} accent="text-green-600" />
        <StatChip label="Needs attention" value={needsAttentionCount} accent="text-amber-600" />
      </div>

      <div className="flex gap-1 border-b border-slate-200 mb-6 overflow-x-auto">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition ${
              activeTab === tab.key
                ? 'border-brand-600 text-brand-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'materials' && <MaterialsTab projectId={projectId} onChange={loadSummary} />}
      {activeTab === 'tutor' && <TutorTab projectId={projectId} project={project} />}
      {activeTab === 'quiz' && <QuizTab projectId={projectId} onChange={loadSummary} />}
      {activeTab === 'mastery' && <MasteryTab projectId={projectId} />}
      {activeTab === 'analytics' && <AnalyticsTab projectId={projectId} />}
    </div>
  );
}

function StatChip({ label, value, accent = 'text-slate-800' }) {
  return (
    <div className="card p-3 text-center">
      <p className={`text-lg font-semibold ${accent}`}>{value}</p>
      <p className="text-xs text-slate-500">{label}</p>
    </div>
  );
}
