"use client";

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import dynamic from 'next/dynamic';
import EXIF from 'exif-js'; // Assuming exif-js is installed

const LocationPicker = dynamic(() => import('@/app/components/LocationPicker'), {
    ssr: false,
    loading: () => <p>Loading map...</p>,
});

// Helper function to convert EXIF GPS data to decimal degrees
function convertDMSToDD(dms: number[], direction: string) {
    let dd = dms[0] + dms[1] / 60 + dms[2] / 3600;
    if (direction === 'S' || direction === 'W') {
        dd = dd * -1;
    }
    return dd;
}

export default function NewFeedPage() {
    const { token, loading: authLoading } = useAuth();
    const router = useRouter();
    const [content, setContent] = useState('');
    const [isPrivate, setIsPrivate] = useState(false);
    const [files, setFiles] = useState<File[]>([]);
    const [imagePreviews, setImagePreviews] = useState<string[]>([]);
    const [location, setLocation] = useState<{ lat: number; long: number } | null>(null);
    const [initialMapCenter, setInitialMapCenter] = useState<{ lat: number; lng: number } | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [submitLoading, setSubmitLoading] = useState(false);
    const [isDragging, setIsDragging] = useState(false);

    const API_URL = process.env.API_URL || "http://localhost:8000";

    useEffect(() => {
        if (!authLoading) {
            if (!token) {
                router.push('/user/login');
            } else {
                navigator.geolocation.getCurrentPosition(
                    (position) => {
                        const { latitude, longitude } = position.coords;
                        if (!location) { // Only set initial location if not already set by EXIF
                            setInitialMapCenter({ lat: latitude, lng: longitude });
                            setLocation({ lat: latitude, long: longitude });
                        }
                    },
                    (err) => {
                        setError('Please enable location services to use the map.');
                        if (!location) { // Only set fallback if not already set by EXIF
                            setInitialMapCenter({ lat: 51.505, lng: -0.09 });
                            setLocation({ lat: 51.505, long: -0.09 });
                        }
                    }
                );
            }
        }
    }, [token, router, authLoading, location]); // Added location to dependencies

    const handleFileChange = useCallback((selectedFiles: FileList | null) => {
        if (selectedFiles) {
            const newFiles = Array.from(selectedFiles);
            setFiles(prevFiles => [...prevFiles, ...newFiles]);

            let locationSetFromExif = false;

            newFiles.forEach(file => {
                const reader = new FileReader();
                reader.onloadend = () => {
                    setImagePreviews(prevPreviews => [...prevPreviews, reader.result as string]);

                    if (file.type.startsWith('image/') && !locationSetFromExif) {
                        EXIF.getData(file, function(this: any) { // Use 'this' with any type for EXIF context
                            const lat = EXIF.getTag(this, 'GPSLatitude');
                            const latRef = EXIF.getTag(this, 'GPSLatitudeRef');
                            const long = EXIF.getTag(this, 'GPSLongitude');
                            const longRef = EXIF.getTag(this, 'GPSLongitudeRef');

                            if (lat && latRef && long && longRef) {
                                const decimalLat = convertDMSToDD(lat, latRef);
                                const decimalLong = convertDMSToDD(long, longRef);

                                setLocation({ lat: decimalLat, long: decimalLong });
                                setInitialMapCenter({ lat: decimalLat, lng: decimalLong });
                                locationSetFromExif = true; // Prevent further EXIF location updates for this batch
                            }
                        });
                    }
                };
                reader.readAsDataURL(file);
            });
        }
    }, [location]); // Added location to dependencies for handleFileChange

    const removeImage = (index: number) => {
        setFiles(prevFiles => prevFiles.filter((_, i) => i !== index));
        setImagePreviews(prevPreviews => prevPreviews.filter((_, i) => i !== index));
    };

    const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        setIsDragging(false);
    };

    const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        setIsDragging(false);
        handleFileChange(e.dataTransfer.files);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!content || !location) {
            setError('Content and location are required. Please select a location on the map.');
            return;
        }
        setSubmitLoading(true);
        setError(null);

        try {
            const imageIds: string[] = [];
            if (files.length > 0) {
                for (const file of files) {
                    const formData = new FormData();
                    formData.append('file', file);
                    formData.append('private', String(isPrivate));

                    const response = await fetch(`${API_URL}/file/upload`, {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${token}`,
                        },
                        body: formData,
                    });

                    if (!response.ok) {
                        throw new Error('Image upload failed.');
                    }
                    const data = await response.json();
                    if (data.result === 'success' && data.id) {
                        imageIds.push(data.id);
                    }
                }
            }

            const feedData = {
                content,
                location,
                images: imageIds,
                private: isPrivate,
            };

            const feedResponse = await fetch(`${API_URL}/feed/new`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                },
                body: JSON.stringify(feedData),
            });

            if (!feedResponse.ok) {
                const errorData = await feedResponse.json();
                throw new Error(errorData.detail || 'Failed to create feed.');
            }

            const feedResult = await feedResponse.json();
            if (feedResult.result === 'success') {
                router.push('/');
            } else {
                throw new Error('Failed to create feed.');
            }

        } catch (err: any) {
            setError(err.message);
        } finally {
            setSubmitLoading(false);
        }
    };

    if (authLoading || !initialMapCenter) {
        return <div className="max-w-xl mx-auto p-4">Loading...</div>;
    }

    if (!token) {
        return null;
    }

    return (
        <div className="max-w-xl mx-auto p-4">
            <h1 className="text-3xl font-bold mb-6">Create New Ping</h1>
            <form onSubmit={handleSubmit} className="space-y-6">
                <div>
                    <label htmlFor="content" className="block text-sm font-medium text-gray-300">
                        What's on your mind?
                    </label>
                    <textarea
                        id="content"
                        rows={4}
                        value={content}
                        onChange={(e) => setContent(e.target.value)}
                        className="mt-1 block w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-md text-white focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                        required
                    />
                </div>
                 <div>
                    <label className="block text-sm font-medium text-gray-300">
                        Select Location
                    </label>
                    <LocationPicker
                        initialCenter={initialMapCenter}
                        onLocationSelect={setLocation}
                    />
                </div>
                <div>
                    <label htmlFor="images" className="block text-sm font-medium text-gray-300">
                        Images
                    </label>
                    <div
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                        className={`mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-600 border-dashed rounded-md ${isDragging ? 'bg-gray-700' : ''}`}
                    >
                        <div className="space-y-1 text-center">
                            <svg className="mx-auto h-12 w-12 text-gray-400" stroke="currentColor" fill="none" viewBox="0 0 48 48" aria-hidden="true">
                                <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                            <div className="flex text-sm text-gray-400">
                                <label htmlFor="file-upload" className="relative cursor-pointer bg-gray-800 rounded-md font-medium text-blue-400 hover:text-blue-500 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-offset-gray-800 focus-within:ring-blue-500">
                                    <span>Upload a file</span>
                                    <input id="file-upload" name="file-upload" type="file" className="sr-only" multiple accept="image/*" onChange={(e) => handleFileChange(e.target.files)} />
                                </label>
                                <p className="pl-1">or drag and drop</p>
                            </div>
                            <p className="text-xs text-gray-500">PNG, JPG, GIF up to 10MB</p>
                        </div>
                    </div>
                </div>
                {imagePreviews.length > 0 && (
                    <div className="grid grid-cols-3 gap-4">
                        {imagePreviews.map((preview, index) => (
                            <div key={index} className="relative">
                                <img src={preview} alt={`Preview ${index}`} className="h-24 w-full object-cover rounded-md" />
                                <button
                                    type="button"
                                    onClick={() => removeImage(index)}
                                    className="absolute top-0 right-0 p-1 bg-red-600 rounded-full text-white text-xs"
                                >
                                    &times;
                                </button>
                            </div>
                        ))}
                    </div>
                )}
                <div className="flex items-center">
                    <input
                        id="private"
                        type="checkbox"
                        checked={isPrivate}
                        onChange={(e) => setIsPrivate(e.target.checked)}
                        className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <label htmlFor="private" className="ml-2 block text-sm text-gray-300">
                        Make this ping private
                    </label>
                </div>
                {error && <p className="text-red-500 text-sm">{error}</p>}
                <button
                    type="submit"
                    className="w-full px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:bg-gray-500"
                    disabled={submitLoading || !content || !location || files.length === 0}
                >
                    {submitLoading ? 'Pinging...' : 'Ping'}
                </button>
            </form>
        </div>
    );
}

