"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

export default function Sidebar() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);

  const navItems = [
    { name: "Home", href: "/" },
    { name: "Chat", href: "/chat" },
    { name: "Feed", href: "/feed" },
    { name: "User Profile", href: "/user/profile/uid" }, // Placeholder for UID
    { name: "Join", href: "/user/join" },
  ];

  return (
    <div
      className={`fixed inset-y-0 left-0 transform ${
        isOpen ? "translate-x-0" : "-translate-x-full"
      } md:translate-x-0 transition-transform duration-200 ease-in-out w-64 p-4 space-y-6 z-30`}
    >
      {/* Sidebar Toggle Button for Mobile */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="md:hidden absolute top-4 right-4 text-white focus:outline-none"
      >
        <svg
          className="w-6 h-6"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          xmlns="http://www.w3.org/2000/svg"
        >
          {isOpen ? (
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M6 18L18 6M6 6l12 12"
            ></path>
          ) : (
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M4 6h16M4 12h16M4 18h16"
            ></path>
          )}
        </svg>
      </button>

      {/* Sidebar Content */}
      <h2 className="text-2xl font-semibold mb-6">Navigation</h2>
      <nav>
        {navItems.map((item) => (
          <Link key={item.name} href={item.href} className="block">
            <p
              className={`p-2 rounded-md ${
                pathname === item.href ? "bg-gray-700" : "hover:bg-gray-700"
              }`}
            >
              {item.name}
            </p>
          </Link>
        ))}
      </nav>

      <div className="mt-8">
        <h3 className="text-xl font-semibold mb-4">Chat Rooms</h3>
        {/* Placeholder for chat rooms */}
        <p className="text-gray-400">No active chats.</p>
      </div>
    </div>
  );
}
