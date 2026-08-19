"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useWebSocket, ToastBanner } from "@/hooks/useWebSocket";
import {
  MessageSquare,
  Bell,
  Heart,
  UserPlus,
  X,
  ArrowRight,
  MessageCircle,
} from "lucide-react";

export default function ToastBannerContainer() {
  const { banners, dismissBanner } = useWebSocket();
  const router = useRouter();

  if (!banners || banners.length === 0) return null;

  const handleBannerClick = (banner: ToastBanner) => {
    dismissBanner(banner.id);
    if (banner.link) {
      router.push(banner.link);
    }
  };

  const getIcon = (banner: ToastBanner) => {
    if (banner.type === "chat") {
      return (
        <div className="w-9 h-9 rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400 shrink-0">
          <MessageSquare className="w-4 h-4" />
        </div>
      );
    }

    const subType = banner.subType?.toLowerCase() || "";
    if (subType.includes("like") || subType.includes("heart")) {
      return (
        <div className="w-9 h-9 rounded-xl bg-rose-600/20 border border-rose-500/30 flex items-center justify-center text-rose-400 shrink-0">
          <Heart className="w-4 h-4 fill-rose-400/20" />
        </div>
      );
    }
    if (subType.includes("follow")) {
      return (
        <div className="w-9 h-9 rounded-xl bg-emerald-600/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
          <UserPlus className="w-4 h-4" />
        </div>
      );
    }
    if (subType.includes("comment")) {
      return (
        <div className="w-9 h-9 rounded-xl bg-cyan-600/20 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shrink-0">
          <MessageCircle className="w-4 h-4" />
        </div>
      );
    }

    return (
      <div className="w-9 h-9 rounded-xl bg-purple-600/20 border border-purple-500/30 flex items-center justify-center text-purple-400 shrink-0">
        <Bell className="w-4 h-4" />
      </div>
    );
  };

  return (
    <div
      aria-live="polite"
      className="fixed top-20 right-4 sm:right-6 z-[99999] flex flex-col gap-2.5 max-w-sm w-[calc(100vw-2rem)] sm:w-96 pointer-events-none"
    >
      {banners.map((banner) => (
        <div
          key={banner.id}
          className="pointer-events-auto group relative bg-gray-950/95 hover:bg-gray-900 border border-gray-800 hover:border-gray-700 backdrop-blur-xl rounded-2xl p-3.5 shadow-2xl transition-all duration-200 transform hover:scale-[1.01] active:scale-[0.99] cursor-pointer flex items-start gap-3"
          onClick={() => handleBannerClick(banner)}
        >
          {getIcon(banner)}

          <div className="flex-1 min-w-0 pr-4">
            <div className="flex items-center justify-between gap-1 mb-0.5">
              <span className="text-xs font-semibold text-white truncate">
                {banner.title}
              </span>
              <span className="text-[10px] text-gray-500 shrink-0">
                방금 전
              </span>
            </div>
            <p className="text-xs text-gray-300 line-clamp-2 leading-relaxed break-words">
              {banner.content}
            </p>
          </div>

          {/* Close button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              dismissBanner(banner.id);
            }}
            className="absolute top-2.5 right-2.5 p-1 text-gray-500 hover:text-gray-200 rounded-lg hover:bg-gray-800/60 transition-colors"
            title="닫기"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
