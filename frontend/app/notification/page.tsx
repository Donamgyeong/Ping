"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";
import {
  Bell,
  BellOff,
  MessageSquare,
  Rss,
  Heart,
  ArrowLeft,
  RefreshCw,
  ExternalLink,
  CheckCircle2,
} from "lucide-react";

interface NotificationItem {
  noti_id: string;
  type: string;
  content: string;
  link: string;
  date: string;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const formatNotificationDate = (dateString: string): string => {
  if (!dateString) return "";
  try {
    const isUtc = dateString.endsWith("Z") || dateString.includes("+");
    const utcString = isUtc ? dateString : `${dateString}Z`;
    const date = new Date(utcString);
    if (isNaN(date.getTime())) return dateString;

    const now = new Date();
    const diffSec = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diffSec < 60) return "방금 전";
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)}분 전`;
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}시간 전`;
    if (diffSec < 604800) return `${Math.floor(diffSec / 86400)}일 전`;
    return date.toLocaleDateString("ko-KR", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return dateString;
  }
};

const getNotificationBadge = (type: string) => {
  const normalizedType = type ? type.trim().toLowerCase() : "";
  switch (normalizedType) {
    case "comment":
      return {
        icon: <MessageSquare className="w-5 h-5 text-blue-400" />,
        bg: "bg-blue-500/10 border-blue-500/20 text-blue-400",
        label: "댓글",
      };
    case "chat":
      return {
        icon: <MessageSquare className="w-5 h-5 text-emerald-400" />,
        bg: "bg-emerald-500/10 border-emerald-500/20 text-emerald-400",
        label: "채팅",
      };
    case "feed":
    case "like":
      return {
        icon: <Heart className="w-5 h-5 text-pink-400" />,
        bg: "bg-pink-500/10 border-pink-500/20 text-pink-400",
        label: "피드",
      };
    default:
      return {
        icon: <Bell className="w-5 h-5 text-amber-400" />,
        bg: "bg-amber-500/10 border-amber-500/20 text-amber-400",
        label: "알림",
      };
  }
};

export default function NotificationPage() {
  const { token, loading, authFetch } = useAuth();
  const router = useRouter();

  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchNotifications = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await authFetch(`${API_URL}/notification/get`);
      if (!res.ok) {
        throw new Error("알림 데이터를 불러오는 중 오류가 발생했습니다.");
      }
      const data = await res.json();
      if (data.result === "OK" && Array.isArray(data.notifications)) {
        setNotifications(data.notifications);
      } else {
        setNotifications([]);
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || "알림을 불러오는데 실패했습니다.");
    } finally {
      setIsLoading(false);
    }
  }, [authFetch]);

  useEffect(() => {
    if (!loading && !token) {
      router.push("/user/login");
      return;
    }
    if (token) {
      fetchNotifications();
    }
  }, [token, loading, router, fetchNotifications]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center text-gray-400">
        <div className="flex items-center gap-2">
          <RefreshCw className="w-5 h-5 animate-spin text-blue-500" />
          <span>로딩 중...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white pb-20">
      <div className="max-w-3xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6 pb-4 border-b border-gray-800/80">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.back()}
              className="p-2 rounded-xl bg-gray-900 hover:bg-gray-800 border border-gray-800 text-gray-400 hover:text-white transition-all cursor-pointer"
              title="뒤로 가기"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-2xl font-bold bg-gradient-to-r from-white via-gray-200 to-gray-400 bg-clip-text text-transparent">
                알림 목록
              </h1>
              <p className="text-xs text-gray-400 mt-0.5">
                수신된 최신 알림 메시지입니다.
              </p>
            </div>
          </div>

          <button
            onClick={fetchNotifications}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gray-900 hover:bg-gray-800 border border-gray-800 text-xs text-gray-300 hover:text-white transition-all cursor-pointer disabled:opacity-50"
            title="새로고침"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline">새로고침</span>
          </button>
        </div>

        {/* Read Notification Status Toast */}
        {!isLoading && !error && notifications.length > 0 && (
          <div className="mb-6 px-4 py-3 rounded-2xl bg-blue-950/40 border border-blue-800/40 flex items-center gap-2 text-xs text-blue-300">
            <CheckCircle2 className="w-4 h-4 text-blue-400 shrink-0" />
            <span>알림 목록을 조회하여 읽지 않은 알림 수가 모두 초기화되었습니다.</span>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="p-6 text-center rounded-2xl bg-red-950/20 border border-red-900/40 my-6">
            <p className="text-sm text-red-400 mb-3">{error}</p>
            <button
              onClick={fetchNotifications}
              className="px-4 py-2 bg-red-600/30 hover:bg-red-600/50 border border-red-500/40 text-red-200 rounded-xl text-xs font-semibold transition-all cursor-pointer"
            >
              다시 시도
            </button>
          </div>
        )}

        {/* Loading Skeleton */}
        {isLoading && (
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="p-4 rounded-2xl bg-gray-900/40 border border-gray-800/60 animate-pulse flex items-start gap-4"
              >
                <div className="w-10 h-10 rounded-xl bg-gray-800 shrink-0" />
                <div className="flex-1 space-y-2 py-1">
                  <div className="h-4 bg-gray-800 rounded w-3/4" />
                  <div className="h-3 bg-gray-800/60 rounded w-1/4" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Empty State */}
        {!isLoading && !error && notifications.length === 0 && (
          <div className="py-20 text-center rounded-3xl bg-gray-900/30 border border-gray-800/60 my-4 flex flex-col items-center">
            <div className="w-16 h-16 rounded-2xl bg-gray-900 border border-gray-800 flex items-center justify-center text-gray-500 mb-4 shadow-inner">
              <BellOff className="w-8 h-8" />
            </div>
            <h2 className="text-lg font-semibold text-gray-200 mb-1">
              새로운 알림이 없습니다
            </h2>
            <p className="text-xs text-gray-500 max-w-xs leading-relaxed">
              새로운 소식이나 알림이 도착하면 이곳에서 한눈에 확인하실 수 있습니다.
            </p>
          </div>
        )}

        {/* Notification List */}
        {!isLoading && !error && notifications.length > 0 && (
          <div className="space-y-3">
            {notifications.map((noti) => {
              const badge = getNotificationBadge(noti.type);
              const formattedDate = formatNotificationDate(noti.date);
              const hasLink = !!noti.link && noti.link.trim().length > 0;

              const contentElement = (
                <div className="p-4 rounded-2xl bg-gray-900/60 hover:bg-gray-900 border border-gray-800/80 hover:border-gray-700/80 transition-all duration-200 group flex items-start gap-4 shadow-sm hover:shadow-md">
                  <div
                    className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 ${badge.bg}`}
                  >
                    {badge.icon}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="text-[11px] font-semibold tracking-wide uppercase px-2 py-0.5 rounded-md bg-gray-800 text-gray-300 border border-gray-700/50">
                        {badge.label}
                      </span>
                      <span className="text-xs text-gray-500 shrink-0">
                        {formattedDate}
                      </span>
                    </div>

                    <p className="text-sm text-gray-200 group-hover:text-white leading-relaxed break-words">
                      {noti.content}
                    </p>
                  </div>

                  {hasLink && (
                    <div className="self-center p-1.5 rounded-lg text-gray-500 group-hover:text-blue-400 group-hover:bg-blue-500/10 transition-colors shrink-0">
                      <ExternalLink className="w-4 h-4" />
                    </div>
                  )}
                </div>
              );

              return hasLink ? (
                <Link key={noti.noti_id} href={noti.link} className="block">
                  {contentElement}
                </Link>
              ) : (
                <div key={noti.noti_id}>{contentElement}</div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
