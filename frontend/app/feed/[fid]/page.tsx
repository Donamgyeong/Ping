"use client";

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import FeedDetail from '@/app/components/FeedDetail';

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

export default function FeedPage() {
  const params = useParams();
  const fid = params.fid as string;
  const { token, loading: authLoading } = useAuth();
  const router = useRouter();
  const [feed, setFeed] = useState<FeedItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

  useEffect(() => {
    if (authLoading) {
      return;
    }
    if (!token) {
      router.push('/user/login');
      return;
    }
    if (!fid) {
      setLoading(false);
      return;
    };

    const fetchFeed = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`${API_URL}/feed/get/${fid}`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.detail || 'Failed to fetch feed details.');
        }

        const data = await response.json();
        if (data.result === 'success' && data.feed) {
            const feedData = data.feed;
            // Fetch nickname
            const userResponse = await fetch(`${API_URL}/user/profile/${feedData.uid}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (userResponse.ok) {
                const userData = await userResponse.json();
                feedData.nickname = userData.nickname;
            }
            setFeed(feedData);
        } else {
          throw new Error('Feed not found.');
        }
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchFeed();
  }, [fid, token, authLoading, API_URL, router]);

  const handleBack = () => {
    router.back();
  };

  if (loading || authLoading) return <div className="text-center p-10">Loading feed...</div>;
  if (error) return <div className="text-center p-10 text-red-500">Error: {error}</div>;
  if (!feed) return <div className="text-center p-10">Feed not found.</div>;

  return (
    <div className="container mx-auto p-4">
        <FeedDetail feed={feed} onBack={handleBack} token={token} />
    </div>
  );
}