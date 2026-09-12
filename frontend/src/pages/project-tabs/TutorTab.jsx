import React, { useEffect, useRef, useState } from 'react';
import api from '../../api/axios';
import Loader from '../../components/Loader';

const GROUNDEDNESS_STYLE = {
  grounded: { label: '📚 Grounded in your materials', className: 'bg-green-100 text-green-700' },
  insufficient: { label: '💭 General knowledge - no matching material found', className: 'bg-amber-100 text-amber-700' },
};

export default function TutorTab({ projectId }) {
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

  const send = async (e) => {
    e.preventDefault();
    if (!input.trim() || !activeId) return;
    const content = input;
    setInput('');
    setMessages((m) => [...m, { role: 'user', content, _id: `tmp-${Date.now()}` }]);
    setSending(true);
    try {
      const res = await api.post(`/tutor/conversations/${activeId}/messages`, { content });
      setMessages((m) => [...m.filter((x) => !x._id.startsWith('tmp-')), res.data.userMessage, res.data.assistantMessage]);
    } finally {
      setSending(false);
    }
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

      <div className="md:col-span-3 card p-0 flex flex-col h-[32rem]">
        {!activeId ? (
          <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">
            Start a new session to chat with your AI Tutor.
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages.length === 0 && (
                <p className="text-sm text-slate-400 text-center mt-10">
                  Ask a question about this project's materials to get started.
                </p>
              )}
              {messages.map((m) => (
                <div key={m._id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] ${m.role === 'user' ? '' : 'w-full'}`}>
                    <div
                      className={`rounded-2xl px-4 py-2 text-sm whitespace-pre-wrap ${
                        m.role === 'user' ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-800'
                      }`}
                    >
                      {m.content}
                    </div>

                    {m.role === 'assistant' && m.groundedness && (
                      <div className="mt-1.5 space-y-1.5">
                        <span className={`badge ${GROUNDEDNESS_STYLE[m.groundedness]?.className}`}>
                          {GROUNDEDNESS_STYLE[m.groundedness]?.label}
                        </span>
                        {m.retrievalRefs?.length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {dedupeSources(m.retrievalRefs).map((s, i) => (
                              <span key={i} className="badge bg-white border border-slate-200 text-slate-600">
                                📄 {s.title}{s.page ? ` · p.${s.page}` : ''}
                              </span>
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
            <form onSubmit={send} className="border-t border-slate-200 p-3 flex gap-2">
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

function dedupeSources(retrievalRefs) {
  const seen = new Map();
  for (const ref of retrievalRefs) {
    const title = ref.materialId?.title || 'Material';
    const key = `${title}::${ref.page ?? ''}`;
    if (!seen.has(key)) seen.set(key, { title, page: ref.page });
  }
  return Array.from(seen.values());
}