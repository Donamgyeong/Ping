"use client";

import React, { useEffect, useState, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";
import { getFileUrl } from "@/utils/upload";
import {
  ArrowLeft,
  User as UserIcon,
  UserPlus,
  UserCheck,
  Clock,
  Search,
  Users,
  Loader2,
  ChevronRight,
} from "lucide-react";

interface FollowUser {
  uid: string;
  nickname: string;
  bio?: string | null;
  profile_picture?: string | null;
}

interface FollowListClientProps {
  initialTab: "followers" | "following";
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

function UserRow({
  user,
  isMe,
  isFollowing,
  onFollow,
  token,
}: {
  user: FollowUser;
  isMe: boolean;
  isFollowing: boolean;
  onFollow: (targetUid: string) => Promise<void>;
  token: string | null;
}) {
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [bio, setBio] = useState<string | null>(user.bio || null);
  const [actionLoading, setActionLoading] = useState(false);
  const [followedState, setFollowedState] = useState<"following" | "requested" | "not_following">(
    isFollowing ? "following" : "not_following"
  );

  useEffect(() => {
    setFollowedState(isFollowing ? "following" : "not_following");
  }, [isFollowing]);

  useEffect(() => {
    let isMounted = true;
    // Fetch profile details for avatar & bio
    if (token && user.uid) {
      fetch(`${API_URL}/user/profile/${user.uid}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((res) => (res.ok ? res.json() : null))
        .then(async (data) => {
          if (!isMounted || !data) return;
          if (data.bio) setBio(data.bio);
          if (data.profile_picture) {
            const url = await getFileUrl(data.profile_picture, token, true);
            if (isMounted && url) setAvatarUrl(url);
          }
        })
        .catch(() => {});
    }
    return () => {
      isMounted = false;
    };
  }, [user.uid, token]);

  const handleFollowClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (actionLoading || isMe || followedState === "following" || followedState === "requested") return;

    setActionLoading(true);
    try {
      await onFollow(user.uid);
      setFollowedState("following");
    } catch {
      // ignore
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <Link
      href={`/user/profile/${user.uid}`}
      className="flex items-center justify-between p-3.5 sm:p-4 rounded-2xl bg-gray-900/60 hover:bg-gray-900 border border-gray-800/80 hover:border-gray-700/80 transition-all duration-200 group"
    >
      <div className="flex items-center gap-3.5 min-w-0">
        <div className="w-12 h-12 rounded-2xl bg-gray-800 border border-gray-700/80 overflow-hidden flex items-center justify-center text-gray-400 shrink-0 shadow-md">
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt={user.nickname}
              className="w-full h-full object-cover"
            />
          ) : (
            <UserIcon className="w-6 h-6 text-gray-500" />
          )}
        </div>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-white group-hover:text-blue-400 transition-colors truncate">
            {user.nickname}
          </h3>
          {bio ? (
            <p className="text-xs text-gray-400 truncate max-w-xs sm:max-w-md mt-0.5">
              {bio}
            </p>
          ) : (
            <p className="text-xs text-gray-600 truncate font-mono mt-0.5">
              @{user.uid.slice(0, 8)}
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0 ml-3">
        {!isMe && (
          <>
            {followedState === "following" ? (
              <span className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-gray-800 border border-gray-700 text-gray-300 text-xs font-semibold">
                <UserCheck className="w-3.5 h-3.5 text-blue-400" />
                <span>팔로잉</span>
              </span>
            ) : followedState === "requested" ? (
              <span className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-gray-800/60 border border-gray-800 text-gray-400 text-xs font-semibold">
                <Clock className="w-3.5 h-3.5" />
                <span>요청됨</span>
              </span>
            ) : (
              <button
                onClick={handleFollowClick}
                disabled={actionLoading}
                className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white text-xs font-semibold transition-all shadow-md shadow-blue-600/20 cursor-pointer disabled:opacity-50"
              >
                {actionLoading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <UserPlus className="w-3.5 h-3.5" />
                )}
                <span>팔로우</span>
              </button>
            )}
          </>
        )}
        <ChevronRight className="w-4 h-4 text-gray-600 group-hover:text-gray-400 transition-colors" />
      </div>
    </Link>
  );
}

export default function FollowListClient({ initialTab }: FollowListClientProps) {
  const params = useParams();
  const router = useRouter();
  const { token, uid: myUid, loading: authLoading, authFetch } = useAuth();
  const profileUid = params?.uid as string;

  const [activeTab, setActiveTab] = useState<"followers" | "following">(initialTab);
  const [profileNickname, setProfileNickname] = useState<string>("");
  const [followers, setFollowers] = useState<FollowUser[]>([]);
  const [following, setFollowing] = useState<FollowUser[]>([]);
  const [myFollowingUids, setMyFollowingUids] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  // Sync tab state with prop if it changes
  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  // Load target profile & follow lists
  useEffect(() => {
    if (!token || !profileUid || authLoading) return;

    let isMounted = true;
    setLoading(true);

    const loadAll = async () => {
      try {
        // 1. Fetch Profile info
        const profileRes = await authFetch(`${API_URL}/user/profile/${profileUid}`);
        if (profileRes.ok) {
          const pData = await profileRes.json();
          if (isMounted && pData.nickname) {
            setProfileNickname(pData.nickname);
          }
        }

        // 2. Fetch Followers
        const followersRes = await authFetch(`${API_URL}/user/followers?uid=${profileUid}`);
        if (followersRes.ok) {
          const fData = await followersRes.json();
          if (isMounted && fData.result === "success" && Array.isArray(fData.following)) {
            setFollowers(fData.following);
          }
        }

        // 3. Fetch Following
        const followingRes = await authFetch(`${API_URL}/user/following?uid=${profileUid}`);
        if (followingRes.ok) {
          const flData = await followingRes.json();
          if (isMounted && flData.result === "success" && Array.isArray(flData.following)) {
            setFollowing(flData.following);
          }
        }

        // 4. Fetch My Following list to know follow status
        if (myUid) {
          const myFollowingRes = await authFetch(`${API_URL}/user/following`);
          if (myFollowingRes.ok) {
            const myFlData = await myFollowingRes.json();
            if (isMounted && myFlData.result === "success" && Array.isArray(myFlData.following)) {
              setMyFollowingUids(new Set(myFlData.following.map((u: FollowUser) => u.uid)));
            }
          }
        }
      } catch (err) {
        console.error("Failed to load follow lists:", err);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    loadAll();

    return () => {
      isMounted = false;
    };
  }, [profileUid, token, myUid, authLoading, authFetch]);

  const handleFollowRequest = async (targetUid: string) => {
    if (!token) return;
    const res = await authFetch(`${API_URL}/user/follow/request?follow_uid=${targetUid}`, {
      method: "POST",
    });
    if (!res.ok) {
      throw new Error("Failed to follow");
    }
    setMyFollowingUids((prev) => new Set([...prev, targetUid]));
  };

  const handleTabChange = (tab: "followers" | "following") => {
    setActiveTab(tab);
    router.replace(`/user/profile/${profileUid}/${tab}`);
  };

  const currentList = activeTab === "followers" ? followers : following;

  const filteredList = useMemo(() => {
    if (!searchQuery.trim()) return currentList;
    const query = searchQuery.toLowerCase().trim();
    return currentList.filter(
      (u) =>
        u.nickname.toLowerCase().includes(query) ||
        u.uid.toLowerCase().includes(query)
    );
  }, [currentList, searchQuery]);

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-gray-950 text-white pb-16">
      {/* Top Header */}
      <div className="sticky top-16 z-30 bg-gray-950/80 backdrop-blur-md border-b border-gray-800/80">
        <div className="max-w-2xl mx-auto px-4 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push(`/user/profile/${profileUid}`)}
              className="p-2 rounded-xl bg-gray-900 hover:bg-gray-800 border border-gray-800 text-gray-300 hover:text-white transition-all cursor-pointer"
              title="프로필로 돌아가기"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <h1 className="text-base font-bold text-white tracking-tight">
                {profileNickname || "프로필"}
              </h1>
              <p className="text-[11px] text-gray-500">
                {activeTab === "followers" ? "팔로워 목록" : "팔로잉 목록"}
              </p>
            </div>
          </div>

          <div className="text-xs text-gray-400 font-medium">
            총 <span className="text-blue-400 font-semibold">{currentList.length}</span>명
          </div>
        </div>

        {/* Tab Segmented Control */}
        <div className="max-w-2xl mx-auto px-4 pb-3">
          <div className="flex rounded-2xl bg-gray-900/90 border border-gray-800 p-1">
            <button
              onClick={() => handleTabChange("followers")}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                activeTab === "followers"
                  ? "bg-blue-600 text-white shadow-md shadow-blue-600/20"
                  : "text-gray-400 hover:text-gray-200"
              }`}
            >
              <span>팔로워</span>
              <span
                className={`text-[11px] px-1.5 py-0.5 rounded-full ${
                  activeTab === "followers"
                    ? "bg-blue-700/80 text-white"
                    : "bg-gray-800 text-gray-400"
                }`}
              >
                {followers.length}
              </span>
            </button>

            <button
              onClick={() => handleTabChange("following")}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                activeTab === "following"
                  ? "bg-blue-600 text-white shadow-md shadow-blue-600/20"
                  : "text-gray-400 hover:text-gray-200"
              }`}
            >
              <span>팔로잉</span>
              <span
                className={`text-[11px] px-1.5 py-0.5 rounded-full ${
                  activeTab === "following"
                    ? "bg-blue-700/80 text-white"
                    : "bg-gray-800 text-gray-400"
                }`}
              >
                {following.length}
              </span>
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-4 space-y-4">
        {/* Search Bar */}
        <div className="relative">
          <Search className="w-4 h-4 text-gray-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="닉네임으로 검색..."
            className="w-full bg-gray-900/80 border border-gray-800 rounded-xl pl-10 pr-4 py-2.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-blue-500/50 transition-colors"
          />
        </div>

        {/* User List */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-500 gap-3">
            <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
            <span className="text-xs">목록을 불러오는 중...</span>
          </div>
        ) : filteredList.length > 0 ? (
          <div className="space-y-2">
            {filteredList.map((user) => (
              <UserRow
                key={user.uid}
                user={user}
                isMe={user.uid === myUid}
                isFollowing={myFollowingUids.has(user.uid)}
                onFollow={handleFollowRequest}
                token={token}
              />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-20 text-center px-4 rounded-2xl border border-dashed border-gray-800/80 bg-gray-900/20">
            <div className="w-14 h-14 rounded-2xl bg-gray-900 border border-gray-800 flex items-center justify-center text-gray-600 mb-3">
              <Users className="w-7 h-7" />
            </div>
            <h3 className="text-sm font-semibold text-gray-300 mb-1">
              {searchQuery ? "검색 결과가 없습니다" : activeTab === "followers" ? "팔로워가 없습니다" : "팔로잉하는 사용자가 없습니다"}
            </h3>
            <p className="text-xs text-gray-500 max-w-xs">
              {searchQuery
                ? `"${searchQuery}"에 일치하는 사용자를 찾을 수 없습니다.`
                : activeTab === "followers"
                ? "아직 이 사용자를 팔로우하는 사람이 없습니다."
                : "아직 팔로우한 사용자가 없습니다."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
