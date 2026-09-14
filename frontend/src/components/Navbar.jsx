import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <>
      <style>{`
        @keyframes navFadeIn {
          from { opacity: 0; transform: translateY(-8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        .nav-enter { animation: navFadeIn 0.5s ease-out; }
        .nav-shimmer-line {
          background: linear-gradient(90deg, transparent, #818cf8, #fbbf24, #818cf8, transparent);
          background-size: 200% 100%;
          animation: shimmer 6s linear infinite;
        }
        .nav-link-underline {
          transition: width 0.28s cubic-bezier(0.4, 0, 0.2, 1);
        }
      `}</style>

      <header className="nav-enter border-b border-transparent bg-white/90 backdrop-blur sticky top-0 z-20 shadow-[0_4px_20px_-8px_rgba(67,56,202,0.15)]">
        <div className="h-[2px] w-full nav-shimmer-line" />

        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <Link
            to="/dashboard"
            className="group flex items-center gap-2.5 font-semibold text-indigo-950"
          >
            <span className="h-9 w-9 rounded-lg bg-gradient-to-br from-indigo-600 to-violet-600 flex items-center justify-center shrink-0 shadow-md shadow-indigo-600/30 transition-transform duration-300 ease-out group-hover:scale-110 group-hover:rotate-6">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M4 5.5C4 4.67 4.67 4 5.5 4H11V20H5.5C4.67 20 4 19.33 4 18.5V5.5Z" stroke="white" strokeWidth="1.6" strokeLinejoin="round"/>
                <path d="M20 5.5C20 4.67 19.33 4 18.5 4H13V20H18.5C19.33 20 20 19.33 20 18.5V5.5Z" stroke="white" strokeWidth="1.6" strokeLinejoin="round"/>
              </svg>
            </span>
            <span
              className="tracking-tight transition-colors duration-300 group-hover:text-indigo-700"
              style={{ fontFamily: "'Lora', Georgia, serif" }}
            >
              AI Study Companion
            </span>
          </Link>

          {user && (
            <div className="flex items-center gap-1 text-sm">
              <nav className="flex items-center gap-1 mr-3">
                <Link to="/dashboard" className="group relative px-3 py-2 text-slate-600 font-medium">
                  <span className="relative z-10 transition-colors duration-200 group-hover:text-indigo-700">Spaces</span>
                  <span className="nav-link-underline absolute left-3 right-3 -bottom-0.5 h-0.5 w-0 bg-gradient-to-r from-indigo-600 to-violet-500 rounded-full group-hover:w-[calc(100%-1.5rem)]" />
                </Link>
                <Link to="/analytics" className="group relative px-3 py-2 text-slate-600 font-medium">
                  <span className="relative z-10 transition-colors duration-200 group-hover:text-indigo-700">Growth</span>
                  <span className="nav-link-underline absolute left-3 right-3 -bottom-0.5 h-0.5 w-0 bg-gradient-to-r from-indigo-600 to-violet-500 rounded-full group-hover:w-[calc(100%-1.5rem)]" />
                </Link>
                {user.role === 'admin' && (
                  <Link to="/admin" className="group relative px-3 py-2 text-slate-600 font-medium">
                    <span className="relative z-10 transition-colors duration-200 group-hover:text-indigo-700">Admin</span>
                    <span className="nav-link-underline absolute left-3 right-3 -bottom-0.5 h-0.5 w-0 bg-gradient-to-r from-indigo-600 to-violet-500 rounded-full group-hover:w-[calc(100%-1.5rem)]" />
                  </Link>
                )}
              </nav>

              <div className="w-px h-6 bg-gradient-to-b from-transparent via-indigo-200 to-transparent mr-3" />

              <div className="group flex items-center gap-2 mr-3 cursor-default">
                <span className="h-7 w-7 rounded-full bg-gradient-to-br from-amber-300 to-amber-500 text-white text-xs font-semibold flex items-center justify-center shadow-sm transition-transform duration-300 group-hover:scale-110">
                  {user.name?.charAt(0).toUpperCase()}
                </span>
                <span className="text-slate-600 font-medium">{user.name}</span>
              </div>

              <button
                onClick={() => { logout(); navigate('/login'); }}
                className="group relative flex items-center gap-1.5 overflow-hidden rounded-lg border border-indigo-200 px-3.5 py-1.5 text-sm font-medium text-indigo-700 transition-all duration-300 hover:border-transparent hover:text-white active:scale-[0.97]"
              >
                <span className="absolute inset-0 -z-10 origin-left scale-x-0 bg-gradient-to-r from-indigo-600 to-violet-600 transition-transform duration-300 ease-out group-hover:scale-x-100" />
                Logout
                <svg
                  className="h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-0.5"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path fillRule="evenodd" d="M3 10a.75.75 0 01.75-.75h9.19L9.72 6.03a.75.75 0 111.06-1.06l4.5 4.5a.75.75 0 010 1.06l-4.5 4.5a.75.75 0 11-1.06-1.06l3.22-3.22H3.75A.75.75 0 013 10z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
          )}
        </div>
      </header>
    </>
  );
}