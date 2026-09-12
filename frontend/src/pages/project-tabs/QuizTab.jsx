import React, { useEffect, useRef, useState } from 'react';
import api from '../../api/axios';
import EmptyState from '../../components/EmptyState';
import Loader from '../../components/Loader';

export default function QuizTab({ projectId, onChange }) {
  const [quizzes, setQuizzes] = useState(null);
  const [view, setView] = useState('list'); // list | generating | taking | evaluating | result
  const [activeQuiz, setActiveQuiz] = useState(null);
  const [answers, setAnswers] = useState({});
  const [attempt, setAttempt] = useState(null);
  const pollRef = useRef(null);

  const loadQuizzes = () => {
    api.get(`/projects/${projectId}/quizzes`).then((res) => setQuizzes(res.data.quizzes));
  };

  useEffect(() => {
    loadQuizzes();
    return () => clearInterval(pollRef.current);
    // eslint-disable-next-line
  }, [projectId]);

  const generateQuiz = async () => {
    setView('generating');
    const res = await api.post(`/projects/${projectId}/quizzes`);
    const quizId = res.data.quiz._id;
    pollRef.current = setInterval(async () => {
      const r = await api.get(`/quizzes/${quizId}/take`);
      if (r.data.quiz.status === 'ready') {
        clearInterval(pollRef.current);
        setActiveQuiz(r.data.quiz);
        setAnswers({});
        setView('taking');
        loadQuizzes();
      } else if (r.data.quiz.status === 'failed') {
        clearInterval(pollRef.current);
        setView('list');
        alert('Quiz generation failed. Please try again - make sure this project has processed materials.');
      }
    }, 2500);
  };

  const openQuiz = async (quiz) => {
    const r = await api.get(`/quizzes/${quiz._id}/take`);
    setActiveQuiz(r.data.quiz);
    setAnswers({});
    setView('taking');
  };

  const submit = async () => {
    const formatted = activeQuiz.questions.map((q) => ({ questionId: q._id, userAnswer: answers[q._id] || '' }));
    setView('evaluating');
    const res = await api.post(`/quizzes/${activeQuiz._id}/attempts`, { answers: formatted });
    const attemptId = res.data.attempt._id;
    pollRef.current = setInterval(async () => {
      const r = await api.get(`/quiz-attempts/${attemptId}`);
      if (r.data.attempt.status === 'evaluated') {
        clearInterval(pollRef.current);
        setAttempt(r.data.attempt);
        setView('result');
        onChange?.();
      }
    }, 2000);
  };

  if (!quizzes) return <Loader label="Loading quizzes..." />;

  if (view === 'generating') {
    return <Loader label="Generating your adaptive quiz - targeting concepts you're weaker on..." />;
  }

  if (view === 'evaluating') {
    return <Loader label="Grading your answers with AI..." />;
  }

  if (view === 'taking' && activeQuiz) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-slate-800">{activeQuiz.title}</h3>
          <button onClick={() => setView('list')} className="btn-secondary !py-1.5 text-xs">Cancel</button>
        </div>
        {activeQuiz.questions.map((q, idx) => (
          <div key={q._id} className="card p-4">
            <p className="text-xs text-brand-600 font-medium mb-1">{q.concept} · {q.difficulty}</p>
            <p className="font-medium text-slate-800 mb-3">{idx + 1}. {q.prompt}</p>
            {q.type === 'short_answer' ? (
              <textarea
                className="input-field"
                rows={2}
                placeholder="Your answer..."
                value={answers[q._id] || ''}
                onChange={(e) => setAnswers((a) => ({ ...a, [q._id]: e.target.value }))}
              />
            ) : (
              <div className="space-y-2">
                {q.options.map((opt) => (
                  <label key={opt} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="radio"
                      name={q._id}
                      checked={answers[q._id] === opt}
                      onChange={() => setAnswers((a) => ({ ...a, [q._id]: opt }))}
                    />
                    {opt}
                  </label>
                ))}
              </div>
            )}
          </div>
        ))}
        <button onClick={submit} className="btn-primary">Submit Quiz</button>
      </div>
    );
  }

  if (view === 'result' && attempt) {
    return (
      <div className="space-y-4">
        <div className="card p-6 text-center">
          <p className="text-sm text-slate-500">Your Score</p>
          <p className="text-4xl font-bold text-brand-600">{attempt.score}%</p>
          <p className="text-sm text-slate-500 mt-1">{attempt.correctCount} / {attempt.totalQuestions} correct</p>
          <button onClick={() => setView('list')} className="btn-secondary mt-4">Back to Quizzes</button>
        </div>
        <div className="space-y-2">
          {attempt.answers.map((a, i) => (
            <div key={i} className={`card p-3 text-sm ${a.isCorrect ? 'border-green-200' : 'border-red-200'}`}>
              <p className="font-medium text-slate-700">{a.concept}</p>
              <p className="text-slate-500">Your answer: {a.userAnswer || '(blank)'}</p>
              <p className={a.isCorrect ? 'text-green-600' : 'text-red-600'}>
                {a.isCorrect ? '✓ Correct' : '✗ Incorrect'} {a.aiEvaluationNote && `- ${a.aiEvaluationNote}`}
              </p>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-slate-500">Adaptive quizzes are generated to target the concepts you need to reinforce most.</p>
        <button onClick={generateQuiz} className="btn-primary">+ Generate Quiz</button>
      </div>

      {quizzes.length === 0 ? (
        <EmptyState icon="📝" title="No quizzes yet" description="Add some materials first, then generate an adaptive quiz to test your understanding." />
      ) : (
        <div className="space-y-2">
          {quizzes.map((q) => (
            <button
              key={q._id}
              onClick={() => q.status === 'ready' && openQuiz(q)}
              disabled={q.status !== 'ready'}
              className="card p-4 w-full text-left flex items-center justify-between hover:shadow-sm transition disabled:opacity-60"
            >
              <div>
                <p className="font-medium text-slate-800">{q.title}</p>
                <p className="text-xs text-slate-400">{new Date(q.createdAt).toLocaleString()}</p>
              </div>
              <span className={`badge ${
                q.status === 'ready' ? 'bg-green-100 text-green-700' : q.status === 'failed' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'
              }`}>
                {q.status}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
