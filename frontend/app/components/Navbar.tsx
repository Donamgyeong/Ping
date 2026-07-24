"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { Radio, Rss, MessageSquare, User, LogOut, LogIn } from 'lucide-react';

export default function Navbar() {
  const { token, uid, logout } = useAuth();
  const isLoggedIn = !!token;
  const pathname = usePathname();

  return (
    <nav className="sticky top-0 z-40 bg-gray-950/80 backdrop-blur-md border-b border-gray-800/80">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <div className="flex items-center">
            <Link href="/" className="flex items-center gap-2 group">
              <div className="w-9 h-9 rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400 group-hover:scale-105 transition-transform">
                <Radio className="w-5 h-5 animate-pulse" />
              </div>
              <span className="text-xl font-black bg-gradient-to-r from-white via-gray-200 to-gray-400 bg-clip-text text-transparent tracking-tight">
                PING
              </span>
            </Link>

            {/* Navigation Links */}
            <div className="hidden md:flex items-center ml-10 space-x-2">
              <Link
                href="/feed"
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  pathname === '/feed'
                    ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30'
                    : 'text-gray-400 hover:text-white hover:bg-gray-900/60'
                }`}
              >
                <Rss className="w-4 h-4" />
                <span>Feed</span>
              </Link>
              <Link
                href="/chat"
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  pathname.startsWith('/chat')
                    ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30'
                    : 'text-gray-400 hover:text-white hover:bg-gray-900/60'
                }`}
              >
                <MessageSquare className="w-4 h-4" />
                <span>Chat</span>
              </Link>
              {isLoggedIn && (
                <Link
                  href={`/user/profile/${uid}`}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                    pathname.startsWith('/user/profile')
                      ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30'
                      : 'text-gray-400 hover:text-white hover:bg-gray-900/60'
                  }`}
                >
                  <User className="w-4 h-4" />
                  <span>Profile</span>
                </Link>
              )}
            </div>
          </div>

          {/* Right Action */}
          <div className="flex items-center">
            {isLoggedIn ? (
              <button
                onClick={logout}
                className="flex items-center gap-1.5 text-xs font-semibold text-gray-400 hover:text-red-400 bg-gray-900 hover:bg-red-950/30 border border-gray-800 hover:border-red-900/50 px-3.5 py-2 rounded-xl transition-all cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
                <span>Log Out</span>
              </button>
            ) : (
              <div className="flex items-center space-x-3">
                <Link
                  href="/user/login"
                  className="flex items-center gap-1 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold transition-all shadow-md shadow-blue-600/20"
                >
                  <LogIn className="w-4 h-4" />
                  <span>Log In</span>
                </Link>
                <Link
                  href="/user/join"
                  className="px-4 py-2 bg-gray-900 hover:bg-gray-800 border border-gray-800 text-gray-300 hover:text-white rounded-xl text-xs font-semibold transition-all"
                >
                  Sign Up
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
