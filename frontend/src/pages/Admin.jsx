import React, { useEffect, useState } from 'react';
import api from '../api/axios';
import Loader from '../components/Loader';

const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'users', label: 'Users' },
  { key: 'ai', label: 'AI Usage' },
  { key: 'health', label: 'System Health' },
  { key: 'activity', label: 'Activity' },
];

export default function Admin() {
  const [tab, setTab] = useState('overview');

  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-800 mb-1">Admin Dashboard</h1>
      <p className="text-sm text-slate-500 mb-6">Monitor users, learning activity, AI usage, and system health.</p>

      <div className="flex gap-1 border-b border-slate-200 mb-6">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition ${
              tab === t.key ? 'border-brand-600 text-brand-600' : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && <OverviewPanel />}
      {tab === 'users' && <UsersPanel />}
      {tab === 'ai' && <AIUsagePanel />}
       {tab === 'health' && <SystemHealthPanel />}
      {tab === 'activity' && <ActivityPanel />}
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="card p-4 text-center">
      <p className="text-xl font-semibold text-slate-800">{value}</p>
      <p className="text-xs text-slate-500 mt-0.5">{label}</p>
    </div>
  );
}

function OverviewPanel() {
  const [data, setData] = useState(null);
  useEffect(() => {
    api.get('/admin/overview').then((res) => setData(res.data));
  }, []);
  if (!data) return <Loader label="Loading overview..." />;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
      <Stat label="Total Users" value={data.totalUsers} />
      <Stat label="Active (7d)" value={data.activeUsersLast7d} />
      <Stat label="Spaces" value={data.totalSpaces} />
      <Stat label="Projects" value={data.totalProjects} />
      <Stat label="Materials" value={`${data.materialsReady}/${data.totalMaterials} ready`} />
      <Stat label="Quiz Attempts" value={data.totalQuizAttempts} />
      <Stat label="Tutor Conversations" value={data.totalConversations} />
    </div>
  );
}

function UsersPanel() {
  const [data, setData] = useState(null);
  const load = () => api.get('/admin/users').then((res) => setData(res.data));
  useEffect(load, []);
  if (!data) return <Loader label="Loading users..." />;

  const toggleActive = async (u) => {
    await api.patch(`/admin/users/${u._id}`, { isActive: !u.isActive });
    load();
  };
  const toggleRole = async (u) => {
    await api.patch(`/admin/users/${u._id}`, { role: u.role === 'admin' ? 'user' : 'admin' });
    load();
  };

  return (
    <div className="card overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-slate-500 text-left">
          <tr>
            <th className="p-3">Name</th>
            <th className="p-3">Email</th>
            <th className="p-3">Role</th>
            <th className="p-3">Status</th>
            <th className="p-3">Joined</th>
            <th className="p-3">Actions</th>
          </tr>
        </thead>
        <tbody>
          {data.users.map((u) => (
            <tr key={u._id} className="border-t border-slate-100">
              <td className="p-3 font-medium text-slate-800">{u.name}</td>
              <td className="p-3 text-slate-500">{u.email}</td>
              <td className="p-3">
                <span className={`badge ${u.role === 'admin' ? 'bg-brand-100 text-brand-700' : 'bg-slate-100 text-slate-600'}`}>{u.role}</span>
              </td>
              <td className="p-3">
                <span className={`badge ${u.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                  {u.isActive ? 'active' : 'disabled'}
                </span>
              </td>
              <td className="p-3 text-slate-400">{new Date(u.createdAt).toLocaleDateString()}</td>
              <td className="p-3 flex gap-2">
                <button onClick={() => toggleActive(u)} className="btn-secondary !px-2 !py-1 text-xs">
                  {u.isActive ? 'Disable' : 'Enable'}
                </button>
                <button onClick={() => toggleRole(u)} className="btn-secondary !px-2 !py-1 text-xs">
                  {u.role === 'admin' ? 'Revoke admin' : 'Make admin'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AIUsagePanel() {
  const [data, setData] = useState(null);
  useEffect(() => {
    api.get('/admin/ai-usage').then((res) => setData(res.data));
  }, []);
  if (!data) return <Loader label="Loading AI usage..." />;

  const t = data.totals || {};

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        <Stat label="Total Requests" value={t.totalRequests || 0} />
        <Stat label="Avg Latency" value={`${Math.round(t.avgLatencyMs || 0)}ms`} />
        <Stat label="Input Tokens" value={t.totalInputTokens || 0} />
        <Stat label="Output Tokens" value={t.totalOutputTokens || 0} />
        <Stat label="Est. Cost" value={`$${(t.totalCostUsd || 0).toFixed(3)}`} />
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-left">
            <tr>
              <th className="p-3">Purpose</th>
              <th className="p-3">Requests</th>
              <th className="p-3">Avg Latency</th>
              <th className="p-3">Errors</th>
              <th className="p-3">Est. Cost</th>
            </tr>
          </thead>
          <tbody>
            {data.byPurpose.map((p) => (
              <tr key={p._id} className="border-t border-slate-100">
                <td className="p-3 font-medium text-slate-800">{p._id}</td>
                <td className="p-3">{p.count}</td>
                <td className="p-3">{Math.round(p.avgLatencyMs)}ms</td>
                <td className="p-3 text-red-600">{p.errorCount}</td>
                <td className="p-3">${p.totalCostUsd.toFixed(4)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SystemHealthPanel() {
  const [data, setData] = useState(null);
  useEffect(() => {
    api.get('/admin/system-health').then((res) => setData(res.data));
  }, []);
  if (!data) return <Loader label="Loading system health..." />;

  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-semibold text-slate-700 mb-3">Background Job Status Breakdown</h3>
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-left">
              <tr><th className="p-3">Type</th><th className="p-3">Status</th><th className="p-3">Count</th></tr>
            </thead>
            <tbody>
              {data.statusBreakdown.map((s, i) => (
                <tr key={i} className="border-t border-slate-100">
                  <td className="p-3">{s._id.type}</td>
                  <td className="p-3">
                    <span className={`badge ${
                      s._id.status === 'completed' ? 'bg-green-100 text-green-700' :
                      s._id.status === 'failed' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'
                    }`}>{s._id.status}</span>
                  </td>
                  <td className="p-3">{s.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <h3 className="font-semibold text-slate-700 mb-3">Avg Duration by Job Type (completed)</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {data.avgDurationByType.map((d) => (
            <Stat key={d._id} label={d._id} value={`${Math.round(d.avgDurationMs)}ms`} />
          ))}
        </div>
      </div>

      {data.recentFailures.length > 0 && (
        <div>
          <h3 className="font-semibold text-slate-700 mb-3">Recent Failures</h3>
          <div className="space-y-2">
            {data.recentFailures.map((f) => (
              <div key={f._id} className="card p-3 text-sm border-red-200">
                <p className="font-medium text-slate-800">{f.type}</p>
                <p className="text-red-600 text-xs">{f.error}</p>
                <p className="text-slate-400 text-xs">{new Date(f.createdAt).toLocaleString()}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}



function ActivityPanel() {
  const [data, setData] = useState(null);
  useEffect(() => {
    api.get('/admin/activity').then((res) => setData(res.data));
  }, []);
  if (!data) return <Loader label="Loading activity feed..." />;

  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-semibold text-slate-700 mb-3">Event Type Breakdown</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {data.typeBreakdown.map((t) => (
            <Stat key={t._id} label={t._id} value={t.count} />
          ))}
        </div>
      </div>

      {data.failedEvents.length > 0 && (
        <div>
          <h3 className="font-semibold text-slate-700 mb-3">⚠️ Events With Failed Listeners</h3>
          <div className="space-y-2">
            {data.failedEvents.map((e) => (
              <div key={e._id} className="card p-3 text-sm border-red-200">
                <p className="font-medium text-slate-800">{e.type} - {e.message}</p>
                {e.processingErrors.map((pe, i) => (
                  <p key={i} className="text-red-600 text-xs">
                    Listener "{pe.listener}": {pe.error}
                  </p>
                ))}
                <p className="text-slate-400 text-xs">{new Date(e.createdAt).toLocaleString()}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <h3 className="font-semibold text-slate-700 mb-3">Recent Events</h3>
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-left">
              <tr>
                <th className="p-3">Type</th>
                <th className="p-3">Message</th>
                <th className="p-3">User</th>
                <th className="p-3">When</th>
              </tr>
            </thead>
            <tbody>
              {data.events.map((e) => (
                <tr key={e._id} className="border-t border-slate-100">
                  <td className="p-3"><span className="badge bg-slate-100 text-slate-600">{e.type}</span></td>
                  <td className="p-3 text-slate-700">{e.message}</td>
                  <td className="p-3 text-slate-500">{e.user?.email || '-'}</td>
                  <td className="p-3 text-slate-400">{new Date(e.createdAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}