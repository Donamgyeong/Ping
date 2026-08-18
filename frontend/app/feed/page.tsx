"use client";

import { useEffect, useState, memo, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { formatLocalDate } from "@/utils/date";
import { fetchSingleFeedDetailCached, fetchFeedAddressCached, FeedItem } from "@/utils/feedCache";
import { getFileUrl } from "@/utils/upload";
import { User, Users, MapPin, Loader2, Compass } from "lucide-react";

interface FeedTileProps {
  feed: FeedItem;
}

const BATCH_SIZE = 12;

const FeedTile = memo(function FeedTile({ feed }: FeedTileProps) {
  const { token } = useAuth();
  const router = useRouter();
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const tileRef = useRef<HTMLDivElement | null>(null);
  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

  // IntersectionObserver to set isVisible when tile enters viewport
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

  // Fetch thumbnail image when tile becomes visible
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
          console.error("Failed to fetch feed tile image", error);
        }
      }
    };

    fetchImage();

    return () => {
      isMounted = false;
    };
  }, [isVisible, feed.images, token]);

  const hasImage = feed.images && feed.images.length > 0;

  return (
    <div
      ref={tileRef}
      onClick={() => router.push(`/feed/${feed.fid}`)}
      className="relative aspect-square cursor-pointer group rounded-xl overflow-hidden border border-gray-800 bg-gray-950 hover:border-blue-500/50 transition-all shadow-lg"
    >
      {hasImage ? (
        imageUrl ? (
          <img
            src={imageUrl}
            alt="Feed image"
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full bg-gray-900 animate-pulse flex items-center justify-center">
            <div className="w-5 h-5 border-2 border-blue-500/40 border-t-transparent rounded-full animate-spin" />
          </div>
        )
      ) : (
        <div className="w-full h-full p-3 sm:p-4 flex flex-col justify-between bg-gradient-to-br from-gray-900 to-gray-950 text-gray-200">
          <div className="flex items-center gap-1.5 text-xs text-blue-400 font-semibold truncate">
            <User className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">{feed.nickname || feed.uid}</span>
          </div>
          <p className="text-xs sm:text-sm text-gray-300 line-clamp-3 leading-relaxed font-medium">
            {feed.content || "No content"}
          </p>
          <span className="text-[10px] text-gray-500 font-mono">
            {formatLocalDate(feed.post_date)}
          </span>
        </div>
      )}

      {/* Hover Overlay */}
      <div className="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-between p-3 sm:p-4 text-white backdrop-blur-xs">
        <div className="space-y-1">
          <div className="flex items-center gap-1.5 text-xs font-bold text-blue-400">
            <User className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">{feed.nickname || feed.uid}</span>
          </div>
          {address && (
            <div className="flex items-center gap-1 text-[11px] text-blue-300 font-medium truncate">
              <MapPin className="w-3 h-3 text-blue-400 shrink-0" />
              <span className="truncate">{address}</span>
            </div>
          )}
        </div>
        <p className="text-xs sm:text-sm line-clamp-3 text-gray-200 leading-relaxed font-medium">
          {feed.content || "No content"}
        </p>
        <span className="text-[10px] text-gray-400 font-mono">
          {formatLocalDate(feed.post_date)}
        </span>
      </div>
    </div>
  );
});

export default function FeedPage() {
  const { token } = useAuth();
  const { loading: authLoading, isAuthenticated } = useRequireAuth();
  const router = useRouter();
  const [rawFeedIds, setRawFeedIds] = useState<{ fid: string; uid: string }[]>([]);
  const [feeds, setFeeds] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [processedCount, setProcessedCount] = useState(0);
  const rawFeedIdsRef = useRef<{ fid: string; uid: string }[]>([]);
  const processedCountRef = useRef<number>(0);
  const loadingMoreRef = useRef<boolean>(false);

  rawFeedIdsRef.current = rawFeedIds;
  processedCountRef.current = processedCount;
  loadingMoreRef.current = loadingMore;

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

  const fetchFeedBatch = useCallback(
    async (batchIds: { fid: string }[], authToken: string): Promise<FeedItem[]> => {
      const promises = batchIds.map((item) =>
        fetchSingleFeedDetailCached(item.fid, authToken, API_URL)
      );
      const results = await Promise.all(promises);
      return results.filter((feed): feed is FeedItem => feed !== null);
    },
    [API_URL]
  );

  useEffect(() => {
    if (authLoading || !isAuthenticated || !token) return;

    const fetchFollowingFeeds = async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(`${API_URL}/feed/following/get`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          throw new Error("Failed to fetch following feeds.");
        }

        const data = await response.json();
        if (data.result === "success" && Array.isArray(data.feedid)) {
          const allIds = data.feedid;
          setRawFeedIds(allIds);
          rawFeedIdsRef.current = allIds;

          const initialBatch = allIds.slice(0, BATCH_SIZE);
          setProcessedCount(initialBatch.length);
          processedCountRef.current = initialBatch.length;

          const initialFeeds = await fetchFeedBatch(initialBatch, token);
          setFeeds(initialFeeds);
        } else {
          setRawFeedIds([]);
          setFeeds([]);
          setProcessedCount(0);
        }
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchFollowingFeeds();
  }, [token, authLoading, API_URL, router, fetchFeedBatch]);

  // Load more feeds handler for infinite scroll
  const handleLoadMore = useCallback(async () => {
    if (
      loadingMoreRef.current ||
      processedCountRef.current >= rawFeedIdsRef.current.length ||
      !token
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
      const newFeeds = await fetchFeedBatch(nextBatchIds, token);

      setFeeds((prev) => {
        const existingFids = new Set(prev.map((item) => item.fid));
        const uniqueNewFeeds = newFeeds.filter((item) => !existingFids.has(item.fid));
        return [...prev, ...uniqueNewFeeds];
      });
    } catch (err) {
      console.error("Failed to load more feeds:", err);
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [token, fetchFeedBatch]);

  // Window scroll-based infinite scroll (more reliable than IntersectionObserver)
  useEffect(() => {
    const onScroll = () => {
      const scrolled = window.scrollY + window.innerHeight;
      const total = document.documentElement.scrollHeight;
      if (total - scrolled < 400) {
        handleLoadMore();
      }
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [handleLoadMore]);

  if (loading || authLoading || !isAuthenticated) {
    return (
      <div className="min-h-[calc(100vh-4rem)] bg-black text-white p-4 sm:p-6 flex flex-col items-center justify-center">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin mb-3" />
        <p className="text-sm text-gray-400">Loading following feeds...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-[calc(100vh-4rem)] bg-black text-red-400 p-4 flex flex-col items-center justify-center">
        <p className="text-sm">Error: {error}</p>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-black text-white p-4 sm:p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 sm:p-6 shadow-2xl flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg sm:text-xl font-bold text-white tracking-tight">
                Following Feeds
              </h1>
              <p className="text-xs text-gray-400">
                Pings from users you follow
              </p>
            </div>
          </div>

          <span className="text-xs font-mono bg-gray-950 border border-gray-800 px-3 py-1.5 rounded-full text-blue-400 font-semibold">
            {rawFeedIds.length} Pings
          </span>
        </div>

        {/* Feed Grid (3 Columns like Profile Page) */}
        {feeds.length > 0 ? (
          <div className="grid grid-cols-3 gap-2 sm:gap-4">
            {feeds.map((feed) => (
              <FeedTile key={feed.fid} feed={feed} />
            ))}
          </div>
        ) : (
          <div className="bg-gray-900/50 border border-gray-800/80 rounded-2xl p-12 text-center text-gray-500 flex flex-col items-center justify-center gap-4">
            <Compass className="w-12 h-12 text-gray-600" />
            <div className="space-y-1">
              <p className="text-sm font-semibold text-gray-300">
                No pings from followed users yet
              </p>
              <p className="text-xs text-gray-500">
                Explore nearby pings on the main map and follow users to see their posts here!
              </p>
            </div>
            <Link
              href="/"
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold transition-all shadow-md shadow-blue-600/20 flex items-center gap-1.5 mt-2"
            >
              <MapPin className="w-4 h-4" />
              <span>Explore Map</span>
            </Link>
          </div>
        )}

        {/* Sentinel for Lazy Load / Infinite Scroll */}
        {processedCount < rawFeedIds.length && (
          <div
            ref={sentinelRef}
            className="py-6 min-h-[60px] flex justify-center items-center w-full"
          >
            <div className="flex items-center gap-2 text-xs text-gray-400">
              {loadingMore && <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />}
              <span>{loadingMore ? "Loading more feeds..." : "Scroll down for more"}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
