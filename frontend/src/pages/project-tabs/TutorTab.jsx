import React, { useEffect, useRef, useState } from 'react';
import api from '../../api/axios';
import Loader from '../../components/Loader';

const GROUNDEDNESS_STYLE = {
  grounded: { label: '📚 Grounded in your materials', className: 'bg-green-100 text-green-700' },
  insufficient: { label: '💭 Not supported by your materials', className: 'bg-amber-100 text-amber-700' },
};

const QUICK_ACTIONS = [
  { label: 'Explain simpler', prompt: 'Can you explain that more simply?' },
  { label: 'Give an example', prompt: 'Can you give me a practical example of that?' },
  { label: 'Test my understanding', prompt: 'Test my understanding of this project - quiz me.' },
  { label: 'Related concepts', prompt: 'What related concepts should I explore next?' },
  { label: 'Revision plan', prompt: 'Based on my progress so far, make me a short revision plan.' },
];

const ACTION_LABELS = {
  search_project_materials: '🔍 Searched your materials',
  get_learner_progress: '📈 Checked your progress',
  get_weak_concepts: '🎯 Looked up weak concepts',
  get_assessment_history: '📝 Reviewed your assessment history',
  get_analytics_summary: '📊 Retrieved analytics',
  generate_quiz: '✅ Started generating a quiz',
  record_learning_event: '🧠 Recorded a learning note',
};

export default function TutorTab({ projectId, onNavigate }) {
  const [conversations, setConversations] = useState(null);
  const [activeId, setActiveId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef(null);

  const loadConversations = async () => {
    const res = await api.get(`/projects/${projectId}/tutor/conversations`);
    setConversations(res.data.conversations);
    if (res.data.conversations.length > 0 && !activeId) {
      setActiveId(res.data.conversations[0]._id);
    }
  };

  useEffect(() => {
    loadConversations();
    // eslint-disable-next-line
  }, [projectId]);

  const loadMessages = async (id) => {
    const res = await api.get(`/tutor/conversations/${id}/messages`);
    setMessages(res.data.messages);
  };

  useEffect(() => {
    if (activeId) loadMessages(activeId);
  }, [activeId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const startConversation = async () => {
    const res = await api.post(`/projects/${projectId}/tutor/conversations`, {});
    setConversations((c) => [res.data.conversation, ...(c || [])]);
    setActiveId(res.data.conversation._id);
    setMessages([]);
  };

  const sendContent = async (content) => {
    if (!content.trim() || !activeId) return;
    setMessages((m) => [...m, { role: 'user', content, _id: `tmp-${Date.now()}` }]);
    setSending(true);
    try {
      const res = await api.post(`/tutor/conversations/${activeId}/messages`, { content });
      setMessages((m) => [...m.filter((x) => !x._id.startsWith('tmp-')), res.data.userMessage, res.data.assistantMessage]);
    } finally {
      setSending(false);
    }
  };

  const send = async (e) => {
    e.preventDefault();
    const content = input;
    setInput('');
    await sendContent(content);
  };

  if (!conversations) return <Loader label="Loading Tutor sessions..." />;

  return (
    <div className="grid md:grid-cols-4 gap-4">
      <div className="md:col-span-1">
        <button onClick={startConversation} className="btn-primary w-full mb-3">+ New Session</button>
        <div className="space-y-1 max-h-[28rem] overflow-y-auto">
          {conversations.map((c) => (
            <button
              key={c._id}
              onClick={() => setActiveId(c._id)}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm truncate ${
                activeId === c._id ? 'bg-brand-50 text-brand-700 font-medium' : 'hover:bg-slate-100 text-slate-600'
              }`}
            >
              {c.title}
            </button>
          ))}
          {conversations.length === 0 && <p className="text-xs text-slate-400 px-2">No sessions yet.</p>}
        </div>
      </div>

      <div className="md:col-span-3 card p-0 flex flex-col h-[34rem]">
        {!activeId ? (
          <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">
            Start a new session to chat with your AI Tutor.
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.length === 0 && (
                <p className="text-sm text-slate-400 text-center mt-10">
                  Ask a question about this project's materials to get started.
                </p>
              )}
              {messages.map((m) => (
                <div key={m._id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] ${m.role === 'user' ? '' : 'w-full'}`}>
                    <div
                      className={`rounded-2xl px-4 py-2 text-sm whitespace-pre-wrap ${
                        m.role === 'user' ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-800'
                      }`}
                    >
                      {m.content}
                    </div>

                    {m.role === 'assistant' && (
                      <div className="mt-1.5 space-y-1.5">
                        {m.groundedness && (
                          <span className={`badge ${GROUNDEDNESS_STYLE[m.groundedness]?.className}`}>
                            {GROUNDEDNESS_STYLE[m.groundedness]?.label}
                          </span>
                        )}

                        {m.retrievalRefs?.length > 0 && (
                          <div className="space-y-1">
                            {dedupeSources(m.retrievalRefs).map((s, i) => (
                              <p key={i} className="text-xs text-slate-500">
                                📄 Source: <span className="font-medium text-slate-600">{s.title}</span>
                                {s.page ? ` - Page ${s.page}` : ''}
                              </p>
                            ))}
                          </div>
                        )}

                        {m.actions?.length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {m.actions.map((a, i) => (
                              <ActionChip key={i} action={a} onNavigate={onNavigate} />
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {sending && (
                <div className="flex justify-start">
                  <div className="bg-slate-100 rounded-2xl px-4 py-2 text-sm text-slate-400">Thinking...</div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            <div className="px-3 pt-2 flex flex-wrap gap-1.5 border-t border-slate-100">
              {QUICK_ACTIONS.map((qa) => (
                <button
                  key={qa.label}
                  onClick={() => sendContent(qa.prompt)}
                  disabled={sending}
                  className="text-xs px-2.5 py-1 rounded-full border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                >
                  {qa.label}
                </button>
              ))}
            </div>

            <form onSubmit={send} className="p-3 pt-2 flex gap-2">
              <input
                className="input-field flex-1"
                placeholder="Ask your AI Tutor anything about this project..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                disabled={sending}
              />
              <button type="submit" disabled={sending || !input.trim()} className="btn-primary">Send</button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

function ActionChip({ action, onNavigate }) {
  const label = ACTION_LABELS[action.name] || `⚙️ ${action.name}`;
  const isQuizStart = action.name === 'generate_quiz' && action.result?.started;

  if (isQuizStart && onNavigate) {
    return (
      <button
        onClick={() => onNavigate('quiz')}
        className="badge bg-brand-50 text-brand-700 hover:bg-brand-100 cursor-pointer"
      >
        {label} - view in Quiz tab →
      </button>
    );
  }

  return <span className="badge bg-slate-100 text-slate-600">{label}</span>;
}

function dedupeSources(retrievalRefs) {
  const seen = new Map();
  for (const ref of retrievalRefs) {
    const title = ref.materialId?.title || 'Material';
    const key = `${title}::${ref.page ?? ''}`;
    if (!seen.has(key)) seen.set(key, { title, page: ref.page });
  }
  return Array.from(seen.values());
}