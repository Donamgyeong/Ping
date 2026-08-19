"use client";

import { useEffect, useState, memo, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";
import { User as UserIcon, UserPlus, UserCheck, Clock, Settings, MapPin } from "lucide-react";
import { fetchFeedAddressCached } from "@/utils/feedCache";
import { getFileUrl } from "@/utils/upload";

interface UserProfile {
  uid: string;
  email: string;
  nickname: string;
  birthdate: string;
  private: boolean;
  bio: string | null;
}

interface FollowingFollower {
  uid: string;
  nickname: string;
}

interface FeedItem {
  fid: string;
  uid: string;
  content: string;
  post_date: string;
  location: {
    long: number;
    lat: number;
  };
  images: string[];
  nickname?: string;
  private: boolean;
}

interface FeedImageTileProps {
  feed: FeedItem;
  profileNickname: string;
}

const BATCH_SIZE = 12;

const FeedImageTile = memo(function FeedImageTile({
  feed,
  profileNickname,
}: FeedImageTileProps) {
  const { token } = useAuth();
  const router = useRouter();
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const tileRef = useRef<HTMLDivElement | null>(null);
  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

  // IntersectionObserver to set isVisible when tile comes into viewport
  useEffect(() => {
    const node = tileRef.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px" }
    );

    observer.observe(node);

    return () => {
      observer.disconnect();
    };
  }, []);

  // Fetch address up to Eup/Myeon/Dong when visible
  useEffect(() => {
    if (!isVisible || !token || !feed.location) return;
    const lat = feed.location.lat;
    const long = feed.location.long;
    if (lat != null && long != null) {
      fetchFeedAddressCached(lat, long, token, API_URL).then((addr) => {
        if (addr) setAddress(addr);
      });
    }
  }, [isVisible, feed.location, token, API_URL]);

  // Fetch image only when tile becomes visible
  useEffect(() => {
    if (!isVisible) return;
    let isMounted = true;

    const fetchImage = async () => {
      if (feed.images && feed.images.length > 0 && token) {
        try {
          const url = await getFileUrl(feed.images[0], token, true);
          if (isMounted && url) {
            setImageUrl(url);
          }
        } catch (error) {
          console.error("Failed to fetch image", error);
        }
      }
    };

    fetchImage();

    return () => {
      isMounted = false;
    };
  }, [isVisible, feed.images, token]);

  return (
    <div
      ref={tileRef}
      className="relative aspect-square cursor-pointer group rounded-xl overflow-hidden border border-gray-800 bg-gray-950"
      onClick={() => router.push(`/feed/${feed.fid}`)}
    >
      {imageUrl ? (
        <img
          src={imageUrl}
          alt={`Feed image by ${profileNickname}`}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
        />
      ) : (
        <div className="w-full h-full bg-gray-900 border border-gray-800 animate-pulse flex items-center justify-center">
          <div className="w-5 h-5 border-2 border-blue-500/40 border-t-transparent rounded-full animate-spin" />
        </div>
      )}
      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-between p-2.5 sm:p-3">
        <p className="text-xs text-white line-clamp-3 leading-relaxed font-medium">
          {feed.content}
        </p>
        {address && (
          <div className="flex items-center gap-1 text-[10px] text-blue-300 font-medium truncate pt-1">
            <MapPin className="w-3 h-3 text-blue-400 shrink-0" />
            <span className="truncate">{address}</span>
          </div>
        )}
      </div>
    </div>
  );
});

interface FollowStatus {
  status: "following" | "not_following" | "requested";
}

export default function UserProfilePage() {
  const { uid } = useParams();
  const { token, uid: loggedInUid } = useAuth();
  const router = useRouter();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [rawFeedIds, setRawFeedIds] = useState<{ fid: string }[]>([]);
  const [feeds, setFeeds] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [followers, setFollowers] = useState<FollowingFollower[]>([]);
  const [following, setFollowing] = useState<FollowingFollower[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [followStatus, setFollowStatus] =
    useState<FollowStatus["status"] | null>(null);

  const [processedCount, setProcessedCount] = useState(0);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const rawFeedIdsRef = useRef<{ fid: string }[]>([]);
  const processedCountRef = useRef<number>(0);
  const loadingMoreRef = useRef<boolean>(false);
  const profileRef = useRef<UserProfile | null>(null);

  rawFeedIdsRef.current = rawFeedIds;
  processedCountRef.current = processedCount;
  loadingMoreRef.current = loadingMore;
  profileRef.current = profile;

  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
  const isMyProfile = loggedInUid === uid;

  const fetchFeedDetailsBatch = useCallback(
    async (
      batchIds: { fid: string }[],
      authToken: string,
      nickname: string
    ): Promise<FeedItem[]> => {
      const promises = batchIds.map((item) =>
        fetch(`${API_URL}/feed/get/${item.fid}`, {
          headers: { Authorization: `Bearer ${authToken}` },
        }).then((res) => (res.ok ? res.json() : null))
      );
      const responses = await Promise.all(promises);
      return responses
        .filter((res) => res && res.result === "success" && res.feed)
        .map((res) => ({ ...res.feed, nickname }));
    },
    [API_URL]
  );

  useEffect(() => {
    if (!uid || !token) return;

    const fetchProfileData = async () => {
      setLoading(true);
      try {
        const [profileRes, feedsRes, followersRes, followingRes] =
          await Promise.all([
            fetch(`${API_URL}/user/profile/${uid}`, {
              headers: { Authorization: `Bearer ${token}` },
            }),
            fetch(`${API_URL}/feed/get/user/${uid}`, {
              headers: { Authorization: `Bearer ${token}` },
            }),
            fetch(`${API_URL}/user/followers?uid=${uid}`, {
              headers: { Authorization: `Bearer ${token}` },
            }),
            fetch(`${API_URL}/user/following?uid=${uid}`, {
              headers: { Authorization: `Bearer ${token}` },
            }),
          ]);

        if (!profileRes.ok) throw new Error("Failed to fetch profile.");
        const profileData = await profileRes.json();
        setProfile(profileData);

        if (profileData.profile_picture) {
          getFileUrl(profileData.profile_picture, token, true)
            .then((url) => {
              if (url) setAvatarUrl(url);
            })
            .catch(() => {});
        }

        if (feedsRes.ok) {
          const feedIdsData = await feedsRes.json();
          if (
            feedIdsData.result === "success" &&
            Array.isArray(feedIdsData.feedid)
          ) {
            const allIds = feedIdsData.feedid;
            setRawFeedIds(allIds);
            rawFeedIdsRef.current = allIds;

            // Lazy load: Fetch details for first batch
            const initialBatch = allIds.slice(0, BATCH_SIZE);
            setProcessedCount(initialBatch.length);
            processedCountRef.current = initialBatch.length;

            const initialFeeds = await fetchFeedDetailsBatch(
              initialBatch,
              token,
              profileData.nickname
            );
            setFeeds(initialFeeds);
          } else {
            setRawFeedIds([]);
            setFeeds([]);
            setProcessedCount(0);
          }
        } else {
          setRawFeedIds([]);
          setFeeds([]);
          setProcessedCount(0);
        }

        if (followersRes.ok) {
          const followersData = await followersRes.json();
          if (followersData.result === "success")
            setFollowers(followersData.following);
        }

        if (followingRes.ok) {
          const followingData = await followingRes.json();
          if (followingData.result === "success")
            setFollowing(followingData.following);
        }

        if (!isMyProfile) {
          const myFollowingResponse = await fetch(`${API_URL}/user/following`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (myFollowingResponse.ok) {
            const myFollowingData = await myFollowingResponse.json();
            const isFollowing = myFollowingData.following.some(
              (followedUser: { uid: string }) => followedUser.uid === uid
            );
            if (isFollowing) {
              setFollowStatus("following");
            } else {
              setFollowStatus("not_following");
            }
          } else {
            setFollowStatus("not_following");
          }
        }
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchProfileData();
  }, [uid, token, isMyProfile, API_URL, fetchFeedDetailsBatch]);

  // Load more feeds handler for pagination / lazy loading
  const handleLoadMore = useCallback(async () => {
    if (
      loadingMoreRef.current ||
      processedCountRef.current >= rawFeedIdsRef.current.length ||
      !token ||
      !profileRef.current
    ) {
      return;
    }

    loadingMoreRef.current = true;
    setLoadingMore(true);

    const start = processedCountRef.current;
    const nextBatchIds = rawFeedIdsRef.current.slice(
      start,
      start + BATCH_SIZE
    );
    const newProcessedCount = start + nextBatchIds.length;
    processedCountRef.current = newProcessedCount;
    setProcessedCount(newProcessedCount);

    try {
      const newFeeds = await fetchFeedDetailsBatch(
        nextBatchIds,
        token,
        profileRef.current.nickname
      );

      setFeeds((prev) => {
        const existingFids = new Set(prev.map((item) => item.fid));
        const uniqueNewFeeds = newFeeds.filter((item) => !existingFids.has(item.fid));
        return [...prev, ...uniqueNewFeeds];
      });
    } catch (err) {
      console.error('[Profile] Failed to load more profile feeds:', err);
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [token, fetchFeedDetailsBatch]);

  // Window scroll-based infinite scroll (more reliable than IntersectionObserver for this layout)
  useEffect(() => {
    const onScroll = () => {
      const scrolled = window.scrollY + window.innerHeight;
      const total = document.documentElement.scrollHeight;
      // Trigger when within 400px of bottom
      if (total - scrolled < 400) {
        handleLoadMore();
      }
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [handleLoadMore]);

  const handleFollow = async () => {
    if (!token || !uid) return;
    const response = await fetch(
      `${API_URL}/user/follow/request?follow_uid=${uid}`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      }
    );
    if (response.ok) {
      const result = await response.json();
      if (result.detail === "Follow completed") {
        setFollowStatus("following");
      } else if (result.detail === "Follow requested") {
        setFollowStatus("requested");
      }
    }
  };

  const handleUnfollow = async () => {
    if (!token || !uid) return;
    const response = await fetch(
      `${API_URL}/user/follow/unfollow?unfollow_uid=${uid}`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      }
    );
    if (response.ok) {
      setFollowStatus("not_following");
    }
  };

  if (loading)
    return (
      <div className="flex justify-center items-center min-h-[calc(100vh-4rem)] bg-black text-gray-500 text-sm">
        Loading profile...
      </div>
    );
  if (error)
    return (
      <div className="flex justify-center items-center min-h-[calc(100vh-4rem)] bg-black text-red-400 text-sm">
        Error: {error}
      </div>
    );
  if (!profile)
    return (
      <div className="flex justify-center items-center min-h-[calc(100vh-4rem)] bg-black text-gray-500 text-sm">
        User not found.
      </div>
    );

  const renderFollowButton = () => {
    if (isMyProfile) {
      return (
        <button
          onClick={() => router.push("/user/edit")}
          className="flex items-center gap-1.5 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-xl text-xs font-semibold transition-all border border-gray-700 cursor-pointer"
        >
          <Settings className="w-4 h-4 text-gray-300" />
          <span>Edit Profile</span>
        </button>
      );
    }

    switch (followStatus) {
      case "following":
        return (
          <button
            onClick={handleUnfollow}
            className="flex items-center gap-1.5 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-xl text-xs font-semibold transition-all border border-gray-700 cursor-pointer"
          >
            <UserCheck className="w-4 h-4 text-blue-400" />
            <span>Following</span>
          </button>
        );
      case "requested":
        return (
          <button className="flex items-center gap-1.5 px-4 py-2 bg-gray-900 text-gray-400 rounded-xl text-xs font-semibold border border-gray-800 cursor-not-allowed">
            <Clock className="w-4 h-4" />
            <span>Requested</span>
          </button>
        );
      case "not_following":
      default:
        return (
          <button
            onClick={handleFollow}
            className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold transition-all shadow-md shadow-blue-600/20 cursor-pointer"
          >
            <UserPlus className="w-4 h-4" />
            <span>Follow</span>
          </button>
        );
    }
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-black text-white p-4 sm:p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Profile Card Header */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 shadow-2xl flex flex-col sm:flex-row items-center sm:items-start gap-6">
          <div className="w-24 h-24 rounded-full overflow-hidden bg-gray-800 border-2 border-gray-700 flex items-center justify-center text-gray-400 shrink-0 shadow-lg">
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt="Profile Avatar"
                className="w-full h-full object-cover"
              />
            ) : (
              <UserIcon className="w-12 h-12" />
            )}
          </div>

          <div className="flex-1 text-center sm:text-left space-y-3">
            <div className="flex flex-col sm:flex-row items-center gap-4 justify-between">
              <h1 className="text-2xl font-bold text-white tracking-tight">
                {profile.nickname}
              </h1>
              {renderFollowButton()}
            </div>

            <div className="flex justify-center sm:justify-start gap-6 text-sm text-gray-400">
              <div>
                게시물{" "}
                <span className="font-bold text-white ml-1">{rawFeedIds.length}</span>
              </div>
              <Link
                href={`/user/profile/${uid}/followers`}
                className="hover:text-blue-400 transition-colors cursor-pointer group"
              >
                팔로워{" "}
                <span className="font-bold text-white group-hover:text-blue-400 ml-1 transition-colors">
                  {followers.length}
                </span>
              </Link>
              <Link
                href={`/user/profile/${uid}/following`}
                className="hover:text-blue-400 transition-colors cursor-pointer group"
              >
                팔로잉{" "}
                <span className="font-bold text-white group-hover:text-blue-400 ml-1 transition-colors">
                  {following.length}
                </span>
              </Link>
            </div>

            {isMyProfile && (
              <p className="text-xs text-gray-500 font-mono">{profile.email}</p>
            )}

            <p className="text-sm text-gray-300 leading-relaxed">
              {profile.bio || "No bio yet."}
            </p>
          </div>
        </div>

        {/* Feed Image Grid Header */}
        <div className="border-t border-gray-800 pt-6">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">
            Posts ({rawFeedIds.length})
          </h2>

          {feeds.length > 0 ? (
            <div className="grid grid-cols-3 gap-2 sm:gap-4">
              {feeds.map((feed) => (
                <FeedImageTile
                  key={feed.fid}
                  feed={feed}
                  profileNickname={profile.nickname}
                />
              ))}
            </div>
          ) : (
            <div className="bg-gray-900/50 border border-gray-800/80 rounded-2xl p-12 text-center text-sm text-gray-500">
              No posts found for this profile.
            </div>
          )}

          {/* Sentinel element for infinite scrolling / lazy loading */}
          {processedCount < rawFeedIds.length && (
            <div
              ref={sentinelRef}
              className="py-6 min-h-[60px] flex justify-center items-center w-full"
            >
              <div className="flex items-center gap-2 text-xs text-gray-400">
                {loadingMore && (
                  <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                )}
                <span>
                  {loadingMore ? "Loading more posts..." : "Scroll down for more"}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}