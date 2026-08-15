"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import dynamic from "next/dynamic";
import exifr from "exifr";
import { processImageFiles } from "@/utils/heic";
import { PlusCircle, Upload, X, ArrowLeft, Lock, Globe } from "lucide-react";

const LocationPicker = dynamic(
  () => import("@/app/components/LocationPicker"),
  {
    ssr: false,
    loading: () => <p className="text-xs text-gray-500">Loading map...</p>,
  }
);

export default function NewFeedPage() {
  const { token, loading: authLoading } = useAuth();
  const router = useRouter();
  const [content, setContent] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [location, setLocation] = useState<{ lat: number; long: number } | null>(
    null
  );
  const [initialMapCenter, setInitialMapCenter] = useState<{
    lat: number;
    lng: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isConverting, setIsConverting] = useState(false);

  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

  useEffect(() => {
    if (!authLoading) {
      if (!token) {
        router.push("/user/login");
      } else {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            const { latitude, longitude } = position.coords;
            if (!location) {
              setInitialMapCenter({ lat: latitude, lng: longitude });
              setLocation({ lat: latitude, long: longitude });
            }
          },
          () => {
            setError("Please enable location services to use the map.");
            if (!location) {
              setInitialMapCenter({ lat: 37.5665, lng: 126.978 });
              setLocation({ lat: 37.5665, long: 126.978 });
            }
          }
        );
      }
    }
  }, [token, router, authLoading, location]);

  const handleFileChange = useCallback(
    async (selectedFiles: FileList | null) => {
      if (selectedFiles && selectedFiles.length > 0) {
        setIsConverting(true);
        setError(null);
        try {
          const rawFiles = Array.from(selectedFiles);

          // 1. Extract GPS location from raw files (works for HEIC, JPEG, PNG, etc.)
          for (const rawFile of rawFiles) {
            try {
              const gps = await exifr.gps(rawFile);
              if (
                gps &&
                typeof gps.latitude === "number" &&
                typeof gps.longitude === "number"
              ) {
                setLocation({ lat: gps.latitude, long: gps.longitude });
                setInitialMapCenter({ lat: gps.latitude, lng: gps.longitude });
                break;
              }
            } catch (e) {
              console.warn(
                "Could not extract EXIF location from raw file:",
                rawFile.name,
                e
              );
            }
          }

          // 2. Convert HEIC files to JPEG for browser preview and backend upload
          const newFiles = await processImageFiles(rawFiles);

          if (newFiles.length === 0 && rawFiles.length > 0) {
            setError(
              "Failed to process selected image(s). Please try a different photo format."
            );
            return;
          }

          const newPreviews = newFiles.map((file) => URL.createObjectURL(file));

          setFiles((prevFiles) => [...prevFiles, ...newFiles]);
          setImagePreviews((prevPreviews) => [...prevPreviews, ...newPreviews]);
        } catch (err) {
          console.error("Error processing selected files:", err);
          setError("Failed to convert image for preview.");
        } finally {
          setIsConverting(false);
        }
      }
    },
    []
  );

  const removeImage = (index: number) => {
    setFiles((prevFiles) => prevFiles.filter((_, i) => i !== index));
    setImagePreviews((prevPreviews) =>
      prevPreviews.filter((_, i) => i !== index)
    );
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
    if (!content.trim() || !location) {
      setError(
        "Content and location are required. Please select a location on the map."
      );
      return;
    }
    setSubmitLoading(true);
    setError(null);

    try {
      const imageIds: string[] = [];
      if (files.length > 0) {
        for (const file of files) {
          const formData = new FormData();
          formData.append("file", file);
          formData.append("private", String(isPrivate));

          const response = await fetch(`${API_URL}/file/upload`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
            },
            body: formData,
          });

          if (!response.ok) {
            throw new Error("Image upload failed.");
          }
          const data = await response.json();
          if (data.result === "success" && data.id) {
            imageIds.push(data.id);
          }
        }
      }

      const feedData = {
        content: content.trim(),
        location,
        images: imageIds,
        private: isPrivate,
      };

      const feedResponse = await fetch(`${API_URL}/feed/new`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(feedData),
      });

      if (!feedResponse.ok) {
        const errorData = await feedResponse.json();
        throw new Error(errorData.detail || "Failed to create feed.");
      }

      const feedResult = await feedResponse.json();
      if (feedResult.result === "success") {
        router.push("/");
      } else {
        throw new Error("Failed to create feed.");
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitLoading(false);
    }
  };

  if (authLoading || !initialMapCenter) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-4rem)] p-4 bg-black text-gray-400">
        Loading...
      </div>
    );
  }

  if (!token) return null;

  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-4rem)] p-4 bg-black">
      <div className="w-full max-w-xl bg-gray-900 border border-gray-800 rounded-2xl p-6 shadow-2xl space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="p-2 text-gray-400 hover:text-white bg-gray-950 border border-gray-800 rounded-xl transition-all cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-white flex items-center gap-2">
              <PlusCircle className="w-5 h-5 text-blue-500" />
              <span>Create New Ping</span>
            </h1>
            <p className="text-xs text-gray-400">
              Share what&apos;s happening at your location
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Content */}
          <div>
            <label className="block text-xs font-semibold text-gray-400 mb-1.5">
              Content
            </label>
            <textarea
              id="content"
              rows={4}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="What's happening around you?"
              className="w-full px-4 py-3 bg-gray-950 border border-gray-800 rounded-xl text-white text-sm focus:outline-none focus:border-blue-500 transition-colors"
              required
            />
          </div>

          {/* Location Picker */}
          <div>
            <label className="block text-xs font-semibold text-gray-400 mb-1.5">
              Select Location on Map
            </label>
            <div className="rounded-xl overflow-hidden border border-gray-800">
              <LocationPicker
                initialCenter={initialMapCenter}
                onLocationSelect={setLocation}
              />
            </div>
          </div>

          {/* Image Upload Area */}
          <div>
            <label className="block text-xs font-semibold text-gray-400 mb-1.5">
              Images
            </label>
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-xl transition-all ${
                isDragging
                  ? "border-blue-500 bg-blue-600/10"
                  : "border-gray-800 bg-gray-950 hover:border-gray-700"
              }`}
            >
              <Upload className="w-8 h-8 text-gray-500 mb-2" />
              <div className="flex text-xs text-gray-400">
                <label
                  htmlFor="file-upload"
                  className="cursor-pointer font-semibold text-blue-400 hover:text-blue-300 hover:underline"
                >
                  <span>Upload files</span>
                  <input
                    id="file-upload"
                    name="file-upload"
                    type="file"
                    className="sr-only"
                    multiple
                    accept="image/*,.heic,.heif"
                    onChange={(e) => handleFileChange(e.target.files)}
                  />
                </label>
                <span className="pl-1">or drag and drop</span>
              </div>
              <p className="text-[10px] text-gray-500 mt-1">
                PNG, JPG, GIF, HEIC up to 10MB
              </p>
            </div>
          </div>

          {/* Converting Indicator */}
          {isConverting && (
            <div className="flex items-center justify-center p-3 text-xs text-blue-400 gap-2 bg-blue-950/40 border border-blue-900/60 rounded-xl">
              <div className="w-3.5 h-3.5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
              <span>Converting HEIC image for preview...</span>
            </div>
          )}

          {/* Image Previews */}
          {imagePreviews.length > 0 && (
            <div className="grid grid-cols-3 gap-3">
              {imagePreviews.map((preview, index) => (
                <div
                  key={index}
                  className="relative group rounded-xl overflow-hidden border border-gray-800 bg-gray-950 aspect-square"
                >
                  <img
                    src={preview}
                    alt={`Preview ${index}`}
                    className="w-full h-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => removeImage(index)}
                    className="absolute top-1.5 right-1.5 p-1 bg-black/70 hover:bg-red-600 rounded-full text-white transition-colors cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Privacy Toggle */}
          <div className="flex items-center gap-3 p-3 rounded-xl bg-gray-950 border border-gray-800">
            <input
              id="private"
              type="checkbox"
              checked={isPrivate}
              onChange={(e) => setIsPrivate(e.target.checked)}
              className="h-4 w-4 rounded border-gray-700 text-blue-600 focus:ring-blue-500 cursor-pointer"
            />
            <label
              htmlFor="private"
              className="text-xs text-gray-300 flex items-center gap-1.5 cursor-pointer font-medium"
            >
              {isPrivate ? (
                <Lock className="w-3.5 h-3.5 text-yellow-500" />
              ) : (
                <Globe className="w-3.5 h-3.5 text-blue-400" />
              )}
              <span>Make this ping private</span>
            </label>
          </div>

          {error && (
            <div className="p-3 rounded-xl bg-red-950/40 border border-red-800/60 text-xs text-red-400">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitLoading || !content.trim() || !location}
            className="w-full py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold rounded-xl text-sm transition-all shadow-md shadow-blue-600/20 cursor-pointer"
          >
            {submitLoading ? "Pinging..." : "Post Ping"}
          </button>
        </form>
      </div>
    </div>
  );
}
