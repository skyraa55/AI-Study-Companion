import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import api from '../api/axios';
import Loader from '../components/Loader';
import ProgressBar from '../components/ProgressBar';
import OverviewTab from './project-tabs/OverviewTab';

import MaterialsTab from './project-tabs/MaterialsTab';
import TutorTab from './project-tabs/TutorTab';
import QuizTab from './project-tabs/QuizTab';
import MasteryTab from './project-tabs/MasteryTab';
import GrowthTab from './project-tabs/GrowthTab';
import AnalyticsTab from './project-tabs/AnalyticsTab';

// Lightweight inline icons (no external icon dependency required)
const Icon = {
  Back: (props) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M15 18l-6-6 6-6" />
    </svg>
  ),
  Home: (props) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M3 11.5L12 4l9 7.5" />
      <path d="M5 10v9a1 1 0 001 1h4v-6h4v6h4a1 1 0 001-1v-9" />
    </svg>
  ),
  Materials: (props) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M7 3h7l5 5v13a1 1 0 01-1 1H7a1 1 0 01-1-1V4a1 1 0 011-1z" />
      <path d="M14 3v5h5" />
      <path d="M9 13h6M9 17h6" />
    </svg>
  ),
  Tutor: (props) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="4" y="8" width="16" height="11" rx="2" />
      <path d="M12 8V4M9 4h6" />
      <circle cx="9" cy="13.5" r="1" fill="currentColor" stroke="none" />
      <circle cx="15" cy="13.5" r="1" fill="currentColor" stroke="none" />
    </svg>
  ),
  Quiz: (props) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M9 10a3 3 0 116 0c0 2-3 2-3 4" />
      <path d="M12 17.5v.01" />
      <rect x="3.5" y="3.5" width="17" height="17" rx="3" />
    </svg>
  ),
  Mastery: (props) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="12" cy="12" r="0.6" fill="currentColor" />
    </svg>
  ),
  Growth: (props) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M4 20V10M12 20V4M20 20v-7" />
    </svg>
  ),
  Analytics: (props) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M4 19V9M10 19V5M16 19v-7M22 19H2" />
    </svg>
  ),
  Target: (props) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="12" cy="12" r="7" />
      <circle cx="12" cy="12" r="3" />
      <circle cx="12" cy="12" r="0.5" fill="currentColor" />
    </svg>
  ),
};

const TABS = [
  { key: 'overview', label: 'Overview', icon: Icon.Home },
  { key: 'materials', label: 'Materials', icon: Icon.Materials },
  { key: 'tutor', label: 'AI Tutor', icon: Icon.Tutor },
  { key: 'quiz', label: 'Quiz', icon: Icon.Quiz },
  { key: 'mastery', label: 'Mastery', icon: Icon.Mastery },
  { key: 'growth', label: 'Growth', icon: Icon.Growth },
  { key: 'analytics', label: 'Analytics', icon: Icon.Analytics },
];

export default function ProjectDetail() {
  const { projectId } = useParams();
  const [summary, setSummary] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');

  const loadSummary = () => {
    api.get(`/projects/${projectId}/summary`).then((res) => setSummary(res.data));
  };

  useEffect(loadSummary, [projectId]);

  if (!summary) return <Loader label="Loading Project..." />;

  const { project, materialCount, readyMaterialCount, conceptCount, masteredConceptCount, needsAttentionCount, quizAttemptCount } = summary;

  return (
    <div className="animate-[fadeIn_0.35s_ease-out]">
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes tabFade {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <Link
        to={`/spaces/${project.space}`}
        className="group inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-brand-600 transition-colors duration-200"
      >
        <Icon.Back className="w-4 h-4 transition-transform duration-200 group-hover:-translate-x-0.5" />
        Back to Space
      </Link>

      <div className="mt-4 mb-6">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-slate-900">{project.name}</h1>
          <span
            className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset transition-colors duration-200 ${
              project.status === 'active'
                ? 'bg-green-50 text-green-700 ring-green-200'
                : 'bg-slate-100 text-slate-600 ring-slate-200'
            }`}
          >
            {project.status}
          </span>
        </div>

        {project.goal && (
          <p className="mt-1.5 flex items-center gap-1.5 text-sm text-slate-500">
            <Icon.Target className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            {project.goal}
          </p>
        )}

        <div className="mt-4 max-w-sm">
          <ProgressBar value={project.progress} />
          <p className="text-xs text-slate-400 mt-1.5">{project.progress}% overall mastery</p>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
        <StatChip label="Materials" value={`${readyMaterialCount}/${materialCount} ready`} />
        <StatChip label="Concepts" value={conceptCount} />
        <StatChip label="Mastered" value={masteredConceptCount} accent="text-green-600" />
        <StatChip label="Needs attention" value={needsAttentionCount} accent="text-amber-600" />
      </div>

      <div className="flex gap-1 border-b border-slate-200 mb-6 overflow-x-auto scrollbar-none">
        {TABS.map((tab) => {
          const TabIcon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`group relative flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-all duration-200 ${
                isActive
                  ? 'border-brand-600 text-brand-600'
                  : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'
              }`}
            >
              <TabIcon
                className={`w-4 h-4 transition-transform duration-200 ${
                  isActive ? 'scale-105' : 'group-hover:scale-105'
                }`}
              />
              {tab.label}
            </button>
          );
        })}
      </div>

      <div key={activeTab} style={{ animation: 'tabFade 0.28s ease-out' }}>
        {activeTab === 'overview' && <OverviewTab projectId={projectId} onNavigate={setActiveTab} />}
        {activeTab === 'materials' && <MaterialsTab projectId={projectId} onChange={loadSummary} />}
        {activeTab === 'tutor' && <TutorTab projectId={projectId} project={project} onNavigate={setActiveTab} />}
        {activeTab === 'quiz' && <QuizTab projectId={projectId} onChange={loadSummary} />}
        {activeTab === 'mastery' && <MasteryTab projectId={projectId} />}
        {activeTab === 'growth' && <GrowthTab projectId={projectId} />}
        {activeTab === 'analytics' && <AnalyticsTab projectId={projectId} />}
      </div>
    </div>
  );
}

function StatChip({ label, value, accent = 'text-slate-800' }) {
  return (
    <div className="card p-3 text-center transition-all duration-200 hover:shadow-md hover:-translate-y-0.5">
      <p className={`text-lg font-semibold ${accent} transition-colors duration-200`}>{value}</p>
      <p className="text-xs text-slate-500">{label}</p>
    </div>
  );
}