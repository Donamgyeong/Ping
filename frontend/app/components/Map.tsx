'use client';

import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMapEvents, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// It's better to handle this kind of setup within a useEffect or a specific setup function
// to ensure it only runs on the client-side.
const setupLeafletIcons = () => {
    delete (L.Icon.Default.prototype as any)._getIconUrl;
    L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png',
        iconUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
    });
};

// 지도 이동 이벤트를 처리하는 컴포넌트
const MapEvents = ({ onMoveEnd }: { onMoveEnd: (center: L.LatLng) => void }) => {
  useMapEvents({
    moveend: (e) => {
      onMoveEnd(e.target.getCenter());
    },
  });
  return null;
};


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

// 지도의 뷰(중심, 확대/축소 레벨)를 업데이트하는 컴포넌트
const MapUpdater = ({ center, selectedFeed }: { center: [number, number], selectedFeed: FeedItem | null }) => {
    const map = useMap();
    useEffect(() => {
        // selectedFeed가 변경되면 해당 위치로 지도를 부드럽게 이동시킵니다.
        if (selectedFeed) {
            map.flyTo([selectedFeed.location.lat, selectedFeed.location.long], map.getZoom());
        }
    }, [selectedFeed, map]);
    return null;
};

const MapContent = ({ feeds, selectedFeed, onMapMoveEnd }: Omit<MapProps, 'location'>) => {
  const handleMoveEnd = (center: L.LatLng) => {
    onMapMoveEnd({ latitude: center.lat, longitude: center.lng });
  };
  return (
    <>
      <MapUpdater center={[0,0]} selectedFeed={selectedFeed} />
      <MapEvents onMoveEnd={handleMoveEnd} />
      {feeds.map((feed) => (
        <Marker key={feed.fid} position={[feed.location.lat, feed.location.long]}>
          <Popup>
            <strong>{feed.content}</strong> <br /> by {feed.nickname || feed.uid} <br /> Posted: {new Date(feed.post_date).toLocaleString()}
          </Popup>
        </Marker>
      ))}
    </>
  );
};

const MemoizedMap = React.memo(Map, (prevProps, nextProps) => {
  // feeds나 selectedFeed가 변경되었을 때만 리렌더링을 허용합니다.
  // location과 onMapMoveEnd의 변경은 무시하여 지도 리렌더링을 방지합니다.
  const feedsAreEqual = prevProps.feeds.length === nextProps.feeds.length &&
                        JSON.stringify(prevProps.feeds) === JSON.stringify(nextProps.feeds);
  const selectedFeedIsEqual = prevProps.selectedFeed?.fid === nextProps.selectedFeed?.fid;

  return feedsAreEqual && selectedFeedIsEqual;
});

MemoizedMap.displayName = 'Map';

export default MemoizedMap;
function Map({ location, feeds, selectedFeed, onMapMoveEnd }: MapProps) {
    const [isClient, setIsClient] = useState(false);

    useEffect(() => {
        setIsClient(true);
        setupLeafletIcons();
    }, []);

    if (!isClient) {
        return null; // Or a loading spinner
    }

  return (
    <MapContainer center={[location.latitude, location.longitude]} zoom={13} scrollWheelZoom={true} className="absolute inset-0">
      <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      <MapContent feeds={feeds} selectedFeed={selectedFeed} onMapMoveEnd={onMapMoveEnd} />
    </MapContainer>
  );
}
