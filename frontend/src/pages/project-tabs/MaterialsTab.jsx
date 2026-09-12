import React, { useEffect, useRef, useState } from 'react';
import api from '../../api/axios';
import EmptyState from '../../components/EmptyState';
import ProgressBar from '../../components/ProgressBar';

const STAGE_LABELS = {
  queued: 'Queued',
  reading_content: 'Reading Content',
  understanding_structure: 'Understanding Structure',
  extracting_knowledge: 'Extracting Knowledge',
  creating_search_index: 'Creating Searchable Representation',
  ready: 'Ready',
  failed: 'Failed',
};

const STATUS_STYLES = {
  pending: 'bg-slate-100 text-slate-600',
  processing: 'bg-blue-100 text-blue-700 animate-pulse',
  ready: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
};

const IN_PROGRESS_STAGES = [
  'queued',
  'reading_content',
  'understanding_structure',
  'extracting_knowledge',
  'creating_search_index',
];

export default function MaterialsTab({ projectId, onChange }) {
  const [materials, setMaterials] = useState(null);
  const [mode, setMode] = useState(null);
  const [textForm, setTextForm] = useState({ title: '', content: '' });
  const [submitting, setSubmitting] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const [detail, setDetail] = useState(null);
  const fileRef = useRef(null);
  const pollRef = useRef(null);

  const load = () => {
    api.get(`/projects/${projectId}/materials`).then((res) => setMaterials(res.data.materials));
  };

  useEffect(() => {
    load();
    return () => clearInterval(pollRef.current);
    // eslint-disable-next-line
  }, [projectId]);

  useEffect(() => {
    clearInterval(pollRef.current);
    if (materials?.some((m) => IN_PROGRESS_STAGES.includes(m.processingStage))) {
      pollRef.current = setInterval(load, 2500);
    }
    return () => clearInterval(pollRef.current);
    // eslint-disable-next-line
  }, [materials]);

  const submitText = async (e) => {
    e.preventDefault();
    if (!textForm.title.trim() || !textForm.content.trim()) return;
    setSubmitting(true);
    try {
      await api.post(`/projects/${projectId}/materials/text`, textForm);
      setTextForm({ title: '', content: '' });
      setMode(null);
      load();
      onChange?.();
    } finally {
      setSubmitting(false);
    }
  };

  const submitFile = async (e) => {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      await api.post(`/projects/${projectId}/materials/upload`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setMode(null);
      load();
      onChange?.();
    } finally {
      setSubmitting(false);
    }
  };

  const remove = async (id) => {
    if (!confirm('Delete this material?')) return;
    await api.delete(`/materials/${id}`);
    load();
    onChange?.();
  };

  const reprocess = async (id) => {
    await api.post(`/materials/${id}/reprocess`);
    load();
  };

  const openDetail = async (material) => {
    if (expanded === material._id) {
      setExpanded(null);
      return;
    }
    setExpanded(material._id);
    const res = await api.get(`/materials/${material._id}`);
    setDetail(res.data.material);
  };

  if (!materials) return null;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-slate-500">
          Materials are processed in the background through several stages: reading content,
          understanding structure, extracting knowledge, and building a searchable representation.
        </p>
        <div className="flex gap-2">
          <button className="btn-secondary" onClick={() => setMode(mode === 'text' ? null : 'text')}>+ Paste text</button>
          <button className="btn-primary" onClick={() => setMode(mode === 'file' ? null : 'file')}>+ Upload file</button>
        </div>
      </div>

      {mode === 'text' && (
        <form onSubmit={submitText} className="card p-5 mb-6 space-y-3">
          <input
            className="input-field"
            placeholder="Title"
            value={textForm.title}
            onChange={(e) => setTextForm((f) => ({ ...f, title: e.target.value }))}
            required
          />
          <textarea
            className="input-field"
            placeholder="Paste your notes / study material here..."
            rows={6}
            value={textForm.content}
            onChange={(e) => setTextForm((f) => ({ ...f, content: e.target.value }))}
            required
          />
          <button type="submit" disabled={submitting} className="btn-primary">
            {submitting ? 'Adding...' : 'Add Material'}
          </button>
        </form>
      )}

      {mode === 'file' && (
        <form onSubmit={submitFile} className="card p-5 mb-6 space-y-3">
          <input ref={fileRef} type="file" accept=".pdf,.txt" className="input-field" required />
          <p className="text-xs text-slate-400">
            Supported: .pdf, .txt (max 15MB). Scanned/image-only PDFs are detected and flagged -
            OCR isn't supported yet in this prototype.
          </p>
          <button type="submit" disabled={submitting} className="btn-primary">
            {submitting ? 'Uploading...' : 'Upload'}
          </button>
        </form>
      )}

      {materials.length === 0 ? (
        <EmptyState icon="📄" title="No materials yet" description="Add notes, paste text, or upload a PDF to give your AI Tutor something to teach from." />
      ) : (
        <div className="space-y-3">
          {materials.map((m) => (
            <div key={m._id} className="card p-4">
              <div className="flex items-center justify-between">
                <button className="text-left flex-1" onClick={() => openDetail(m)}>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-slate-800">{m.title}</span>
                    <span className={`badge ${STATUS_STYLES[m.processingStatus]}`}>
                      {STAGE_LABELS[m.processingStage] || m.processingStatus}
                    </span>
                    {m.possiblyScanned && (
                      <span className="badge bg-amber-100 text-amber-700">⚠ Possibly scanned</span>
                    )}
                    {m.retryCount > 0 && m.processingStatus !== 'ready' && (
                      <span className="badge bg-slate-100 text-slate-500">Retry {m.retryCount}</span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {m.type} · added {new Date(m.createdAt).toLocaleDateString()}
                    {m.pageCount > 1 ? ` · ${m.pageCount} pages` : ''}
                  </p>
                  {IN_PROGRESS_STAGES.includes(m.processingStage) && (
                    <div className="mt-2 max-w-xs">
                      <ProgressBar value={m.processingProgress || 0} />
                    </div>
                  )}
                </button>
                <div className="flex gap-2">
                  {m.processingStatus === 'failed' && (
                    <button onClick={() => reprocess(m._id)} className="btn-secondary !px-3 !py-1.5 text-xs">Retry</button>
                  )}
                  <button onClick={() => remove(m._id)} className="btn-secondary !px-3 !py-1.5 text-xs text-red-600">Delete</button>
                </div>
              </div>

              {expanded === m._id && detail && detail._id === m._id && (
                <div className="mt-3 pt-3 border-t border-slate-100 text-sm">
                  {detail.knowledge?.summary ? (
                    <>
                      <p className="text-slate-600 mb-2">{detail.knowledge.summary}</p>
                      <div className="flex flex-wrap gap-1.5 mb-2">
                        {detail.knowledge.keyConcepts?.map((c, i) => (
                          <span key={i} className="badge bg-brand-50 text-brand-700">{c}</span>
                        ))}
                      </div>
                      <p className="text-xs text-slate-400">
                        {detail.knowledge.chunks?.length || 0} searchable chunks
                        {detail.structure?.hasTables ? ' · tables detected' : ''}
                        {detail.structure?.headingCount ? ` · ${detail.structure.headingCount} headings` : ''}
                      </p>
                    </>
                  ) : (
                    <p className="text-slate-400 italic">Processing not complete yet.</p>
                  )}
                  {detail.processingError && (
                    <p className="text-red-600 mt-2">
                      {detail.processingStatus === 'failed' ? 'Failed: ' : 'Last attempt error (retrying): '}
                      {detail.processingError}
                    </p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}