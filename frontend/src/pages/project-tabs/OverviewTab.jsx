import React, { useEffect, useState } from 'react';
import api from '../../api/axios';
import Loader from '../../components/Loader';
import ProgressBar from '../../components/ProgressBar';

const ACTIVITY_ICON = { tutor: '🤖', quiz: '📝', material: '📄' };
const ACTIVITY_TAB = { tutor: 'tutor', quiz: 'quiz', material: 'materials' };

const TREND_STYLE = {
  improving: { icon: '📈', color: 'text-green-600' },
  stable: { icon: '➡️', color: 'text-slate-500' },
  declining: { icon: '📉', color: 'text-red-600' },
  new: { icon: '✨', color: 'text-brand-600' },
};

const EVENT_ICON = {
  SPACE_CREATED: '📁',
  PROJECT_CREATED: '🎯',
  PROJECT_ACCESSED: '👋',
  MATERIAL_UPLOADED: '📄',
  MATERIAL_PROCESSING_STARTED: '⏳',
  MATERIAL_PROCESSING_COMPLETED: '✅',
  MATERIAL_PROCESSING_FAILED: '⚠️',
  TUTOR_CONVERSATION_STARTED: '🤖',
  TUTOR_QUESTION_ASKED: '💬',
  QUIZ_STARTED: '📝',
  QUESTION_ANSWERED: '✏️',
  QUIZ_COMPLETED: '🏁',
  MASTERY_UPDATED: '🎯',
  RECOMMENDATION_GENERATED: '🧭',
};

export default function OverviewTab({ projectId, onNavigate }) {
  const [data, setData] = useState(null);
  const [context, setContext] = useState(null);
  const [activity, setActivity] = useState(null);

  const load = () => {
    api.get(`/projects/${projectId}/dashboard`).then((res) => setData(res.data));
    api.get(`/projects/${projectId}/learning-context`).then((res) => setContext(res.data));
    api.get(`/projects/${projectId}/activity?limit=8`).then((res) => setActivity(res.data.events));
  };

  useEffect(load, [projectId]);

  const removeNote = async (field, note) => {
    await api.delete(`/projects/${projectId}/learning-context/${field}`, { data: { note } });
    api.get(`/projects/${projectId}/learning-context`).then((res) => setContext(res.data));
  };

  if (!data) return <Loader label="Loading your Project overview..." />;

  const { progress, concepts, recentActivity, performance, continueLearning, recommendedNextStep } = data;
  const weakestConcepts = concepts.slice(0, 5);
  const trend = TREND_STYLE[performance.trend] || TREND_STYLE.stable;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        <QuickAction label="▶ Continue Learning" onClick={() => onNavigate(continueLearning ? ACTIVITY_TAB[continueLearning.type] : 'materials')} primary />
        <QuickAction label="📄 View Materials" onClick={() => onNavigate('materials')} />
        <QuickAction label="🤖 Ask Tutor" onClick={() => onNavigate('tutor')} />
        <QuickAction label="📝 Take Quiz" onClick={() => onNavigate('quiz')} />
        <QuickAction label="📈 View Growth" onClick={() => onNavigate('growth')} />
        <QuickAction label="📊 View Analytics" onClick={() => onNavigate('analytics')} />
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-6">
          <div className="card p-5">
            <h3 className="font-semibold text-slate-800 mb-2">Progress</h3>
            <p className="text-3xl font-bold text-brand-600">{progress}%</p>
            <p className="text-xs text-slate-500 mb-2">Overall Project mastery</p>
            <ProgressBar value={progress} />
          </div>

          <div className="card p-5 bg-brand-50 border-brand-100">
            <h3 className="font-semibold text-slate-800 mb-1">🧭 Recommended Next Step</h3>
            <p className="text-sm text-slate-600">{recommendedNextStep}</p>
          </div>

          {continueLearning && (
            <div className="card p-5">
              <h3 className="font-semibold text-slate-800 mb-2">Continue Learning</h3>
              <div className="flex items-start gap-2">
                <span className="text-xl">{ACTIVITY_ICON[continueLearning.type]}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800 truncate">{continueLearning.title}</p>
                  <p className="text-xs text-slate-500 truncate">{continueLearning.detail}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{new Date(continueLearning.timestamp).toLocaleString()}</p>
                </div>
              </div>
              <button
                onClick={() => onNavigate(ACTIVITY_TAB[continueLearning.type])}
                className="btn-secondary text-xs mt-3 w-full"
              >
                Resume
              </button>
            </div>
          )}
        </div>

        <div className="lg:col-span-1 space-y-6">
          <div className="card p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-slate-800">Concepts</h3>
              <button onClick={() => onNavigate('mastery')} className="text-xs text-brand-600 hover:underline">View all</button>
            </div>
            {weakestConcepts.length === 0 ? (
              <p className="text-sm text-slate-400">No concepts tracked yet - add materials to get started.</p>
            ) : (
              <div className="space-y-3">
                {weakestConcepts.map((c) => (
                  <div key={c.id}>
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span className="text-slate-700 truncate">{c.name}</span>
                      <span className="text-slate-400">{c.masteryScore}%</span>
                    </div>
                    <ProgressBar
                      value={c.masteryScore}
                      colorClass={c.masteryScore >= 80 ? 'bg-green-500' : c.masteryScore >= 60 ? 'bg-brand-500' : 'bg-amber-500'}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card p-5">
            <h3 className="font-semibold text-slate-800 mb-3">Learning Performance</h3>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <p className="text-xl font-semibold text-slate-800">{performance.averageScore}%</p>
                <p className="text-xs text-slate-500">Average score</p>
              </div>
              <div>
                <p className="text-xl font-semibold text-slate-800">{performance.quizzesTaken}</p>
                <p className="text-xs text-slate-500">Quizzes taken</p>
              </div>
            </div>
            <p className={`text-sm font-medium ${trend.color}`}>{trend.icon} {performance.trend}</p>
          </div>

          <div className="card p-5">
            <h3 className="font-semibold text-slate-800 mb-3">Activity Log</h3>
            {!activity ? (
              <p className="text-sm text-slate-400">Loading...</p>
            ) : activity.length === 0 ? (
              <p className="text-sm text-slate-400">No activity recorded yet.</p>
            ) : (
              <ul className="space-y-2">
                {activity.map((e) => (
                  <li key={e._id} className="flex items-start gap-2 text-sm">
                    <span>{EVENT_ICON[e.type] || '•'}</span>
                    <div className="min-w-0">
                      <p className="text-slate-700 truncate">{e.message}</p>
                      <p className="text-xs text-slate-400">{new Date(e.createdAt).toLocaleString()}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="lg:col-span-1 space-y-6">
          <div className="card p-5">
            <h3 className="font-semibold text-slate-800 mb-3">Recent Activity</h3>
            {recentActivity.length === 0 ? (
              <p className="text-sm text-slate-400">No activity yet.</p>
            ) : (
              <ul className="space-y-3">
                {recentActivity.map((a) => (
                  <li key={`${a.type}-${a.id}`} className="flex items-start gap-2">
                    <span className="text-lg">{ACTIVITY_ICON[a.type]}</span>
                    <div className="min-w-0">
                      <p className="text-sm text-slate-700 truncate">{a.title}</p>
                      <p className="text-xs text-slate-500 truncate">{a.detail}</p>
                      <p className="text-xs text-slate-400">{new Date(a.timestamp).toLocaleString()}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="card p-5">
            <h3 className="font-semibold text-slate-800 mb-3">Learning Context</h3>
            {!context ? (
              <p className="text-sm text-slate-400">Loading...</p>
            ) : (
              <>
                {context.learningGoals.project && (
                  <ContextRow label="Goal" items={[context.learningGoals.project]} />
                )}
                {context.knownStrengths.length > 0 && (
                  <div className="mb-3">
                    <p className="text-xs font-medium text-slate-500 mb-1">Known Strengths</p>
                    <div className="flex flex-wrap gap-1.5">
                      {context.knownStrengths.map((s, i) => (
                        <span key={i} className="badge bg-green-50 text-green-700">{s.concept} ({s.masteryScore}%)</span>
                      ))}
                    </div>
                  </div>
                )}
                {context.knownWeaknesses.length > 0 && (
                  <div className="mb-3">
                    <p className="text-xs font-medium text-slate-500 mb-1">Known Weaknesses</p>
                    <div className="flex flex-wrap gap-1.5">
                      {context.knownWeaknesses.map((w, i) => (
                        <span key={i} className="badge bg-amber-50 text-amber-700">{w.concept} ({w.masteryScore}%)</span>
                      ))}
                    </div>
                  </div>
                )}
                {context.assessmentContext.recentMistakeConcepts.length > 0 && (
                  <ContextRow label="Recent Mistakes" items={context.assessmentContext.recentMistakeConcepts} />
                )}
                <EditableContextRow
                  label="Important Concepts"
                  items={context.curatedNotes.importantConcepts}
                  onRemove={(note) => removeNote('importantConcepts', note)}
                />
                <EditableContextRow
                  label="Previous Difficulties"
                  items={context.curatedNotes.previousDifficulties}
                  onRemove={(note) => removeNote('previousDifficulties', note)}
                />
                <EditableContextRow
                  label="Notes"
                  items={context.curatedNotes.significantNotes}
                  onRemove={(note) => removeNote('significantNotes', note)}
                />
                <EditableContextRow
                  label="Needs Attention"
                  items={context.curatedNotes.areasRequiringAttention}
                  onRemove={(note) => removeNote('areasRequiringAttention', note)}
                  last
                />
                {context.importantTutorContext.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-slate-100">
                    <p className="text-xs font-medium text-slate-500 mb-1">Important Tutor Context</p>
                    {context.importantTutorContext.slice(0, 2).map((c, i) => (
                      <p key={i} className="text-xs text-slate-500 mb-1 line-clamp-2">
                        <span className="font-medium text-slate-600">{c.title}:</span> {c.summary}
                      </p>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function QuickAction({ label, onClick, primary }) {
  return (
    <button onClick={onClick} className={primary ? 'btn-primary text-sm' : 'btn-secondary text-sm'}>
      {label}
    </button>
  );
}

function ContextRow({ label, items, last }) {
  if (!items || items.length === 0) return null;
  return (
    <div className={last ? '' : 'mb-3'}>
      <p className="text-xs font-medium text-slate-500 mb-1">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {items.map((item, i) => (
          <span key={i} className="badge bg-slate-100 text-slate-600">{item}</span>
        ))}
      </div>
    </div>
  );
}

function EditableContextRow({ label, items, onRemove, last }) {
  if (!items || items.length === 0) return null;
  return (
    <div className={last ? '' : 'mb-3'}>
      <p className="text-xs font-medium text-slate-500 mb-1">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {items.map((item, i) => (
          <span key={i} className="badge bg-slate-100 text-slate-600 group flex items-center gap-1">
            {item}
            <button onClick={() => onRemove(item)} className="text-slate-400 hover:text-red-500" title="Remove">×</button>
          </span>
        ))}
      </div>
    </div>
  );
}