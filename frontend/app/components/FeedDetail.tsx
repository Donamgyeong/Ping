"use client";
import { useState, useEffect } from "react";
import Link from "next/link";

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

interface FeedDetailProps {
  feed: FeedItem;
  onBack: () => void;
  token: string | null;
}

export default function FeedDetail({ feed, onBack, token }: FeedDetailProps) {
  const API_URL = process.env.API_URL || "http://localhost:8000";
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  const goToPrevious = () => {
    const isFirstImage = currentImageIndex === 0;
    const newIndex = isFirstImage ? imageUrls.length - 1 : currentImageIndex - 1;
    setCurrentImageIndex(newIndex);
  };

  const goToNext = () => {
    const isLastImage = currentImageIndex === imageUrls.length - 1;
    const newIndex = isLastImage ? 0 : currentImageIndex + 1;
    setCurrentImageIndex(newIndex);
  };

  useEffect(() => {
    const fetchImageUrls = async () => {
      if (feed.images && feed.images.length > 0 && token) {
        const urls = await Promise.all(
          feed.images.map(async (imageId) => {
            try {
              const response = await fetch(`${API_URL}/file/get/${imageId}`, {
                headers: {
                  Authorization: `Bearer ${token}`,
                },
              });
              if (!response.ok) {
                console.error(`Failed to fetch image: ${imageId}`);
                return "";
              }
              const blob = await response.blob();
              return URL.createObjectURL(blob);
            } catch (error) {
              console.error(`Error fetching image ${imageId}:`, error);
              return "";
            }
          })
        );
        setImageUrls(urls.filter(url => url !== ""));
        setCurrentImageIndex(0); // Reset index when images are loaded
      }
    };

    fetchImageUrls();

    // Cleanup object URLs on component unmount
    return () => {
      imageUrls.forEach(url => URL.revokeObjectURL(url));
    };
  }, [feed.images, token]);
  return (
    <div className="h-full overflow-y-auto bg-black m-3">
      <button onClick={onBack} className="mb-4 text-blue-400 hover:text-blue-300">
        &larr; Back to list
      </button>
      <div className="flex items-center mb-4">
        <div className="w-10 h-10 rounded-full bg-gray-300 mr-3"></div>
        <div>
          <Link href={`/user/profile/${feed.uid}`}>
            <p className="font-semibold text-white hover:underline cursor-pointer">{feed.nickname || feed.uid}</p>
          </Link>
          <p className="text-xs text-gray-400">
            {new Date(feed.post_date).toLocaleString()}
          </p>
        </div>
      </div>

      {imageUrls.length > 0 && (
        <div className="relative w-full mb-4 flex justify-center items-center">
          {imageUrls.length > 1 && (
            <button onClick={goToPrevious} className="absolute left-0 z-10 bg-black bg-opacity-50 text-white p-2 rounded-full">
              &#10094;
            </button>
          )}
          <img 
            src={imageUrls[currentImageIndex]} 
            alt={`feed-image-${currentImageIndex}`} 
            className="max-w-full h-auto rounded-md" 
          />
          {imageUrls.length > 1 && (
            <button onClick={goToNext} className="absolute right-0 z-10 bg-black bg-opacity-50 text-white p-2 rounded-full">
              &#10095;
            </button>
          )}
        </div>
      )}

      <p className="mb-4">{feed.content}</p>
    </div>
  );
}