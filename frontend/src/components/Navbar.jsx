import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <header className="border-b border-slate-200 bg-white sticky top-0 z-20">
      <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
        <Link to="/dashboard" className="font-semibold text-slate-800 flex items-center gap-2">
          <span className="text-xl">🧠</span> AI Study Companion
        </Link>
        {user && (
          <div className="flex items-center gap-4 text-sm">
            <Link to="/dashboard" className="text-slate-600 hover:text-brand-600">Spaces</Link>
            <Link to="/analytics" className="text-slate-600 hover:text-brand-600">Growth</Link>
            {user.role === 'admin' && (
              <Link to="/admin" className="text-slate-600 hover:text-brand-600">Admin</Link>
            )}
            <span className="text-slate-400">|</span>
            <span className="text-slate-500">{user.name}</span>
            <button
              onClick={() => { logout(); navigate('/login'); }}
              className="btn-secondary !px-3 !py-1.5"
            >
              Logout
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
