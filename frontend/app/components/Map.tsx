'use client';

import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
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

interface MapProps {
  location: {
    latitude: number;
    longitude: number;
  };
  feeds: FeedItem[];
}

const Map = ({ location, feeds }: MapProps) => {
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
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <Marker position={[location.latitude, location.longitude]}>
        <Popup>
          You are here! <br /> Lat: {location.latitude.toFixed(4)}, Lng: {location.longitude.toFixed(4)}
        </Popup>
      </Marker>

      {feeds.map((feed) => (
        <Marker key={feed.fid} position={[feed.location.lat, feed.location.long]}>
          <Popup>
            <strong>{feed.content}</strong> <br /> by {feed.uid} <br /> Posted: {new Date(feed.post_date).toLocaleString()}
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
};

export default Map;
