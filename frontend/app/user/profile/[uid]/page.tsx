"use client";

import { useEffect, useState, memo } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { User as UserIcon, UserPlus, UserCheck, Clock, Settings } from "lucide-react";

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

const FeedImageTile = memo(function FeedImageTile({
  feed,
  profileNickname,
}: FeedImageTileProps) {
  const { token } = useAuth();
  const router = useRouter();
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

  useEffect(() => {
    let isMounted = true;
    let objectUrl: string | null = null;

    const fetchImage = async () => {
      if (feed.images && feed.images.length > 0 && token) {
        try {
          const response = await fetch(
            `${API_URL}/file/get/${feed.images[0]}`,
            {
              headers: { Authorization: `Bearer ${token}` },
            }
          );
          if (!isMounted || !response.ok) return;
          const blob = await response.blob();
          objectUrl = URL.createObjectURL(blob);
          if (isMounted) {
            setImageUrl(objectUrl);
          }
        } catch (error) {
          console.error("Failed to fetch image", error);
        }
      }
    };

    fetchImage();

    return () => {
      isMounted = false;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [feed.images, token, API_URL]);

  if (!imageUrl) {
    return (
      <div className="relative aspect-square bg-gray-900 border border-gray-800 rounded-xl animate-pulse" />
    );
  }

  return (
    <div
      className="relative aspect-square cursor-pointer group rounded-xl overflow-hidden border border-gray-800 bg-gray-950"
      onClick={() => router.push(`/feed/${feed.fid}`)}
    >
      <img
        src={imageUrl}
        alt={`Feed image by ${profileNickname}`}
        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
      />
      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex justify-center items-center p-2">
        <p className="text-xs text-white line-clamp-2 text-center font-medium">
          {feed.content}
        </p>
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
  const [feeds, setFeeds] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [followers, setFollowers] = useState<FollowingFollower[]>([]);
  const [following, setFollowing] = useState<FollowingFollower[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [followStatus, setFollowStatus] =
    useState<FollowStatus["status"] | null>(null);

  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
  const isMyProfile = loggedInUid === uid;

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
          fetch(`${API_URL}/file/get/${profileData.profile_picture}`, {
            headers: { Authorization: `Bearer ${token}` },
          })
            .then((res) => (res.ok ? res.blob() : null))
            .then((blob) => {
              if (blob) setAvatarUrl(URL.createObjectURL(blob));
            })
            .catch(() => {});
        }

        if (feedsRes.ok) {
          const feedIdsData = await feedsRes.json();
          if (
            feedIdsData.result === "success" &&
            Array.isArray(feedIdsData.feedid)
          ) {
            const feedDetailsPromises = feedIdsData.feedid.map(
              (feedIdObj: { fid: string }) =>
                fetch(`${API_URL}/feed/get/${feedIdObj.fid}`, {
                  headers: {
                    Authorization: `Bearer ${token}`,
                  },
                }).then((res) => {
                  if (!res.ok) return null;
                  return res.json();
                })
            );

            const feedDetailsResponses = await Promise.all(
              feedDetailsPromises
            );

            const validFeeds = feedDetailsResponses
              .filter(
                (response) =>
                  response && response.result === "success" && response.feed
              )
              .map((response) => response.feed);

            const feedsWithNickname = validFeeds.map((feed: FeedItem) => ({
              ...feed,
              nickname: profileData.nickname,
            }));

            setFeeds(feedsWithNickname);
          } else {
            setFeeds([]);
          }
        } else {
          setFeeds([]);
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
  }, [uid, token, isMyProfile, API_URL]);

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

  const imageFeeds = feeds.filter((feed) => feed.images && feed.images.length > 0);

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
                <span className="font-bold text-white ml-1">{feeds.length}</span>
              </div>
              <div>
                팔로워{" "}
                <span className="font-bold text-white ml-1">
                  {followers.length}
                </span>
              </div>
              <div>
                팔로잉{" "}
                <span className="font-bold text-white ml-1">
                  {following.length}
                </span>
              </div>
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
            Posts ({imageFeeds.length})
          </h2>

          {imageFeeds.length > 0 ? (
            <div className="grid grid-cols-3 gap-2 sm:gap-4">
              {imageFeeds.map((feed) => (
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
        </div>
      </div>
    </div>
  );
}