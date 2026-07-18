"use client";

import { useAuth } from "@/hooks/useAuth";
import { useState, useEffect } from "react";
import dynamic from 'next/dynamic';
import Link from 'next/link';
import FeedList from "./components/FeedList";

// Updated to match the backend FeedItem schema
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

// Dynamically import the Map component
const Map = dynamic(() => import('./components/Map'), { 
  ssr: false,
  loading: () => <p>Loading map...</p> 
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

  const API_URL = process.env.API_URL || "http://localhost:8000";

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
          (error) => {
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
        setLoading(true);
        setError(null);
        try {
          const feedIdsResponse = await fetch(
            `${API_URL}/feed/get/location?lat=${location.latitude}&long=${location.longitude}&radius=5000`,
            {
              headers: {
                Authorization: `Bearer ${token}`,
              },
            }
          );

          if (!feedIdsResponse.ok) {
            throw new Error(`Failed to fetch feed IDs: ${feedIdsResponse.statusText}`);
          }

          const feedIdsData = await feedIdsResponse.json();
          
          if (feedIdsData.result !== "success" || !feedIdsData.feedid) {
            setFeeds([]);
            return;
          }

          const feedDetailsPromises = feedIdsData.feedid.map((feedIdObj: {fid: string}) =>
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

      fetchFeeds();
    }
  }, [isLoggedIn, location, token, API_URL]);
  
  const handleFeedItemClick = (feed: FeedItem) => {
    setSelectedFeed(feed);
    setLocation({latitude: feed.location.lat, longitude: feed.location.long})
  }

  if (loading) {
    return <main className="flex flex-col items-center justify-center min-h-screen p-4"><p>Loading...</p></main>;
  }

  if (!isLoggedIn) {
    return (
      <main className="flex flex-col items-center justify-center min-h-screen p-4">
        <h1 className="text-4xl font-bold mb-8">Welcome to Ping</h1>
        <p className="text-xl mb-8">Connect with people around you.</p>
        <div className="flex gap-4">
          <Link href="/user/login" className="px-6 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600">
            Log In
          </Link>
          <Link href="/user/join" className="px-6 py-2 bg-green-500 text-white rounded-md hover:bg-green-600">
            Sign Up
          </Link>
        </div>
      </main>
    );
  }

  return (
    <div className="main-layout">
      <div>

        <FeedList feeds={feeds} onFeedItemClick={handleFeedItemClick} title="Nearby Pings" />
      </div>
      <div className="map-layout">
        {error && <p className="absolute top-4 left-4 bg-red-100 text-red-700 p-2 rounded z-10">{error}</p>}
        {location ? (
          <Map location={location} feeds={feeds} />
        ) : (
          <div className="flex items-center justify-center h-full">
            <p>Getting your location...</p>
          </div>
        )}
      </div>
    </div>
  );
}
