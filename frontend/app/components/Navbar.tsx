"use client";

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { Radio, Rss, MessageSquare, User, LogOut, LogIn, Grid, Bell } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export default function Navbar() {
  const { token, uid, logout, authFetch } = useAuth();
  const isLoggedIn = !!token;
  const pathname = usePathname();
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!isLoggedIn) {
      setUnreadCount(0);
      return;
    }

    const fetchUnreadCount = async () => {
      try {
        const res = await authFetch(`${API_URL}/notification/get/count`);
        if (res.ok) {
          const data = await res.json();
          if (data.result === 'OK' && typeof data.cnt === 'number') {
            setUnreadCount(data.cnt > 0 ? data.cnt : 0);
          }
        }
      } catch (error) {
        console.error('Failed to fetch notification count:', error);
      }
    };

    fetchUnreadCount();
    const interval = setInterval(fetchUnreadCount, 15000);
    return () => clearInterval(interval);
  }, [isLoggedIn, pathname, authFetch]);

  const isInsideChat = pathname.startsWith('/chat/') && pathname !== '/chat';

  return (
    <>
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
                  href="/region"
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                    pathname.startsWith('/region') || pathname.startsWith('/feed/region')
                      ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30'
                      : 'text-gray-400 hover:text-white hover:bg-gray-900/60'
                  }`}
                >
                  <Grid className="w-4 h-4" />
                  <span>Region</span>
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
                <div className="flex items-center space-x-3">
                  <Link
                    href="/notification"
                    title="알림 목록"
                    className={`relative p-2.5 rounded-xl border transition-all ${
                      pathname.startsWith('/notification')
                        ? 'bg-blue-600/20 text-blue-400 border-blue-500/30'
                        : 'bg-gray-900/80 text-gray-400 hover:text-white border-gray-800 hover:bg-gray-900'
                    }`}
                  >
                    <Bell className="w-4 h-4" />
                    {unreadCount > 0 && (
                      <span className="absolute -top-1 -right-1 flex items-center justify-center text-[10px] font-bold text-white bg-red-500 rounded-full h-4 min-w-[16px] px-1 ring-2 ring-gray-950 animate-pulse">
                        {unreadCount > 99 ? '99+' : unreadCount}
                      </span>
                    )}
                  </Link>
                  <button
                    onClick={logout}
                    className="flex items-center gap-1.5 text-xs font-semibold text-gray-400 hover:text-red-400 bg-gray-900 hover:bg-red-950/30 border border-gray-800 hover:border-red-900/50 px-3.5 py-2 rounded-xl transition-all cursor-pointer"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>Log Out</span>
                  </button>
                </div>
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

      {/* Mobile Bottom Navigation Bar */}
      {!isInsideChat && (
        <div className="md:hidden fixed bottom-0 left-0 right-0 z-[9999] bg-gray-950/95 border-t border-gray-800/80 backdrop-blur-lg px-4 py-2 flex items-center justify-around shadow-2xl">
          <Link
            href="/"
            className={`flex flex-col items-center gap-1 py-1 px-3 rounded-xl transition-all ${
              pathname === '/'
                ? 'text-blue-400 font-semibold'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <Radio className="w-5 h-5" />
            <span className="text-[10px]">Home</span>
          </Link>
          <Link
            href="/feed"
            className={`flex flex-col items-center gap-1 py-1 px-3 rounded-xl transition-all ${
              pathname === '/feed'
                ? 'text-blue-400 font-semibold'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <Rss className="w-5 h-5" />
            <span className="text-[10px]">Feed</span>
          </Link>
          <Link
            href="/region"
            className={`flex flex-col items-center gap-1 py-1 px-3 rounded-xl transition-all ${
              pathname.startsWith('/region') || pathname.startsWith('/feed/region')
                ? 'text-blue-400 font-semibold'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <Grid className="w-5 h-5" />
            <span className="text-[10px]">Region</span>
          </Link>
          <Link
            href="/chat"
            className={`flex flex-col items-center gap-1 py-1 px-3 rounded-xl transition-all ${
              pathname.startsWith('/chat')
                ? 'text-blue-400 font-semibold'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <MessageSquare className="w-5 h-5" />
            <span className="text-[10px]">Chat</span>
          </Link>
          {isLoggedIn && (
            <Link
              href="/notification"
              className={`relative flex flex-col items-center gap-1 py-1 px-3 rounded-xl transition-all ${
                pathname.startsWith('/notification')
                  ? 'text-blue-400 font-semibold'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              <div className="relative">
                <Bell className="w-5 h-5" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-2 flex items-center justify-center text-[9px] font-bold text-white bg-red-500 rounded-full h-3.5 min-w-[14px] px-1 ring-1 ring-gray-950 animate-pulse">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </div>
              <span className="text-[10px]">Alerts</span>
            </Link>
          )}
          <Link
            href={isLoggedIn ? `/user/profile/${uid}` : '/user/login'}
            className={`flex flex-col items-center gap-1 py-1 px-3 rounded-xl transition-all ${
              pathname.startsWith('/user')
                ? 'text-blue-400 font-semibold'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <User className="w-5 h-5" />
            <span className="text-[10px]">{isLoggedIn ? 'Profile' : 'Login'}</span>
          </Link>
        </div>
      )}
    </>
  );
}

