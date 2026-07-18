"use client";

import { useEffect, useState, memo } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";

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

const HeartIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 24 24" {...props}><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
);
const ChatBubbleIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 24 24" {...props}><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></svg>
);

interface FeedImageTileProps extends React.HTMLAttributes<HTMLDivElement> {
  feed: FeedItem;
  profileNickname: string;
}

const FeedImageTile = memo(function FeedImageTile({ feed, profileNickname }: FeedImageTileProps) {
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
          const response = await fetch(`${API_URL}/file/get/${feed.images[0]}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
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
    return <div className="relative aspect-square bg-gray-700 animate-pulse"></div>;
  }

  return (
    <div className="relative aspect-square cursor-pointer group" onClick={() => router.push(`/feed/${feed.fid}`)}>
      <img src={imageUrl} alt={`Feed image by ${profileNickname}`} className="w-full h-full object-cover" />
      <div className="absolute inset-0 bg-opacity-100 group-hover:bg-opacity-40 transition-all duration-300 flex justify-center items-center">
        <div className="text-white opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center space-x-4">
          <span className="flex items-center"><HeartIcon className="w-5 h-5 mr-1" /> 0</span>
          <span className="flex items-center"><ChatBubbleIcon className="w-5 h-5 mr-1" /> 0</span>
        </div>
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
  const [feeds, setFeeds] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [followers, setFollowers] = useState<FollowingFollower[]>([]);
  const [following, setFollowing] = useState<FollowingFollower[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [followStatus, setFollowStatus] = useState<FollowStatus['status'] | null>(null);

  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
  const isMyProfile = loggedInUid === uid;

  useEffect(() => {
    if (!uid || !token) return;

    const fetchProfileData = async () => {
      setLoading(true);
      try {
        const [profileRes, feedsRes, followersRes, followingRes] = await Promise.all([
            fetch(`${API_URL}/user/profile/${uid}`, { headers: { Authorization: `Bearer ${token}` } }),
            fetch(`${API_URL}/feed/get/user/${uid}`, { headers: { Authorization: `Bearer ${token}` } }),
            fetch(`${API_URL}/user/followers?uid=${uid}`, { headers: { Authorization: `Bearer ${token}` } }),
            fetch(`${API_URL}/user/following?uid=${uid}`, { headers: { Authorization: `Bearer ${token}` } })
        ]);

        if (!profileRes.ok) throw new Error("Failed to fetch profile.");
        const profileData = await profileRes.json();
        setProfile(profileData);

        if (feedsRes.ok) {
          const feedIdsData = await feedsRes.json();
          if (feedIdsData.result === "success" && Array.isArray(feedIdsData.feedid)) {
            const feedDetailsPromises = feedIdsData.feedid.map((feedIdObj: { fid: string }) =>
              fetch(`${API_URL}/feed/get/${feedIdObj.fid}`, {
                headers: {
                  Authorization: `Bearer ${token}`,
                },
              }).then((res) => {
                if (!res.ok) return null;
                return res.json();
              })
            );

            const feedDetailsResponses = await Promise.all(feedDetailsPromises);

            const validFeeds = feedDetailsResponses
              .filter(response => response && response.result === "success" && response.feed)
              .map(response => response.feed);

            // 모든 피드는 동일한 사용자가 작성했으므로 닉네임은 한 번만 사용합니다.
            const feedsWithNickname = validFeeds.map((feed: FeedItem) => ({
              ...feed,
              nickname: profileData.nickname,
            }));

            setFeeds(feedsWithNickname);
          } else {
            setFeeds([]);
          }
        } else {
          console.error("Failed to fetch feed IDs.");
          setFeeds([]);
        }

        if (followersRes.ok) {
            const followersData = await followersRes.json();
            if (followersData.result === "success") setFollowers(followersData.following); // API가 following 필드를 재사용
        } else {
            console.error("Failed to fetch followers.");
        }

        if (followingRes.ok) {
            const followingData = await followingRes.json();
            if (followingData.result === "success") setFollowing(followingData.following);
        } else {
            console.error("Failed to fetch following.");
        }

        // Fetch follow status if not my profile
        if (!isMyProfile) {
          // 1. 내가 팔로우하는지 확인
          const myFollowingResponse = await fetch(`${API_URL}/user/following`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (myFollowingResponse.ok) {
            const myFollowingData = await myFollowingResponse.json();
            const isFollowing = myFollowingData.following.some((followedUser: { uid: string }) => followedUser.uid === uid);
            if (isFollowing) {
              setFollowStatus("following");
            } else {
              // TODO: 'requested' 상태 확인 로직 추가 (보낸 요청 목록 API 필요)
              setFollowStatus("not_following");
            }
          } else {
            // API 호출 실패 시 기본 상태
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
    const response = await fetch(`${API_URL}/user/follow/request?follow_uid=${uid}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
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
    const response = await fetch(`${API_URL}/user/follow/unfollow?unfollow_uid=${uid}`, { // 이 API가 존재한다고 가정합니다.
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (response.ok) {
      setFollowStatus("not_following");
    }
  };

  if (loading) return <div className="text-center p-10">Loading profile...</div>;
  if (error) return <div className="text-center p-10 text-red-500">Error: {error}</div>;
  if (!profile) return <div className="text-center p-10">User not found.</div>;

  const renderFollowButton = () => {
    if (isMyProfile) return null;

    switch (followStatus) {
      case 'following':
        return <button onClick={handleUnfollow} className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700">Unfollow</button>;
      case 'requested':
        return <button className="px-4 py-2 bg-gray-400 text-white rounded-md cursor-not-allowed">Requested</button>;
      case 'not_following':
      default:
        return <button onClick={handleFollow} className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700">Follow</button>;
    }
  };

  return (
    <div className="container mx-auto p-4">
      <div className="flex items-center space-x-4 mb-6 p-4 bg-gray-800 rounded-lg">
        <div className="w-24 h-24 rounded-full bg-gray-500"></div>
        <div className="flex-grow">
          <div className="flex items-center space-x-4">
            <h1 className="text-2xl font-bold">{profile.nickname}</h1>
            {renderFollowButton()}
          </div>
          <div className="flex space-x-4 mt-2 text-gray-300">
              <span>게시물 <span className="font-semibold text-white">{feeds.length}</span></span>
              <span>팔로워 <span className="font-semibold text-white">{followers.length}</span></span>
              <span>팔로잉 <span className="font-semibold text-white">{following.length}</span></span>
          </div>
          {isMyProfile && (
            <p className="text-gray-400 mt-2">{profile.email}</p>
          )}
          <p className="mt-2">{profile.bio || "No bio yet."}</p>
        </div>
      </div>
      <hr className="border-gray-700 my-6" />
      <div className="grid grid-cols-3 gap-1 sm:gap-4">
        {feeds.filter(feed => feed.images && feed.images.length > 0).map((feed) => (
          <FeedImageTile key={feed.fid} feed={feed} profileNickname={profile.nickname} />
        ))}
         {feeds.filter(feed => feed.images && feed.images.length > 0).length === 0 && (
            <div className="col-span-3 text-center py-10 text-gray-400">게시물 없음</div>
        )}
      </div>
    </div>
  );
}