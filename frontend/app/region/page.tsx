"use client";

import { useEffect, useState, memo, useCallback, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { formatLocalDate } from "@/utils/date";
import { fetchSingleFeedDetailCached, fetchFeedAddressCached, FeedItem } from "@/utils/feedCache";
import {
  MapPin,
  User,
  Loader2,
  ChevronDown,
  X,
  Compass,
  Grid,
  Search,
  Filter,
  RefreshCw,
  Eye,
} from "lucide-react";

interface SidoItem {
  sido_cd: string;
  sido_nm: string;
}

interface SigunguItem {
  sigungu_cd: string;
  sgg_nm: string;
}

interface EmdItem {
  emd_cd: string;
  emd_nm: string;
}

interface FeedTileProps {
  feed: FeedItem;
  onSelect: (feed: FeedItem) => void;
}

const BATCH_SIZE = 18;

const RegionFeedTile = memo(function RegionFeedTile({ feed, onSelect }: FeedTileProps) {
  const { token } = useAuth();
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
      { rootMargin: "250px" }
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
    let objectUrl: string | null = null;

    const fetchImage = async () => {
      if (feed.images && feed.images.length > 0 && token) {
        try {
          const response = await fetch(
            `${API_URL}/file/get/${feed.images[0]}?thumbnail=true`,
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
          console.error("Failed to fetch feed tile image", error);
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
  }, [isVisible, feed.images, token, API_URL]);

  const hasImage = feed.images && feed.images.length > 0;

  return (
    <div
      ref={tileRef}
      onClick={() => onSelect(feed)}
      className="relative aspect-square cursor-pointer group rounded-2xl overflow-hidden border border-gray-800/80 bg-gray-950 hover:border-blue-500/60 transition-all shadow-xl hover:shadow-blue-500/10"
    >
      {hasImage ? (
        imageUrl ? (
          <img
            src={imageUrl}
            alt="Feed thumbnail"
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full bg-gray-900/80 animate-pulse flex items-center justify-center">
            <Loader2 className="w-5 h-5 text-blue-500/50 animate-spin" />
          </div>
        )
      ) : (
        <div className="w-full h-full p-3 sm:p-4 flex flex-col justify-between bg-gradient-to-br from-gray-900 via-gray-950 to-black text-gray-200">
          <div className="flex items-center justify-between text-xs text-blue-400 font-semibold truncate">
            <div className="flex items-center gap-1.5 truncate">
              <User className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{feed.nickname || feed.uid}</span>
            </div>
            {feed.private && (
              <span className="text-[9px] bg-red-950/60 border border-red-800/60 text-red-400 px-1.5 py-0.5 rounded-full shrink-0">
                Private
              </span>
            )}
          </div>
          <p className="text-xs sm:text-sm text-gray-300 line-clamp-3 leading-relaxed font-medium">
            {feed.content || "No content"}
          </p>
          <div className="flex items-center justify-between text-[10px] text-gray-500 font-mono pt-1 border-t border-gray-800/60">
            <span>{formatLocalDate(feed.post_date)}</span>
            <Compass className="w-3 h-3 text-blue-500/50" />
          </div>
        </div>
      )}

      {/* Hover Overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/60 to-black/30 opacity-0 group-hover:opacity-100 transition-all duration-200 flex flex-col justify-between p-3.5 sm:p-4 text-white backdrop-blur-xs">
        <div className="space-y-1">
          <div className="flex items-center justify-between gap-1.5 text-xs font-bold text-blue-400">
            <div className="flex items-center gap-1.5 truncate">
              <User className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{feed.nickname || feed.uid}</span>
            </div>
            {feed.private && (
              <span className="text-[9px] bg-red-950/80 border border-red-800 text-red-400 px-1.5 py-0.5 rounded-full shrink-0">
                Private
              </span>
            )}
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
        <div className="flex items-center justify-between text-[10px] text-gray-400 font-mono pt-1">
          <span>{formatLocalDate(feed.post_date)}</span>
          <span className="flex items-center gap-1 text-blue-400 font-sans font-semibold text-xs">
            <Eye className="w-3.5 h-3.5" /> 상세보기
          </span>
        </div>
      </div>
    </div>
  );
});

export default function RegionalFeedGridPage() {
  const { token } = useAuth();
  const { loading: authLoading, isAuthenticated } = useRequireAuth();
  const router = useRouter();
  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

  // Region cascading state
  const [sidoList, setSidoList] = useState<SidoItem[]>([]);
  const [sigunguList, setSigunguList] = useState<SigunguItem[]>([]);
  const [emdList, setEmdList] = useState<EmdItem[]>([]);

  const [selectedSido, setSelectedSido] = useState<SidoItem | null>(null);
  const [selectedSigungu, setSelectedSigungu] = useState<SigunguItem | null>(null);
  const [selectedEmd, setSelectedEmd] = useState<EmdItem | null>(null);

  const [loadingSido, setLoadingSido] = useState(false);
  const [loadingSigungu, setLoadingSigungu] = useState(false);
  const [loadingEmd, setLoadingEmd] = useState(false);

  // Search keyword filter
  const [searchQuery, setSearchQuery] = useState("");

  // Feed loading state
  const [rawLocations, setRawLocations] = useState<
    { fid: string; uid: string; location: { lat: number; long: number }; post_date: string }[]
  >([]);
  const [feeds, setFeeds] = useState<FeedItem[]>([]);
  const [loadingFeeds, setLoadingFeeds] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [processedCount, setProcessedCount] = useState(0);

  const rawLocationsRef = useRef<typeof rawLocations>([]);
  const processedCountRef = useRef<number>(0);
  const loadingMoreRef = useRef<boolean>(false);

  rawLocationsRef.current = rawLocations;
  processedCountRef.current = processedCount;
  loadingMoreRef.current = loadingMore;

  // 1. Fetch SIDO list on mount
  useEffect(() => {
    if (!token || !isAuthenticated) return;
    const fetchSido = async () => {
      setLoadingSido(true);
      try {
        const res = await fetch(`${API_URL}/feed/region/sido`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          if (data.result === "success") setSidoList(data.items);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoadingSido(false);
      }
    };
    fetchSido();
  }, [token, isAuthenticated, API_URL]);

  // 2. Fetch SIGUNGU when SIDO changes
  useEffect(() => {
    if (!selectedSido || !token) {
      setSigunguList([]);
      setSelectedSigungu(null);
      setEmdList([]);
      setSelectedEmd(null);
      return;
    }
    const fetchSigungu = async () => {
      setLoadingSigungu(true);
      setSigunguList([]);
      setSelectedSigungu(null);
      setEmdList([]);
      setSelectedEmd(null);
      try {
        const res = await fetch(
          `${API_URL}/feed/region/sigungu?sido_cd=${selectedSido.sido_cd}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (res.ok) {
          const data = await res.json();
          if (data.result === "success") setSigunguList(data.items);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoadingSigungu(false);
      }
    };
    fetchSigungu();
  }, [selectedSido, token, API_URL]);

  // 3. Fetch EMD when SIGUNGU changes
  useEffect(() => {
    if (!selectedSigungu || !token) {
      setEmdList([]);
      setSelectedEmd(null);
      return;
    }
    const fetchEmd = async () => {
      setLoadingEmd(true);
      setEmdList([]);
      setSelectedEmd(null);
      try {
        const res = await fetch(
          `${API_URL}/feed/region/emd?sigungu_cd=${selectedSigungu.sigungu_cd}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (res.ok) {
          const data = await res.json();
          if (data.result === "success") setEmdList(data.items);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoadingEmd(false);
      }
    };
    fetchEmd();
  }, [selectedSigungu, token, API_URL]);

  // Helper to fetch details for a batch of feed locations
  const fetchFeedDetailsBatch = useCallback(
    async (
      batchItems: { fid: string; uid: string; location?: { lat: number; long: number }; post_date: string }[],
      authToken: string
    ): Promise<FeedItem[]> => {
      const promises = batchItems.map((item) =>
        fetchSingleFeedDetailCached(item.fid, authToken, API_URL)
      );
      const results = await Promise.all(promises);
      return results.filter((feed): feed is FeedItem => feed !== null);
    },
    [API_URL]
  );

  // 4. Fetch feeds for selected region or all regions
  const loadFeedsForRegion = useCallback(async () => {
    if (!token) return;
    setLoadingFeeds(true);
    setError(null);

    const activeCode =
      selectedEmd?.emd_cd ??
      selectedSigungu?.sigungu_cd ??
      selectedSido?.sido_cd ??
      "";

    try {
      let fetchedLocations: { fid: string; uid: string; location?: { lat: number; long: number }; post_date: string }[] = [];

      if (activeCode) {
        // Use newly added backend endpoint GET /feed/hjd/get/{code}
        const hjdRes = await fetch(`${API_URL}/feed/hjd/get/${activeCode}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (hjdRes.ok) {
          const hjdData = await hjdRes.json();
          if (hjdData.result === "success" && hjdData.feedid) {
            fetchedLocations = hjdData.feedid;
          }
        }
      } else {
        // Initial state (all regions): query nationwide BBox
        const koreaBBox = {
          SW: { lat: 33.0, long: 124.0 },
          NE: { lat: 38.9, long: 132.0 },
        };
        const feedRes = await fetch(`${API_URL}/feed/get/location?zoom=16`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(koreaBBox),
        });
        if (feedRes.ok) {
          const feedData = await feedRes.json();
          if (feedData.result === "success" && feedData.feeds) {
            fetchedLocations = feedData.feeds;
          }
        }
      }

      // Remove duplicates
      const seenFids = new Set<string>();
      const uniqueList: typeof fetchedLocations = [];
      for (const item of fetchedLocations) {
        if (!seenFids.has(item.fid)) {
          seenFids.add(item.fid);
          uniqueList.push(item);
        }
      }

      // Sort newest first by post_date
      uniqueList.sort(
        (a, b) => new Date(b.post_date).getTime() - new Date(a.post_date).getTime()
      );

      setRawLocations(uniqueList);

      // Lazy load initial batch
      const firstBatch = uniqueList.slice(0, BATCH_SIZE);
      const detailedBatch = await fetchFeedDetailsBatch(firstBatch, token);

      setFeeds(detailedBatch);
      setProcessedCount(firstBatch.length);
    } catch (err) {
      console.error(err);
      setError("피드 데이터를 불러오는데 실패했습니다.");
    } finally {
      setLoadingFeeds(false);
    }
  }, [token, API_URL, fetchFeedDetailsBatch, selectedSido, selectedSigungu, selectedEmd]);

  // Trigger feed load when region selection changes
  useEffect(() => {
    if (token && isAuthenticated) {
      loadFeedsForRegion();
    }
  }, [loadFeedsForRegion, token, isAuthenticated]);

  // Load more feeds for infinite scroll
  const handleLoadMore = useCallback(async () => {
    if (loadingMoreRef.current || !token) return;

    const currentRaw = rawLocationsRef.current;
    const currentCount = processedCountRef.current;

    if (currentCount >= currentRaw.length) return;

    loadingMoreRef.current = true;
    setLoadingMore(true);

    const nextBatchIds = currentRaw.slice(
      currentCount,
      currentCount + BATCH_SIZE
    );

    try {
      const newFeeds = await fetchFeedDetailsBatch(nextBatchIds, token);
      if (newFeeds.length > 0) {
        setFeeds((prev) => {
          const existingIds = new Set(prev.map((f) => f.fid));
          const filtered = newFeeds.filter((f) => !existingIds.has(f.fid));
          return [...prev, ...filtered];
        });
      }
      setProcessedCount(currentCount + nextBatchIds.length);
    } catch (err) {
      console.error(err);
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [token, fetchFeedDetailsBatch]);

  // Window scroll event listener for infinite scrolling
  useEffect(() => {
    const onScroll = () => {
      const scrolled = window.scrollY + window.innerHeight;
      const total = document.documentElement.scrollHeight;
      if (total - scrolled < 400) {
        handleLoadMore();
      }
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [handleLoadMore]);

  // Filter feeds by search query
  const filteredFeeds = useMemo(() => {
    if (!searchQuery.trim()) return feeds;
    const q = searchQuery.toLowerCase();
    return feeds.filter(
      (f) =>
        f.content?.toLowerCase().includes(q) ||
        f.nickname?.toLowerCase().includes(q) ||
        f.uid?.toLowerCase().includes(q)
    );
  }, [feeds, searchQuery]);

  const handleResetRegion = () => {
    setSelectedSido(null);
    setSelectedSigungu(null);
    setSelectedEmd(null);
    setSearchQuery("");
  };

  const regionTitleLabel = [
    selectedSido?.sido_nm,
    selectedSigungu?.sgg_nm,
    selectedEmd?.emd_nm,
  ]
    .filter(Boolean)
    .join(" ") || "전체 지역";

  if (authLoading || !isAuthenticated) {
    return (
      <div className="flex h-[calc(100vh-4rem)] w-full items-center justify-center bg-black text-gray-500 text-sm">
        <Loader2 className="w-6 h-6 text-blue-500 animate-spin mr-2" />
        <span>Loading...</span>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-black text-white p-4 sm:p-6 lg:p-8 pb-24">
      {/* Header Section */}
      <div className="max-w-7xl mx-auto mb-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-800/80 pb-5">
          <div>
            <h1 className="text-2xl sm:text-3xl font-black bg-gradient-to-r from-white via-gray-200 to-gray-400 bg-clip-text text-transparent flex items-center gap-2.5">
              <Grid className="w-7 h-7 text-blue-500" />
              <span>지역별 피드</span>
            </h1>
            <p className="text-xs sm:text-sm text-gray-400 mt-1">
              원하는 행정구역을 선택하여 각 지역의 피드를 모아보세요.
            </p>
          </div>

          {/* Search bar */}
          <div className="relative w-full md:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="내용 또는 작성자 검색..."
              className="w-full bg-gray-900 border border-gray-800 text-white text-xs rounded-xl pl-9 pr-4 py-2.5 focus:outline-none focus:border-blue-500 transition-colors"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Region Cascade Selector Controls */}
        <div className="mt-4 bg-gray-950/80 border border-gray-800/80 rounded-2xl p-4 backdrop-blur-md shadow-xl space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-semibold text-gray-300">
              <Filter className="w-4 h-4 text-blue-400" />
              <span>행정구역 필터</span>
            </div>
            {(selectedSido || searchQuery) && (
              <button
                onClick={handleResetRegion}
                className="flex items-center gap-1 text-xs text-gray-400 hover:text-blue-400 transition-colors cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>필터 초기화</span>
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* SIDO */}
            <div className="relative">
              <select
                value={selectedSido?.sido_cd ?? ""}
                onChange={(e) => {
                  const found = sidoList.find((s) => s.sido_cd === e.target.value);
                  setSelectedSido(found ?? null);
                }}
                disabled={loadingSido}
                className="w-full bg-gray-900 border border-gray-700 text-white text-xs rounded-xl px-3.5 py-2.5 pr-8 appearance-none focus:outline-none focus:border-blue-500 transition-colors disabled:opacity-50 cursor-pointer"
              >
                <option value="">전체 시 · 도</option>
                {sidoList.map((s) => (
                  <option key={s.sido_cd} value={s.sido_cd}>
                    {s.sido_nm}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              {loadingSido && (
                <Loader2 className="absolute right-8 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-blue-400 animate-spin pointer-events-none" />
              )}
            </div>

            {/* SIGUNGU */}
            <div className={`relative transition-opacity ${selectedSido ? "opacity-100" : "opacity-40 pointer-events-none"}`}>
              <select
                value={selectedSigungu?.sigungu_cd ?? ""}
                onChange={(e) => {
                  const found = sigunguList.find((s) => s.sigungu_cd === e.target.value);
                  setSelectedSigungu(found ?? null);
                }}
                disabled={loadingSigungu || !selectedSido}
                className="w-full bg-gray-900 border border-gray-700 text-white text-xs rounded-xl px-3.5 py-2.5 pr-8 appearance-none focus:outline-none focus:border-blue-500 transition-colors disabled:opacity-50 cursor-pointer"
              >
                <option value="">전체 시 · 군 · 구</option>
                {sigunguList.map((s) => (
                  <option key={s.sigungu_cd} value={s.sigungu_cd}>
                    {s.sgg_nm}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              {loadingSigungu && (
                <Loader2 className="absolute right-8 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-blue-400 animate-spin pointer-events-none" />
              )}
            </div>

            {/* EMD */}
            <div className={`relative transition-opacity ${selectedSigungu ? "opacity-100" : "opacity-40 pointer-events-none"}`}>
              <select
                value={selectedEmd?.emd_cd ?? ""}
                onChange={(e) => {
                  const found = emdList.find((s) => s.emd_cd === e.target.value);
                  setSelectedEmd(found ?? null);
                }}
                disabled={loadingEmd || !selectedSigungu}
                className="w-full bg-gray-900 border border-gray-700 text-white text-xs rounded-xl px-3.5 py-2.5 pr-8 appearance-none focus:outline-none focus:border-blue-500 transition-colors disabled:opacity-50 cursor-pointer"
              >
                <option value="">전체 읍 · 면 · 동</option>
                {emdList.map((s) => (
                  <option key={s.emd_cd} value={s.emd_cd}>
                    {s.emd_nm}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              {loadingEmd && (
                <Loader2 className="absolute right-8 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-blue-400 animate-spin pointer-events-none" />
              )}
            </div>
          </div>
        </div>

        {/* Selected Region Status Indicator */}
        <div className="flex items-center justify-between mt-5 px-1">
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-blue-400" />
            <h2 className="text-base font-bold text-white">
              {regionTitleLabel}
            </h2>
            <span className="text-xs text-gray-400 font-mono bg-gray-900 border border-gray-800 px-2.5 py-0.5 rounded-full">
              {filteredFeeds.length} Pings
            </span>
          </div>
        </div>
      </div>

      {/* Main Grid Content */}
      <div className="max-w-7xl mx-auto">
        {loadingFeeds ? (
          <div className="py-24 text-center text-gray-400 flex flex-col items-center justify-center">
            <Loader2 className="w-8 h-8 text-blue-500 animate-spin mb-3" />
            <p className="text-sm font-medium">선택하신 지역의 피드를 불러오는 중입니다...</p>
          </div>
        ) : error ? (
          <div className="bg-red-950/40 border border-red-900/60 rounded-2xl p-8 text-center text-red-300 max-w-md mx-auto my-12 shadow-xl">
            <p className="text-sm font-medium mb-3">{error}</p>
            <button
              onClick={loadFeedsForRegion}
              className="bg-red-600 hover:bg-red-500 text-white text-xs font-semibold px-4 py-2 rounded-xl transition-all shadow-md"
            >
              다시 시도
            </button>
          </div>
        ) : filteredFeeds.length === 0 ? (
          <div className="bg-gray-950/60 border border-gray-800/80 rounded-2xl p-12 text-center text-gray-400 max-w-md mx-auto my-12 shadow-xl space-y-4">
            <div className="w-12 h-12 rounded-full bg-gray-900 border border-gray-800 flex items-center justify-center mx-auto text-gray-500">
              <Compass className="w-6 h-6" />
            </div>
            <div>
              <p className="text-base font-bold text-gray-300">피드가 없습니다</p>
              <p className="text-xs text-gray-500 mt-1">
                {selectedSido
                  ? `${regionTitleLabel}에 아직 등록된 피드가 없습니다. 다른 지역을 선택해보세요.`
                  : "등록된 피드가 없습니다."}
              </p>
            </div>
            {selectedSido && (
              <button
                onClick={handleResetRegion}
                className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold px-4 py-2 rounded-xl transition-all shadow-md cursor-pointer"
              >
                전체 지역 보기
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 sm:gap-4">
              {filteredFeeds.map((feed) => (
                <RegionFeedTile
                  key={feed.fid}
                  feed={feed}
                  onSelect={(f) => router.push(`/feed/${f.fid}`)}
                />
              ))}
            </div>

            {/* Infinite Scroll Loader */}
            {processedCount < rawLocations.length && (
              <div className="py-8 text-center text-xs text-gray-400 flex justify-center items-center gap-2">
                {loadingMore && <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />}
                <span>{loadingMore ? "더 많은 피드를 불러오는 중..." : "스크롤하여 더 보기"}</span>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
