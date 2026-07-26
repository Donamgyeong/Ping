"use client";

import React, { useEffect, useState } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  useMapEvents,
  useMap,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { formatLocalDate } from "@/utils/date";
import { useAuth } from "@/hooks/useAuth";
import { MapPin } from "lucide-react";

const setupLeafletIcons = () => {
  delete (L.Icon.Default.prototype as any)._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconRetinaUrl:
      "https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png",
    iconUrl: "https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png",
    shadowUrl:
      "https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png",
  });
};

const customPingMarkerIcon = L.divIcon({
  className: "custom-ping-marker",
  html: `<div class="relative group cursor-pointer flex items-center justify-center">
    <div class="absolute -inset-1 rounded-full bg-blue-500/40 blur-xs animate-pulse group-hover:bg-blue-400/60 transition-all"></div>
    <div class="w-9 h-9 rounded-full bg-gray-950 border-2 border-blue-500 shadow-xl flex items-center justify-center text-blue-400 group-hover:scale-110 group-hover:border-white transition-all">
      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/>
        <circle cx="12" cy="10" r="3"/>
      </svg>
    </div>
  </div>`,
  iconSize: [36, 36],
  iconAnchor: [18, 36],
  popupAnchor: [0, -36],
});

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

interface MapProps {
  location: {
    latitude: number;
    longitude: number;
  };
  feeds: FeedItem[];
  selectedFeed: FeedItem | null;
  onMapMoveEnd: (location: { latitude: number; longitude: number }) => void;
}

// Map movement listener
const MapEvents = ({
  onMoveEnd,
}: {
  onMoveEnd: (center: L.LatLng) => void;
}) => {
  useMapEvents({
    moveend: (e) => {
      onMoveEnd(e.target.getCenter());
    },
  });
  return null;
};

// Map flyTo updater when selectedFeed changes
const MapUpdater = ({
  selectedFeed,
}: {
  selectedFeed: FeedItem | null;
}) => {
  const map = useMap();
  useEffect(() => {
    if (selectedFeed) {
      map.flyTo(
        [selectedFeed.location.lat, selectedFeed.location.long],
        map.getZoom()
      );
    }
  }, [selectedFeed, map]);
  return null;
};

// Sub-component for individual feed marker with hover image thumbnail popup
const FeedMarker = ({ feed }: { feed: FeedItem }) => {
  const { token } = useAuth();
  const [currentFeed, setCurrentFeed] = useState<FeedItem>(feed);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [loadingImage, setLoadingImage] = useState(false);
  const [fetchAttempted, setFetchAttempted] = useState(false);
  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

  useEffect(() => {
    setCurrentFeed(feed);
  }, [feed]);

  const handleHover = React.useCallback(async () => {
    if (fetchAttempted || !token) return;
    setFetchAttempted(true);

    let targetFeed = currentFeed;

    // If detail content is empty, fetch feed detail first
    if (!targetFeed.content) {
      try {
        const response = await fetch(`${API_URL}/feed/get/${feed.fid}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (response.ok) {
          const data = await response.json();
          if (data.result === "success" && data.feed) {
            targetFeed = data.feed;
            try {
              const userRes = await fetch(
                `${API_URL}/user/profile/${targetFeed.uid}`,
                {
                  headers: { Authorization: `Bearer ${token}` },
                }
              );
              if (userRes.ok) {
                const userData = await userRes.json();
                targetFeed.nickname = userData.nickname;
              }
            } catch (e) {
              // Ignore profile fetch error
            }
            setCurrentFeed(targetFeed);
          }
        }
      } catch (err) {
        console.error("Failed to load marker feed detail on hover:", err);
      }
    }

    // Fetch image if present
    if (targetFeed.images && targetFeed.images.length > 0 && !imageUrl) {
      setLoadingImage(true);
      try {
        const response = await fetch(
          `${API_URL}/file/get/${targetFeed.images[0]}`,
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );
        if (response.ok) {
          const blob = await response.blob();
          const objectUrl = URL.createObjectURL(blob);
          setImageUrl(objectUrl);
        }
      } catch (err) {
        console.error("Failed to load marker popup image:", err);
      } finally {
        setLoadingImage(false);
      }
    }
  }, [fetchAttempted, currentFeed, feed.fid, token, API_URL, imageUrl]);

  useEffect(() => {
    return () => {
      if (imageUrl) {
        URL.revokeObjectURL(imageUrl);
      }
    };
  }, [imageUrl]);

  return (
    <Marker
      icon={customPingMarkerIcon}
      position={[currentFeed.location.lat, currentFeed.location.long]}
      eventHandlers={{
        mouseover: (e) => {
          handleHover();
          e.target.openPopup();
        },
      }}
    >
      <Popup className="custom-dark-popup">
        <div className="p-1 min-w-[170px] max-w-[220px]">
          {currentFeed.images && currentFeed.images.length > 0 ? (
            <div className="w-full h-32 mb-2.5 overflow-hidden rounded-xl bg-black border border-gray-800 shadow-inner flex items-center justify-center relative">
              {imageUrl ? (
                <img
                  src={imageUrl}
                  alt="Feed Thumbnail"
                  className="w-full h-full object-cover"
                />
              ) : loadingImage ? (
                <div className="flex flex-col items-center gap-1.5 text-xs text-gray-400">
                  <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                  <span className="text-[10px]">Loading image...</span>
                </div>
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-600">
                  <MapPin className="w-5 h-5 text-blue-500/60" />
                </div>
              )}
            </div>
          ) : (
            <div className="w-full h-14 mb-2 rounded-xl bg-black border border-gray-800 flex items-center justify-center text-gray-600">
              <MapPin className="w-5 h-5 text-blue-500/60" />
            </div>
          )}
          <div className="space-y-1">
            <p className="font-bold text-xs text-white truncate">
              {currentFeed.nickname || currentFeed.uid}
            </p>
            <p className="text-xs text-gray-300 leading-relaxed line-clamp-2">
              {currentFeed.content || "Loading ping..."}
            </p>
            <p className="text-[10px] text-gray-500 pt-0.5">
              {formatLocalDate(currentFeed.post_date)}
            </p>
          </div>
        </div>
      </Popup>
    </Marker>
  );
};

const MapContent = ({
  feeds,
  selectedFeed,
  onMapMoveEnd,
}: Omit<MapProps, "location">) => {
  const handleMoveEnd = (center: L.LatLng) => {
    onMapMoveEnd({ latitude: center.lat, longitude: center.lng });
  };

  return (
    <>
      <MapUpdater selectedFeed={selectedFeed} />
      <MapEvents onMoveEnd={handleMoveEnd} />
      {feeds.map((feed) => (
        <FeedMarker key={feed.fid} feed={feed} />
      ))}
    </>
  );
};

const MemoizedMap = React.memo(Map, (prevProps, nextProps) => {
  const feedsAreEqual =
    prevProps.feeds.length === nextProps.feeds.length &&
    JSON.stringify(prevProps.feeds) === JSON.stringify(nextProps.feeds);
  const selectedFeedIsEqual =
    prevProps.selectedFeed?.fid === nextProps.selectedFeed?.fid;

  return feedsAreEqual && selectedFeedIsEqual;
});

MemoizedMap.displayName = "Map";

export default MemoizedMap;

function Map({ location, feeds, selectedFeed, onMapMoveEnd }: MapProps) {
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
    setupLeafletIcons();
  }, []);

  if (!isClient) {
    return null;
  }

  return (
    <MapContainer
      center={[location.latitude, location.longitude]}
      zoom={13}
      scrollWheelZoom={true}
      className="absolute inset-0"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <MapContent
        feeds={feeds}
        selectedFeed={selectedFeed}
        onMapMoveEnd={onMapMoveEnd}
      />
    </MapContainer>
  );
}
