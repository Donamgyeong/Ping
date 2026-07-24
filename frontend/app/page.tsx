"use client";

import { useAuth } from "@/hooks/useAuth";
import { useState, useEffect, useRef, useCallback } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import FeedList from "./components/FeedList";
import FeedDetail from "./components/FeedDetail";
import { Radio, ArrowRight, MapPin } from "lucide-react";

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

const Map = dynamic(() => import("./components/Map"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full text-gray-500 text-sm">
      Loading map...
    </div>
  ),
});

export default function Home() {
  const { token } = useAuth();
  const isLoggedIn = !!token;
  const [location, setLocation] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [feeds, setFeeds] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedFeed, setSelectedFeed] = useState<FeedItem | null>(null);
  const mapMoveTimeout = useRef<NodeJS.Timeout | null>(null);

  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

  useEffect(() => {
    if (isLoggedIn) {
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            setLocation({
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
            });
            setError(null);
            setLoading(false);
          },
          () => {
            setError("Please enable location services to see nearby pings.");
            setLoading(false);
          }
        );
      } else {
        setError("Geolocation is not supported by this browser.");
        setLoading(false);
      }
    } else {
      setLoading(false);
    }
  }, [isLoggedIn]);

  useEffect(() => {
    if (isLoggedIn && location && token) {
      const fetchFeeds = async () => {
        setError(null);
        try {
          const feedIdsResponse = await fetch(
            `${API_URL}/feed/get/location?lat=${location.latitude}&long=${location.longitude}&radius=30000`,
            {
              headers: {
                Authorization: `Bearer ${token}`,
              },
            }
          );

          if (!feedIdsResponse.ok) {
            throw new Error(
              `Failed to fetch feed IDs: ${feedIdsResponse.statusText}`
            );
          }

          const feedIdsData = await feedIdsResponse.json();

          if (feedIdsData.result !== "success" || !feedIdsData.feedid) {
            setFeeds([]);
            return;
          }

          const feedDetailsPromises = feedIdsData.feedid.map(
            (feedIdObj: { fid: string }) =>
              fetch(`${API_URL}/feed/get/${feedIdObj.fid}`, {
                headers: {
                  Authorization: `Bearer ${token}`,
                },
              }).then((res) => {
                if (!res.ok) {
                  return null;
                }
                return res.json();
              })
          );

          const feedDetailsResponses = await Promise.all(feedDetailsPromises);

          const validFeeds = feedDetailsResponses.filter(
            (response) =>
              response && response.result === "success" && response.feed
          );

          const feedsWithNicknames: FeedItem[] = [];
          for (const feedResponse of validFeeds) {
            const feed = feedResponse.feed;
            try {
              const userResponse = await fetch(
                `${API_URL}/user/profile/${feed.uid}`,
                {
                  headers: {
                    Authorization: `Bearer ${token}`,
                  },
                }
              );
              if (userResponse.ok) {
                const userData = await userResponse.json();
                feed.nickname = userData.nickname;
              }
            } catch (e) {
              // Ignore error
            }
            feedsWithNicknames.push(feed);
          }

          setFeeds(feedsWithNicknames);
        } catch (err: any) {
          setError(err.message);
        } finally {
          setLoading(false);
        }
      };

      fetchFeeds();
    }
  }, [isLoggedIn, location, token, API_URL]);

  const handleFeedItemClick = (feed: FeedItem) => {
    setSelectedFeed(feed);
    setLocation({ latitude: feed.location.lat, longitude: feed.location.long });
  };

  const handleMapMoveEnd = useCallback(
    (newLocation: { latitude: number; longitude: number }) => {
      if (mapMoveTimeout.current) {
        clearTimeout(mapMoveTimeout.current);
      }

      mapMoveTimeout.current = setTimeout(() => {
        if (
          location &&
          Math.abs(location.latitude - newLocation.latitude) < 0.001 &&
          Math.abs(location.longitude - newLocation.longitude) < 0.001
        ) {
          return;
        }
        setLocation(newLocation);
      }, 500);
    },
    [location]
  );

  const handleBackToFeedList = () => {
    setSelectedFeed(null);
  };

  if (loading) {
    return (
      <main className="flex flex-col items-center justify-center min-h-[calc(100vh-4rem)] p-4 bg-black text-gray-400">
        <p>Loading...</p>
      </main>
    );
  }

  if (!isLoggedIn) {
    return (
      <main className="flex flex-col items-center justify-center min-h-[calc(100vh-4rem)] p-6 bg-black text-white relative overflow-hidden">
        <div className="absolute w-96 h-96 bg-blue-600/10 rounded-full blur-3xl -top-20 -left-20 pointer-events-none" />
        <div className="absolute w-96 h-96 bg-purple-600/10 rounded-full blur-3xl -bottom-20 -right-20 pointer-events-none" />

        <div className="w-16 h-16 rounded-2xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400 mb-6 shadow-xl shadow-blue-500/10">
          <Radio className="w-8 h-8 animate-pulse" />
        </div>

        <h1 className="text-4xl sm:text-5xl font-black text-center tracking-tight mb-4 bg-gradient-to-r from-white via-gray-200 to-gray-400 bg-clip-text text-transparent">
          Connect Around You
        </h1>
        <p className="text-gray-400 text-center max-w-md mb-8 text-sm sm:text-base leading-relaxed">
          Discover local stories, location-based pings, and real-time discussions right where you are.
        </p>

        <div className="flex gap-4">
          <Link
            href="/user/login"
            className="px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl text-sm transition-all shadow-lg shadow-blue-600/20 flex items-center gap-2"
          >
            <span>Log In</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
          <Link
            href="/user/join"
            className="px-6 py-3 bg-gray-900 hover:bg-gray-800 border border-gray-800 text-gray-200 font-semibold rounded-xl text-sm transition-all"
          >
            Sign Up
          </Link>
        </div>
      </main>
    );
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] w-full overflow-hidden bg-black">
      {/* Sidebar View */}
      <div className="w-full md:w-96 shrink-0 bg-black border-r border-gray-800/80 overflow-y-auto">
        {selectedFeed ? (
          <FeedDetail
            feed={selectedFeed}
            onBack={handleBackToFeedList}
            token={token}
          />
        ) : (
          <FeedList
            feeds={feeds}
            onFeedItemClick={handleFeedItemClick}
            title="Nearby Pings"
          />
        )}
      </div>

      {/* Map View */}
      <div className="hidden md:block flex-1 relative bg-gray-950">
        {error && (
          <div className="absolute top-4 left-4 z-20 bg-red-950/80 border border-red-800 text-red-200 text-xs px-4 py-2 rounded-xl backdrop-blur-md shadow-lg flex items-center gap-2">
            <MapPin className="w-4 h-4 text-red-400" />
            <span>{error}</span>
          </div>
        )}
        {location ? (
          <Map
            location={location}
            feeds={feeds}
            selectedFeed={selectedFeed}
            onMapMoveEnd={handleMapMoveEnd}
          />
        ) : (
          <div className="flex items-center justify-center h-full text-gray-500 text-sm">
            Getting your location...
          </div>
        )}
      </div>
    </div>
  );
}
