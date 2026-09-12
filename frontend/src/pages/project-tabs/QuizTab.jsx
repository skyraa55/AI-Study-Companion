import React, { useEffect, useRef, useState } from 'react';
import api from '../../api/axios';
import EmptyState from '../../components/EmptyState';
import Loader from '../../components/Loader';
import ProgressBar from '../../components/ProgressBar';

const DIFFICULTY_STYLE = {
  easy: 'bg-green-100 text-green-700',
  medium: 'bg-amber-100 text-amber-700',
  hard: 'bg-red-100 text-red-700',
};

const TYPE_LABEL = { mcq: 'Multiple Choice', true_false: 'True / False', short_answer: 'Open-Ended' };

export default function QuizTab({ projectId, onChange }) {
  const [view, setView] = useState('list');
  const [sessions, setSessions] = useState(null);
  const [sessionId, setSessionId] = useState(null);
  const [currentQuestion, setCurrentQuestion] = useState(null);
  const [progress, setProgress] = useState(null);
  const [answer, setAnswer] = useState('');
  const [lastResult, setLastResult] = useState(null);
  const [finalSummary, setFinalSummary] = useState(null);
  const resultRef = useRef(null);

  const loadSessions = () => {
    api.get(`/projects/${projectId}/adaptive-quiz/sessions`).then((res) => setSessions(res.data.sessions));
  };

  useEffect(() => {
    loadSessions();
    // eslint-disable-next-line
  }, [projectId]);

  const startQuiz = async () => {
    setView('starting');
    const res = await api.post(`/projects/${projectId}/adaptive-quiz/start`, { questionCount: 8 });
    setSessionId(res.data.sessionId);
    setCurrentQuestion(res.data.currentQuestion);
    setProgress(res.data.progress);
    setAnswer('');
    setLastResult(null);
    setView('question');
  };

  const resumeSession = async (session) => {
    const res = await api.get(`/adaptive-quiz/${session._id}`);
    setSessionId(session._id);
    if (res.data.status === 'completed') {
      setFinalSummary(res.data);
      setView('completed');
    } else {
      setCurrentQuestion(res.data.currentQuestion);
      setProgress(res.data.progress);
      setAnswer('');
      setLastResult(null);
      setView('question');
    }
  };

  const submitAnswer = async (e) => {
    e?.preventDefault();
    if (!sessionId) return;
    setView('grading');
    const res = await api.post(`/adaptive-quiz/${sessionId}/answer`, { userAnswer: answer });
    setLastResult(res.data);
    setProgress(res.data.progress);
    if (res.data.completed) {
      const full = await api.get(`/adaptive-quiz/${sessionId}`);
      setFinalSummary(full.data);
      setView('completed-feedback');
    } else {
      setView('answered');
    }
  };

  const continueToNext = () => {
    if (view === 'completed-feedback') {
      setView('completed');
      loadSessions();
      onChange?.();
      return;
    }
    setCurrentQuestion(lastResult.nextQuestion);
    setAnswer('');
    setLastResult(null);
    setView('question');
  };

  useEffect(() => {
    if (view === 'answered' || view === 'completed-feedback') {
      resultRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [view]);

  if (!sessions) return <Loader label="Loading quiz history..." />;

  if (view === 'starting') return <Loader label="Assessing your current mastery to pick the first question..." />;
  if (view === 'grading') return <Loader label="Evaluating your answer..." />;

  if (view === 'question' && currentQuestion) {
    return (
      <div className="space-y-4">
        <QuizProgressHeader progress={progress} question={currentQuestion} />
        <form onSubmit={submitAnswer} className="card p-5 space-y-4">
          <p className="font-medium text-slate-800">{currentQuestion.prompt}</p>
          {currentQuestion.type === 'short_answer' ? (
            <textarea
              className="input-field"
              rows={4}
              placeholder="Type your answer..."
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              autoFocus
            />
          ) : (
            <div className="space-y-2">
              {currentQuestion.options.map((opt) => (
                <label key={opt} className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="radio" name="answer" checked={answer === opt} onChange={() => setAnswer(opt)} />
                  {opt}
                </label>
              ))}
            </div>
          )}
          <button type="submit" disabled={!answer.trim()} className="btn-primary">Submit Answer</button>
        </form>
      </div>
    );
  }

  if ((view === 'answered' || view === 'completed-feedback') && lastResult) {
    return (
      <div className="space-y-4" ref={resultRef}>
        <QuizProgressHeader progress={progress} question={lastResult.answered} />
        <AnswerFeedbackCard result={lastResult} />
        <button onClick={continueToNext} className="btn-primary">
          {view === 'completed-feedback' ? 'See Final Summary' : 'Continue to Next Question →'}
        </button>
      </div>
    );
  }

  if (view === 'completed' && finalSummary) {
    return (
      <div className="space-y-4">
        <div className="card p-6 text-center">
          <p className="text-sm text-slate-500">Quiz Complete</p>
          <p className="text-4xl font-bold text-brand-600">{finalSummary.progress.score}%</p>
          <p className="text-sm text-slate-500 mt-1">{finalSummary.history.length} questions answered</p>
          <button onClick={() => setView('list')} className="btn-secondary mt-4">Back to Quizzes</button>
        </div>
        <div className="space-y-2">
          {finalSummary.history.map((h, i) => (
            <div key={i} className={`card p-3 text-sm ${h.isCorrect ? 'border-green-200' : 'border-red-200'}`}>
              <div className="flex items-center gap-2 mb-1">
                <span className="badge bg-slate-100 text-slate-600">{h.concept}</span>
                <span className={`badge ${DIFFICULTY_STYLE[h.difficulty]}`}>{h.difficulty}</span>
                <span className="badge bg-slate-100 text-slate-600">{TYPE_LABEL[h.type]}</span>
              </div>
              <p className="font-medium text-slate-700">{h.prompt}</p>
              <p className="text-slate-500">Your answer: {h.userAnswer || '(blank)'}</p>
              <p className={h.isCorrect ? 'text-green-600' : 'text-red-600'}>
                {h.isCorrect ? '✓ Correct' : '✗ Not quite'} - {h.feedback}
              </p>
              {h.evaluation?.missingConcepts?.length > 0 && (
                <div className="mt-1 text-xs text-slate-500">
                  Focus on: {h.evaluation.missingConcepts.map((c, j) => (
                    <span key={j} className="badge bg-amber-50 text-amber-700 ml-1">{c}</span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-slate-500">
          Each question adapts to your live mastery, recent mistakes, and concepts needing
          attention - not a fixed set generated all at once.
        </p>
        <button onClick={startQuiz} className="btn-primary">+ Start Adaptive Quiz</button>
      </div>

      {sessions.length === 0 ? (
        <EmptyState icon="📝" title="No quizzes yet" description="Add some materials first, then start an adaptive quiz to test your understanding one question at a time." />
      ) : (
        <div className="space-y-2">
          {sessions.map((s) => (
            <button
              key={s._id}
              onClick={() => resumeSession(s)}
              className="card p-4 w-full text-left flex items-center justify-between hover:shadow-sm transition"
            >
              <div>
                <p className="font-medium text-slate-800">
                  Adaptive Quiz {s.status === 'active' ? '(in progress)' : `- ${s.score}%`}
                </p>
                <p className="text-xs text-slate-400">{new Date(s.createdAt).toLocaleString()}</p>
              </div>
              <span className={`badge ${s.status === 'completed' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
                {s.status === 'completed' ? 'completed' : 'resume'}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function QuizProgressHeader({ progress, question }) {
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-2 text-sm">
        <span className="text-slate-500">Question {progress?.asked + (progress?.asked < progress?.total ? 1 : 0)} of {progress?.total}</span>
        <span className="text-slate-500">Score so far: {progress?.score}%</span>
      </div>
      <ProgressBar value={progress ? (progress.asked / progress.total) * 100 : 0} />
      <div className="flex flex-wrap gap-1.5 mt-3">
        <span className="badge bg-slate-100 text-slate-600">{question.concept}</span>
        <span className={`badge ${DIFFICULTY_STYLE[question.difficulty]}`}>{question.difficulty}</span>
        <span className="badge bg-slate-100 text-slate-600">{TYPE_LABEL[question.type]}</span>
      </div>
    </div>
  );
}

function AnswerFeedbackCard({ result }) {
  const { answered, masterySnapshot } = result;
  return (
    <div className={`card p-5 ${answered.isCorrect ? 'border-green-200' : 'border-amber-200'}`}>
      <p className={`font-semibold mb-2 ${answered.isCorrect ? 'text-green-700' : 'text-amber-700'}`}>
        {answered.isCorrect ? '✓ Correct' : '✗ Not quite right'}
      </p>
      <p className="text-sm text-slate-700 mb-3">{answered.feedback}</p>

      {answered.evaluation?.missingConcepts?.length > 0 && (
        <div className="mb-3">
          <p className="text-xs font-medium text-slate-500 mb-1">Focus on:</p>
          <div className="flex flex-wrap gap-1.5">
            {answered.evaluation.missingConcepts.map((c, i) => (
              <span key={i} className="badge bg-amber-50 text-amber-700">→ {c}</span>
            ))}
          </div>
        </div>
      )}

      {answered.evaluation?.keyConceptsCovered?.length > 0 && (
        <div className="mb-3">
          <p className="text-xs font-medium text-slate-500 mb-1">You covered well:</p>
          <div className="flex flex-wrap gap-1.5">
            {answered.evaluation.keyConceptsCovered.map((c, i) => (
              <span key={i} className="badge bg-green-50 text-green-700">{c}</span>
            ))}
          </div>
        </div>
      )}

      {!answered.isCorrect && answered.type !== 'short_answer' && (
        <p className="text-xs text-slate-500 mb-3">Correct answer: <span className="font-medium">{answered.correctAnswer}</span></p>
      )}

      <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
        <span>Concept affected: <span className="font-medium text-slate-700">{answered.concept}</span></span>
        <span>
          Updated mastery: <span className="font-medium text-slate-700">{masterySnapshot.masteryScore}%</span> ({masterySnapshot.trend})
        </span>
      </div>
    </div>
  );
}