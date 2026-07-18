"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';

export default function Navbar() {
  const { token, uid, logout } = useAuth();
  const isLoggedIn = !!token;
  const pathname = usePathname();

  return (
    <nav className="bg-gray-900 border-b border-gray-700">
      <div className="max-w-screen-xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex-shrink-0">
            <Link href="/" className="text-2xl font-bold text-blue-400">
              Ping
            </Link>
          </div>
          <div className="hidden md:block">
            <div className="ml-10 flex items-baseline space-x-4">
              <Link href="/feed" className={`text-sm ${pathname === '/feed' ? 'font-semibold text-white' : 'font-normal text-gray-300 hover:text-white'}`}>
                Feed
              </Link>
              <Link href="/chat" className={`text-sm ${pathname.startsWith('/chat') ? 'font-semibold text-white' : 'font-normal text-gray-300 hover:text-white'}`}>
                Chat
              </Link>
              {isLoggedIn && (
                 <Link href={`/user/profile/${uid}`} className={`text-sm ${pathname.startsWith('/user/profile') ? 'font-semibold text-white' : 'font-normal text-gray-300 hover:text-white'}`}>
                    Profile
                 </Link>
              )}
            </div>
          </div>
          <div className="hidden md:block">
            {isLoggedIn ? (
               <button onClick={logout} className="text-sm font-medium text-blue-400 hover:text-blue-300">
                Log Out
              </button>
            ) : (
              <div className="flex items-center space-x-4">
                <Link href="/user/login" className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700">
                  Log In
                </Link>
                <Link href="/user/join" className="text-sm font-medium text-blue-400 hover:text-blue-300">
                  Sign Up
                </Link>
              </div>
            )}
          </div>
          {/* Mobile menu button can be added here if needed */}
        </div>
      </div>
    </nav>
  );
}
