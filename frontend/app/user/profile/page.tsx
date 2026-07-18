"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import FeedList from '@/app/components/FeedList'; // Adjust path if necessary

interface UserProfile {
    uid: string;
    nickname: string;
    bio: string | null;
    profile_picture: string | null;
    private: boolean;
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
    private: boolean;
}

export default function ProfilePage() {
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [feeds, setFeeds] = useState<FeedItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const router = useRouter();

    const API_URL = process.env.API_URL || "http://localhost:8000";

    useEffect(() => {
        const fetchProfileAndFeeds = async () => {
            const token = localStorage.getItem('token');
            if (!token) {
                router.push('/user/login');
                return;
            }

            try {
                // 1. Get the current user's UID
                const meResponse = await fetch(`${API_URL}/user/me`, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                if (!meResponse.ok) throw new Error('Failed to fetch user ID.');
                const meData = await meResponse.json();
                if (meData.result !== 'success' || !meData.id) throw new Error('Could not get user ID.');
                const uid = meData.id;

                // 2. Fetch the profile using the UID
                const profileResponse = await fetch(`${API_URL}/user/profile/${uid}`, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                if (!profileResponse.ok) throw new Error('Failed to fetch profile data.');
                const profileData = await profileResponse.json();
                if (profileData.result === 'success') {
                    setProfile(profileData);
                } else {
                    throw new Error(profileData.detail || 'Could not fetch profile.');
                }

                // 3. Fetch user's feed IDs
                const feedIdsResponse = await fetch(`${API_URL}/feed/get/user/${uid}`, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                if (!feedIdsResponse.ok) throw new Error('Failed to fetch feed IDs.');
                const feedIdsData = await feedIdsResponse.json();
                if (feedIdsData.result !== 'success' || !feedIdsData.feedid) return;

                // 4. Fetch full feed details for each ID
                const feedDetailsPromises = feedIdsData.feedid.map((feedIdObj: { fid: string }) =>
                    fetch(`${API_URL}/feed/get/${feedIdObj.fid}`, {
                        headers: { Authorization: `Bearer ${token}` },
                    }).then(res => res.ok ? res.json() : null)
                );

                const feedDetailsResponses = await Promise.all(feedDetailsPromises);
                const validFeeds = feedDetailsResponses
                    .filter(response => response && response.result === "success" && response.feed)
                    .map(response => response.feed);
                
                setFeeds(validFeeds);

            } catch (err: any) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };

        fetchProfileAndFeeds();
    }, [API_URL, router]);

    const handleFeedItemClick = (feed: FeedItem) => {
        // In the profile page, we might just want to navigate to the feed's page
        router.push(`/feed/${feed.fid}`);
    };

    return (
        <div className="max-w-screen-xl mx-auto p-4 md:p-8">
            {loading && <p>Loading profile...</p>}
            {error && <p className="text-red-500">{error}</p>}
            {profile && (
                <div>
                    <header className="flex items-center space-x-8 mb-10">
                        <div className="w-24 h-24 md:w-36 md:h-36 rounded-full bg-gray-300">
                            {/* Avatar placeholder */}
                        </div>
                        <div className="space-y-3">
                            <h1 className="text-2xl md:text-3xl font-light">{profile.nickname}</h1>
                            <p className="text-sm">{profile.bio || 'No bio available.'}</p>
                            <div className="flex space-x-6 text-sm">
                                <span><span className="font-semibold">{feeds.length}</span> posts</span>
                                <span><span className="font-semibold">0</span> followers</span>
                                <span><span className="font-semibold">0</span> following</span>
                            </div>
                            <span className={`text-xs font-semibold inline-block py-1 px-2 uppercase rounded-full ${profile.private ? 'text-red-600 bg-red-200' : 'text-green-600 bg-green-200'}`}>
                                {profile.private ? 'Private' : 'Public'}
                            </span>
                        </div>
                    </header>
                    
                    <div className="border-t border-gray-700"></div>

                    <div className="mt-8">
                        <FeedList feeds={feeds} onFeedItemClick={handleFeedItemClick} title="Posts" emptyMessage="No posts yet." />
                    </div>
                </div>
            )}
        </div>
    );
}
