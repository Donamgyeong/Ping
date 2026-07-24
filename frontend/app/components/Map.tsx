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
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

  useEffect(() => {
    let isMounted = true;
    let objectUrl: string | null = null;

    if (feed.images && feed.images.length > 0 && token) {
      fetch(`${API_URL}/file/get/${feed.images[0]}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((res) => {
          if (!res.ok) return null;
          return res.blob();
        })
        .then((blob) => {
          if (!blob || !isMounted) return;
          objectUrl = URL.createObjectURL(blob);
          setImageUrl(objectUrl);
        })
        .catch((err) => {
          console.error("Failed to load marker popup image:", err);
        });
    }

    return () => {
      isMounted = false;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [feed.images, token, API_URL]);

  return (
    <Marker
      icon={customPingMarkerIcon}
      position={[feed.location.lat, feed.location.long]}
      eventHandlers={{
        mouseover: (e) => {
          e.target.openPopup();
        },
      }}
    >
      <Popup className="custom-dark-popup">
        <div className="p-1 min-w-[170px] max-w-[220px]">
          {imageUrl ? (
            <div className="w-full h-32 mb-2.5 overflow-hidden rounded-xl bg-black border border-gray-800 shadow-inner">
              <img
                src={imageUrl}
                alt="Feed Thumbnail"
                className="w-full h-full object-cover"
              />
            </div>
          ) : (
            <div className="w-full h-14 mb-2 rounded-xl bg-black border border-gray-800 flex items-center justify-center text-gray-600">
              <MapPin className="w-5 h-5 text-blue-500/60" />
            </div>
          )}
          <div className="space-y-1">
            <p className="font-bold text-xs text-white truncate">
              {feed.nickname || feed.uid}
            </p>
            <p className="text-xs text-gray-300 leading-relaxed line-clamp-2">
              {feed.content}
            </p>
            <p className="text-[10px] text-gray-500 pt-0.5">
              {formatLocalDate(feed.post_date)}
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
