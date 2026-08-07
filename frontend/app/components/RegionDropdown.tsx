"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { ChevronDown, MapPin, Loader2, X, Navigation } from "lucide-react";

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

interface RegionDropdownProps {
  /** Called when the user confirms a region selection with its centroid lat/lng */
  onRegionSelect: (lat: number, lng: number, label: string) => void;
}

export default function RegionDropdown({ onRegionSelect }: RegionDropdownProps) {
  const { token } = useAuth();
  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

  const [isOpen, setIsOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const [sidoList, setSidoList] = useState<SidoItem[]>([]);
  const [sigunguList, setSigunguList] = useState<SigunguItem[]>([]);
  const [emdList, setEmdList] = useState<EmdItem[]>([]);

  const [selectedSido, setSelectedSido] = useState<SidoItem | null>(null);
  const [selectedSigungu, setSelectedSigungu] = useState<SigunguItem | null>(null);
  const [selectedEmd, setSelectedEmd] = useState<EmdItem | null>(null);

  const [loadingSido, setLoadingSido] = useState(false);
  const [loadingSigungu, setLoadingSigungu] = useState(false);
  const [loadingEmd, setLoadingEmd] = useState(false);
  const [loadingCentroid, setLoadingCentroid] = useState(false);

  // Close panel when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Fetch SIDO list when panel opens
  useEffect(() => {
    if (!isOpen || sidoList.length > 0 || !token) return;

    const fetchSido = async () => {
      setLoadingSido(true);
      try {
        const res = await fetch(`${API_URL}/feed/region/sido`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error("Failed to fetch sido");
        const data = await res.json();
        if (data.result === "success") setSidoList(data.items);
      } catch (err) {
        console.error(err);
      } finally {
        setLoadingSido(false);
      }
    };

    fetchSido();
  }, [isOpen, token, API_URL, sidoList.length]);

  // Fetch SIGUNGU when SIDO changes
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
        if (!res.ok) throw new Error("Failed to fetch sigungu");
        const data = await res.json();
        if (data.result === "success") setSigunguList(data.items);
      } catch (err) {
        console.error(err);
      } finally {
        setLoadingSigungu(false);
      }
    };

    fetchSigungu();
  }, [selectedSido, token, API_URL]);

  // Fetch EMD when SIGUNGU changes
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
        if (!res.ok) throw new Error("Failed to fetch emd");
        const data = await res.json();
        if (data.result === "success") setEmdList(data.items);
      } catch (err) {
        console.error(err);
      } finally {
        setLoadingEmd(false);
      }
    };

    fetchEmd();
  }, [selectedSigungu, token, API_URL]);

  const handleGoToRegion = useCallback(async () => {
    if (!token) return;

    // Determine the most specific code selected
    const code =
      selectedEmd?.emd_cd ??
      selectedSigungu?.sigungu_cd ??
      selectedSido?.sido_cd;

    if (!code) return;

    const label = [
      selectedSido?.sido_nm,
      selectedSigungu?.sgg_nm,
      selectedEmd?.emd_nm,
    ]
      .filter(Boolean)
      .join(" ");

    setLoadingCentroid(true);
    try {
      const res = await fetch(
        `${API_URL}/feed/region/centroid?emd_cd=${code}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        console.error(`[RegionDropdown] centroid failed: HTTP ${res.status}`, body);
        throw new Error(`HTTP ${res.status}: ${body}`);
      }
      const data = await res.json();
      if (data.result === "success") {
        onRegionSelect(data.lat, data.lng, label);
        setIsOpen(false);
      } else {
        console.error("[RegionDropdown] centroid result not success:", data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingCentroid(false);
    }
  }, [token, API_URL, selectedSido, selectedSigungu, selectedEmd, onRegionSelect]);

  const handleReset = () => {
    setSelectedSido(null);
    setSelectedSigungu(null);
    setSelectedEmd(null);
    setSigunguList([]);
    setEmdList([]);
  };

  const currentLabel = [
    selectedSido?.sido_nm,
    selectedSigungu?.sgg_nm,
    selectedEmd?.emd_nm,
  ]
    .filter(Boolean)
    .join(" › ");

  const canGo = !!selectedSido;

  return (
    <div ref={panelRef} className="relative z-[1002]">
      {/* Trigger Button */}
      <button
        onClick={() => setIsOpen((v) => !v)}
        className="flex items-center gap-1.5 bg-gray-900/95 hover:bg-gray-800 border border-gray-700 text-white text-xs font-medium px-3 py-2 rounded-xl shadow-xl backdrop-blur-md transition-all"
        title="행정구역으로 이동"
      >
        <MapPin className="w-3.5 h-3.5 text-blue-400 shrink-0" />
        <span className="max-w-[120px] truncate">
          {currentLabel || "지역 검색"}
        </span>
        <ChevronDown
          className={`w-3 h-3 text-gray-400 transition-transform duration-200 ${
            isOpen ? "rotate-180" : ""
          }`}
        />
      </button>

      {/* Dropdown Panel */}
      {isOpen && (
        <div className="absolute top-full left-0 mt-2 w-72 bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800 bg-gray-950/80">
            <span className="text-xs font-semibold text-white">행정구역 이동</span>
            {currentLabel && (
              <button
                onClick={handleReset}
                className="text-gray-500 hover:text-gray-300 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="p-3 space-y-2.5">
            {/* SIDO Dropdown */}
            <div>
              <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">
                시 · 도
              </label>
              <div className="relative">
                <select
                  value={selectedSido?.sido_cd ?? ""}
                  onChange={(e) => {
                    const found = sidoList.find((s) => s.sido_cd === e.target.value);
                    setSelectedSido(found ?? null);
                  }}
                  disabled={loadingSido}
                  className="w-full bg-gray-800 border border-gray-700 text-white text-xs rounded-lg px-3 py-2 pr-8 appearance-none focus:outline-none focus:border-blue-500 transition-colors disabled:opacity-50 cursor-pointer"
                >
                  <option value="">
                    {loadingSido ? "불러오는 중..." : "시/도 선택"}
                  </option>
                  {sidoList.map((s) => (
                    <option key={s.sido_cd} value={s.sido_cd}>
                      {s.sido_nm}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                {loadingSido && (
                  <Loader2 className="absolute right-7 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-blue-400 animate-spin pointer-events-none" />
                )}
              </div>
            </div>

            {/* SIGUNGU Dropdown */}
            <div className={`transition-opacity duration-200 ${selectedSido ? "opacity-100" : "opacity-40 pointer-events-none"}`}>
              <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">
                시 · 군 · 구
              </label>
              <div className="relative">
                <select
                  value={selectedSigungu?.sigungu_cd ?? ""}
                  onChange={(e) => {
                    const found = sigunguList.find(
                      (s) => s.sigungu_cd === e.target.value
                    );
                    setSelectedSigungu(found ?? null);
                  }}
                  disabled={loadingSigungu || !selectedSido}
                  className="w-full bg-gray-800 border border-gray-700 text-white text-xs rounded-lg px-3 py-2 pr-8 appearance-none focus:outline-none focus:border-blue-500 transition-colors disabled:opacity-50 cursor-pointer"
                >
                  <option value="">
                    {loadingSigungu ? "불러오는 중..." : "시/군/구 선택 (선택)"}
                  </option>
                  {sigunguList.map((s) => (
                    <option key={s.sigungu_cd} value={s.sigungu_cd}>
                      {s.sgg_nm}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                {loadingSigungu && (
                  <Loader2 className="absolute right-7 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-blue-400 animate-spin pointer-events-none" />
                )}
              </div>
            </div>

            {/* EMD Dropdown */}
            <div className={`transition-opacity duration-200 ${selectedSigungu ? "opacity-100" : "opacity-40 pointer-events-none"}`}>
              <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">
                읍 · 면 · 동
              </label>
              <div className="relative">
                <select
                  value={selectedEmd?.emd_cd ?? ""}
                  onChange={(e) => {
                    const found = emdList.find((s) => s.emd_cd === e.target.value);
                    setSelectedEmd(found ?? null);
                  }}
                  disabled={loadingEmd || !selectedSigungu}
                  className="w-full bg-gray-800 border border-gray-700 text-white text-xs rounded-lg px-3 py-2 pr-8 appearance-none focus:outline-none focus:border-blue-500 transition-colors disabled:opacity-50 cursor-pointer"
                >
                  <option value="">
                    {loadingEmd ? "불러오는 중..." : "읍/면/동 선택 (선택)"}
                  </option>
                  {emdList.map((s) => (
                    <option key={s.emd_cd} value={s.emd_cd}>
                      {s.emd_nm}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                {loadingEmd && (
                  <Loader2 className="absolute right-7 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-blue-400 animate-spin pointer-events-none" />
                )}
              </div>
            </div>

            {/* Go Button */}
            <button
              onClick={handleGoToRegion}
              disabled={!canGo || loadingCentroid}
              className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-semibold py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 transition-all shadow-md shadow-blue-600/20 mt-1"
            >
              {loadingCentroid ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Navigation className="w-4 h-4" />
              )}
              <span>
                {loadingCentroid
                  ? "이동 중..."
                  : currentLabel
                  ? `${currentLabel} 으로 이동`
                  : "이동"}
              </span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
