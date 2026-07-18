'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Setup Leaflet icons
const setupLeafletIcons = () => {
    delete (L.Icon.Default.prototype as any)._getIconUrl;
    L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png',
        iconUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
    });
};

interface LocationPickerProps {
    onLocationSelect: (location: { lat: number; long: number }) => void;
    initialCenter: { lat: number; lng: number };
}

// Component to handle map view changes
const MapUpdater = ({ position }: { position: [number, number] }) => {
    const map = useMap();
    useEffect(() => {
        if (position) {
            map.setView(position, map.getZoom());
        }
    }, [position, map]);
    return null;
}

const LocationPicker = ({ onLocationSelect, initialCenter }: LocationPickerProps) => {
    const [isClient, setIsClient] = useState(false);
    const [markerPosition, setMarkerPosition] = useState<[number, number]>([initialCenter.lat, initialCenter.lng]);
    const markerRef = useRef<L.Marker | null>(null);

    useEffect(() => {
        setIsClient(true);
        setupLeafletIcons();
        if(initialCenter) {
            const newPos: [number, number] = [initialCenter.lat, initialCenter.lng];
            setMarkerPosition(newPos);
            onLocationSelect({ lat: newPos[0], long: newPos[1] });
        }
    }, [initialCenter, onLocationSelect]);


    const MapEvents = () => {
        useMapEvents({
            click(e) {
                const { lat, lng } = e.latlng;
                const newPos: [number, number] = [lat, lng];
                setMarkerPosition(newPos);
                onLocationSelect({ lat, long: lng });
            },
        });
        return null;
    };
    
    const eventHandlers = useMemo(
        () => ({
            dragend() {
                const marker = markerRef.current;
                if (marker != null) {
                    const { lat, lng } = marker.getLatLng();
                    const newPos: [number, number] = [lat, lng];
                    setMarkerPosition(newPos);
                    onLocationSelect({ lat: lat, long: lng });
                }
            },
        }),
        [onLocationSelect],
    );

    if (!isClient) {
        return <p>Loading map...</p>;
    }

    return (
        <div style={{ height: '300px', width: '100%' }}>
            <MapContainer center={[initialCenter.lat, initialCenter.lng]} zoom={13} scrollWheelZoom={true} style={{ height: '100%', width: '100%' }}>
                <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <Marker
                    draggable={true}
                    eventHandlers={eventHandlers}
                    position={markerPosition}
                    ref={markerRef}
                >
                </Marker>
                <MapEvents />
                {markerPosition && <MapUpdater position={markerPosition} />}
            </MapContainer>
        </div>
    );
};

export default LocationPicker;
