"use client";

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { formatLocalDateOnly } from '@/utils/date';

interface FeedItem {
    fid: string;
    uid: string;
    content: string;
    post_date: string;
}

export default function FeedPage() {
    const [feeds, setFeeds] = useState<FeedItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

    useEffect(() => {
        const fetchFeeds = async () => {
            const token = localStorage.getItem('token');
            if (!token) {
                setError("You must be logged in to view feeds.");
                setLoading(false);
                return;
            }

            try {
                // Example: Fetching feeds from people the user is following
                const response = await fetch(`${API_URL}/feed/get/following`, {
                    headers: {
                        Authorization: `Bearer ${token}`,
                    },
                });

                if (!response.ok) {
                    throw new Error('Failed to fetch feeds.');
                }

                const data = await response.json();
                if(data.result === 'success' && data.feedid) {
                    // This just gets IDs, you might need to fetch full feed data
                    // For this placeholder, we'll just show the IDs
                    const feedItems = data.feedid.map((item: any) => ({
                        fid: item.fid,
                        uid: item.uid,
                        content: `Feed content for ${item.fid}`, // Placeholder content
                        post_date: item.post_date,
                    }));
                    setFeeds(feedItems);
                }
            } catch (err: any) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };

        fetchFeeds();
    }, [API_URL]);

    return (
        <div className="max-w-screen-xl mx-auto p-4">
            <h1 className="text-3xl font-bold mb-6">Feed</h1>
            {loading && <p>Loading feeds...</p>}
            {error && <p className="text-red-500">{error}</p>}
            {!loading && !error && (
                <div className="space-y-4 max-w-lg mx-auto">
                    {feeds.length > 0 ? (
                        feeds.map(feed => (
                            <div key={feed.fid} className="p-4 border rounded-lg bg-white">
                                <p>{feed.content}</p>
                                <div className="text-sm text-gray-500 mt-2">
                                    <span>Posted by {feed.uid} on {formatLocalDateOnly(feed.post_date)}</span>
                                    <Link href={`/feed/${feed.fid}`} className="ml-4 font-semibold text-blue-500 hover:underline">
                                        View Details
                                    </Link>
                                </div>
                            </div>
                        ))
                    ) : (
                        <p>No feeds to display.</p>
                    )}
                </div>
            )}
        </div>
    );
}
