"use client";

import { useAuth } from "@/hooks/useAuth";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import FeedList from "./components/FeedList";
import FeedDetail from "./components/FeedDetail";
import { MapViewInfo } from "./components/Map";
import { fetchSingleFeedDetailCached } from "@/utils/feedCache";
import {
  Radio,
  ArrowRight,
  MapPin,
  Map as MapIcon,
  List,
  Columns,
} from "lucide-react";

const RegionDropdown = dynamic(() => import("./components/RegionDropdown"), {
  ssr: false,
});

interface BBoxPayload {
  SW: {
    lat: number;
    long: number;
  };
  NE: {
    lat: number;
    long: number;
  };
}

interface FeedLocationItem {
  fid: string;
  uid: string;
  post_date: string;
  location: {
    long: number;
    lat: number;
  };
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

const BATCH_SIZE = 5;

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
  const [rawFeedLocations, setRawFeedLocations] = useState<FeedLocationItem[]>(
    []
  );
  const [feedCounts, setFeedCounts] = useState<
    { count: number; location: { long: number; lat: number } }[]
  >([]);
  const [currentZoom, setCurrentZoom] = useState<number>(13);
  const [currentAddress, setCurrentAddress] = useState<string | null>(null);
  const [loadedDetails, setLoadedDetails] = useState<Record<string, FeedItem>>(
    {}
  );
  const [listFeeds, setListFeeds] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selectedFeed, setSelectedFeed] = useState<FeedItem | null>(null);
  const [mobileView, setMobileView] = useState<"split" | "map" | "list">(
    "split"
  );
  const [flyToCoords, setFlyToCoords] = useState<{
    lat: number;
    lng: number;
    zoom?: number;
  } | null>(null);
  const mapMoveTimeout = useRef<NodeJS.Timeout | null>(null);
  const lastFetchedBBoxRef = useRef<string>("");
  const addressCacheRef = useRef<Record<string, string>>({});

  const handleRegionSelect = useCallback(
    (lat: number, lng: number, label: string) => {
      // Use zoom level >= 16 so backend returns individual feeds instead of count aggregates
      const parts = label.split(" › ").length;
      const zoom = parts === 1 ? 16 : parts === 2 ? 16 : 17;
      setFlyToCoords({ lat, lng, zoom });
      // Update current address display
      setCurrentAddress(label.replace(/ › /g, " "));
    },
    []
  );

  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

  // Helper to fetch address by position for map center
  // 줌 레벨 단계에 따라 표시 단위 결정
  // zoom < 11       → 주소 미표시
  // 11 <= zoom < 14 → 시도
  // 14 <= zoom < 16 → 시도 + 시군구
  // zoom >= 16      → 시도 + 시군구 + 읍면동
  const fetchAddressForPosition = useCallback(
    async (lat: number, long: number, zoom: number, authToken: string) => {
      if (zoom < 11) {
        setCurrentAddress(null);
        return;
      }

      const cacheKey = `${lat.toFixed(3)},${long.toFixed(3)},z${zoom}`;
      if (addressCacheRef.current[cacheKey]) {
        setCurrentAddress(addressCacheRef.current[cacheKey]);
        return;
      }

      try {
        const response = await fetch(
          `${API_URL}/feed/address?lat=${lat}&long=${long}`,
          {
            headers: { Authorization: `Bearer ${authToken}` },
          }
        );
        if (response.ok) {
          const data = await response.json();
          if (data.result === "success") {
            let parts: string[];
            if (zoom < 14) {
              parts = [data.sido_nm];
            } else if (zoom < 16) {
              parts = [data.sido_nm, data.sigungu_nm];
            } else {
              parts = [data.sido_nm, data.sigungu_nm, data.emd_nm];
            }
            const formatted = parts.filter(Boolean).join(" ");
            if (formatted) {
              addressCacheRef.current[cacheKey] = formatted;
              setCurrentAddress(formatted);
            }
          }
        }
      } catch (err) {
        console.error("Failed to fetch center address:", err);
      }
    },
    [API_URL]
  );

  // Helper to fetch single feed detail with frontend caching
  const fetchSingleFeedDetail = useCallback(
    async (fid: string, authToken: string): Promise<FeedItem | null> => {
      return fetchSingleFeedDetailCached(fid, authToken, API_URL);
    },
    [API_URL]
  );

  // Helper to fetch details for a batch of feed items
  const fetchFeedDetailsBatch = useCallback(
    async (
      batchItems: FeedLocationItem[],
      authToken: string
    ): Promise<FeedItem[]> => {
      const promises = batchItems.map((item) =>
        fetchSingleFeedDetail(item.fid, authToken)
      );
      const results = await Promise.all(promises);
      return results.filter((feed): feed is FeedItem => feed !== null);
    },
    [fetchSingleFeedDetail]
  );

  // Helper to fetch feeds by Bounding Box (SW & NE) and Zoom level
  const fetchFeedsByBBox = useCallback(
    async (bbox: BBoxPayload, zoom: number, authToken: string) => {
      setError(null);
      try {
        const roundedZoom = Math.round(zoom);
        const feedIdsResponse = await fetch(
          `${API_URL}/feed/get/location?zoom=${roundedZoom}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${authToken}`,
            },
            body: JSON.stringify(bbox),
          }
        );

        if (!feedIdsResponse.ok) {
          throw new Error(
            `Failed to fetch feed locations: ${feedIdsResponse.statusText}`
          );
        }

        const feedData = await feedIdsResponse.json();

        if (feedData.result === "success" && feedData.count) {
          setFeedCounts(feedData.count);
          setRawFeedLocations([]);
          setListFeeds([]);
          setLoadedDetails({});
          return;
        }

        if (feedData.result !== "success" || !feedData.feeds) {
          setFeedCounts([]);
          setRawFeedLocations([]);
          setListFeeds([]);
          setLoadedDetails({});
          return;
        }

        setFeedCounts([]);

        const locationList: FeedLocationItem[] = [];
        const seenFids = new Set<string>();
        for (const item of feedData.feeds) {
          if (!seenFids.has(item.fid)) {
            seenFids.add(item.fid);
            locationList.push(item);
          }
        }

        setRawFeedLocations(locationList);

        // Lazy load: Fetch details for only the first batch (10 items) for list
        const firstBatch = locationList.slice(0, BATCH_SIZE);
        const initialFeeds = await fetchFeedDetailsBatch(firstBatch, authToken);

        const detailsMap: Record<string, FeedItem> = {};
        initialFeeds.forEach((item) => {
          detailsMap[item.fid] = item;
        });

        setLoadedDetails(detailsMap);
        setListFeeds(initialFeeds);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    },
    [API_URL, fetchFeedDetailsBatch]
  );

  useEffect(() => {
    if (isLoggedIn) {
      // Attempt to restore saved location and zoom from sessionStorage
      try {
        const savedCenterStr = sessionStorage.getItem("map_last_center");
        const savedZoomStr = sessionStorage.getItem("map_last_zoom");

        if (savedCenterStr) {
          const savedCenter = JSON.parse(savedCenterStr);
          if (
            typeof savedCenter.latitude === "number" &&
            typeof savedCenter.longitude === "number"
          ) {
            setLocation(savedCenter);
            if (savedZoomStr) {
              const parsedZoom = Number(savedZoomStr);
              if (!isNaN(parsedZoom)) {
                setCurrentZoom(parsedZoom);
              }
            }
            setLoading(false);
            return;
          }
        }
      } catch (e) {
        console.error("Failed to restore map position from sessionStorage", e);
      }

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

  // Initial load of nearby feed locations when user location is available
  useEffect(() => {
    if (isLoggedIn && location && token) {
      const latDelta = 0.03;
      const lngDelta = 0.03;
      const initialBBox: BBoxPayload = {
        SW: {
          lat: location.latitude - latDelta,
          long: location.longitude - lngDelta,
        },
        NE: {
          lat: location.latitude + latDelta,
          long: location.longitude + lngDelta,
        },
      };
      const initialZoom = currentZoom || 13;
      fetchAddressForPosition(location.latitude, location.longitude, initialZoom, token);
      const bboxKey = `${initialBBox.SW.lat.toFixed(4)},${initialBBox.SW.long.toFixed(4)},${initialBBox.NE.lat.toFixed(4)},${initialBBox.NE.long.toFixed(4)},z${initialZoom}`;
      if (lastFetchedBBoxRef.current === "") {
        lastFetchedBBoxRef.current = bboxKey;
        fetchFeedsByBBox(initialBBox, initialZoom, token);
      }
    }
  }, [isLoggedIn, location, token, fetchFeedsByBBox, fetchAddressForPosition, currentZoom]);

  // Lazy loading handler when scrolling down in FeedList
  const handleLoadMore = useCallback(async () => {
    if (loadingMore || listFeeds.length >= rawFeedLocations.length || !token)
      return;

    setLoadingMore(true);
    const nextStartIndex = listFeeds.length;
    const nextBatchItems = rawFeedLocations.slice(
      nextStartIndex,
      nextStartIndex + BATCH_SIZE
    );

    const newFeeds = await fetchFeedDetailsBatch(nextBatchItems, token);

    setLoadedDetails((prev) => {
      const updated = { ...prev };
      newFeeds.forEach((item) => {
        updated[item.fid] = item;
      });
      return updated;
    });

    setListFeeds((prev) => {
      const existingFids = new Set(prev.map((item) => item.fid));
      const uniqueNewFeeds = newFeeds.filter((item) => !existingFids.has(item.fid));
      return [...prev, ...uniqueNewFeeds];
    });
    setLoadingMore(false);
  }, [
    loadingMore,
    listFeeds.length,
    rawFeedLocations,
    token,
    fetchFeedDetailsBatch,
  ]);

  // All feeds to display on Map (combines location with loaded details if available)
  const mapFeeds: FeedItem[] = useMemo(() => {
    return rawFeedLocations.map((locItem) => {
      const detail = loadedDetails[locItem.fid];
      if (detail) {
        return detail;
      }
      return {
        fid: locItem.fid,
        uid: locItem.uid,
        post_date: locItem.post_date,
        location: locItem.location,
        content: "",
        images: [],
        private: false,
      };
    });
  }, [rawFeedLocations, loadedDetails]);

  const handleFeedItemClick = async (feed: FeedItem) => {
    if (!feed.content && token) {
      const detail = await fetchSingleFeedDetail(feed.fid, token);
      if (detail) {
        setSelectedFeed(detail);
        setLoadedDetails((prev) => ({ ...prev, [detail.fid]: detail }));
        setLocation({
          latitude: detail.location.lat,
          longitude: detail.location.long,
        });
        return;
      }
    }
    setSelectedFeed(feed);
    setLocation({ latitude: feed.location.lat, longitude: feed.location.long });
  };

  const handleMapMoveEnd = useCallback(
    (viewInfo: MapViewInfo) => {
      if (!token) return;

      const roundedZoom = Math.round(viewInfo.zoom);
      setCurrentZoom(roundedZoom);

      try {
        sessionStorage.setItem(
          "map_last_center",
          JSON.stringify(viewInfo.center)
        );
        sessionStorage.setItem("map_last_zoom", String(roundedZoom));
      } catch (e) {
        console.error("Failed to save map position to sessionStorage", e);
      }

      // 모든 줌 레벨에서 주소 표시 (단계별 단위로)
      fetchAddressForPosition(
        viewInfo.center.latitude,
        viewInfo.center.longitude,
        roundedZoom,
        token
      );

      if (mapMoveTimeout.current) {
        clearTimeout(mapMoveTimeout.current);
      }

      mapMoveTimeout.current = setTimeout(() => {
        const bbox: BBoxPayload = {
          SW: {
            lat: viewInfo.bounds.south,
            long: viewInfo.bounds.west,
          },
          NE: {
            lat: viewInfo.bounds.north,
            long: viewInfo.bounds.east,
          },
        };
        const bboxKey = `${bbox.SW.lat.toFixed(4)},${bbox.SW.long.toFixed(4)},${bbox.NE.lat.toFixed(4)},${bbox.NE.long.toFixed(4)},z${roundedZoom}`;

        if (bboxKey === lastFetchedBBoxRef.current) return;
        lastFetchedBBoxRef.current = bboxKey;
        fetchFeedsByBBox(bbox, roundedZoom, token);
      }, 400);
    },
    [token, fetchFeedsByBBox, fetchAddressForPosition]
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
          Discover local stories, location-based pings, and real-time
          discussions right where you are.
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
    <div className="flex flex-col md:flex-row h-[calc(100vh-4rem-3.5rem)] md:h-[calc(100vh-4rem)] w-full overflow-hidden bg-black relative">

      {/* Left Panel: Feed List or Feed Detail */}
      <div
        className={`w-full md:w-[400px] md:min-w-[400px] shrink-0 bg-black border-t md:border-t-0 md:border-r border-gray-800/80 overflow-hidden flex flex-col order-2 md:order-1 transition-[height] duration-300 ease-in-out relative ${
          mobileView === "map"
            ? "hidden md:flex md:flex-col md:h-full"
            : mobileView === "list"
            ? "h-full md:flex md:flex-col md:h-full"
            : selectedFeed
            ? "h-[60%] md:flex md:flex-col md:h-full"
            : "h-[40%] md:flex md:flex-col md:h-full"
        }`}
      >
        {selectedFeed ? (
          <FeedDetail
            feed={selectedFeed}
            onBack={handleBackToFeedList}
            token={token}
          />
        ) : (
          <FeedList
            feeds={listFeeds}
            totalCount={rawFeedLocations.length}
            hasMore={listFeeds.length < rawFeedLocations.length}
            loadingMore={loadingMore}
            onLoadMore={handleLoadMore}
            onFeedItemClick={handleFeedItemClick}
            title="Nearby Pings"
          />
        )}

        {/* Toggle bar shown only in list mode, since map panel (with the toggle) is hidden */}
        {mobileView === "list" && (
          <div className="md:hidden sticky bottom-0 left-0 right-0 bg-gray-950/95 border-t border-gray-800 py-2 flex justify-center z-50">
            <div className="bg-gray-900/95 border border-gray-800 backdrop-blur-lg p-1.5 rounded-full shadow-2xl flex items-center gap-1 text-xs">
              <button
                onClick={() => setMobileView("split")}
                className="px-3 py-1.5 rounded-full flex items-center gap-1.5 transition-all text-gray-400 hover:text-white"
              >
                <Columns className="w-3.5 h-3.5" />
                <span>분할</span>
              </button>
              <button
                onClick={() => setMobileView("map")}
                className="px-3 py-1.5 rounded-full flex items-center gap-1.5 transition-all text-gray-400 hover:text-white"
              >
                <MapIcon className="w-3.5 h-3.5" />
                <span>지도</span>
              </button>
              <button
                onClick={() => setMobileView("list")}
                className="px-3 py-1.5 rounded-full flex items-center gap-1.5 transition-all bg-blue-600 text-white font-semibold shadow-md shadow-blue-600/30"
              >
                <List className="w-3.5 h-3.5" />
                <span>목록</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Right Panel: Map */}
      <div
        className={`w-full relative bg-gray-950 order-1 md:order-2 md:flex-1 transition-[height] duration-300 ease-in-out ${
          mobileView === "list"
            ? "hidden md:block md:h-full"
            : mobileView === "map"
            ? "h-full"
            : selectedFeed
            ? "h-[40%] md:h-full"
            : "h-[60%] md:h-full"
        }`}
      >
        {/* Mobile view toggle — floats inside map panel, never covers list/detail */}
        <div className="md:hidden absolute bottom-3 left-1/2 -translate-x-1/2 z-[1001] bg-gray-900/95 border border-gray-800 backdrop-blur-lg p-1.5 rounded-full shadow-2xl flex items-center gap-1 text-xs">
          <button
            onClick={() => setMobileView("split")}
            className={`px-3 py-1.5 rounded-full flex items-center gap-1.5 transition-all ${
              mobileView === "split"
                ? "bg-blue-600 text-white font-semibold shadow-md shadow-blue-600/30"
                : "text-gray-400 hover:text-white"
            }`}
          >
            <Columns className="w-3.5 h-3.5" />
            <span>분할</span>
          </button>
          <button
            onClick={() => setMobileView("map")}
            className={`px-3 py-1.5 rounded-full flex items-center gap-1.5 transition-all ${
              mobileView === "map"
                ? "bg-blue-600 text-white font-semibold shadow-md shadow-blue-600/30"
                : "text-gray-400 hover:text-white"
            }`}
          >
            <MapIcon className="w-3.5 h-3.5" />
            <span>지도</span>
          </button>
          <button
            onClick={() => setMobileView("list")}
            className={`px-3 py-1.5 rounded-full flex items-center gap-1.5 transition-all ${
              mobileView === "list"
                ? "bg-blue-600 text-white font-semibold shadow-md shadow-blue-600/30"
                : "text-gray-400 hover:text-white"
            }`}
          >
            <List className="w-3.5 h-3.5" />
            <span>목록</span>
          </button>
        </div>

        {error && (
          <div className="absolute top-4 left-4 z-20 bg-red-950/80 border border-red-800 text-red-200 text-xs px-4 py-2 rounded-xl backdrop-blur-md shadow-lg flex items-center gap-2">
            <MapPin className="w-4 h-4 text-red-400" />
            <span>{error}</span>
          </div>
        )}

        {/* Region search dropdown — top-left of map */}
        {isLoggedIn && (
          <div className="absolute top-4 left-4 z-[1002]">
            <RegionDropdown onRegionSelect={handleRegionSelect} />
          </div>
        )}

        {currentAddress && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1000] bg-gray-900/90 border border-gray-800/90 backdrop-blur-md px-4 py-1.5 rounded-full shadow-2xl flex items-center gap-1.5 text-xs text-gray-200 pointer-events-none">
            <MapPin className="w-3.5 h-3.5 text-blue-400 shrink-0" />
            <span className="font-semibold">{currentAddress}</span>
          </div>
        )}
        {location ? (
          <Map
            location={location}
            zoom={currentZoom}
            feeds={mapFeeds}
            feedCounts={feedCounts}
            selectedFeed={selectedFeed}
            onMapMoveEnd={handleMapMoveEnd}
            flyToCoords={flyToCoords}
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
