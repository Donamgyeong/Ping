"use client";

import { useRouter } from "next/navigation";
import { formatLocalDate } from "@/utils/date";
import { Plus, User, MapPin } from "lucide-react";

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

interface FeedListProps {
  feeds: FeedItem[];
  onFeedItemClick: (feed: FeedItem) => void;
  title?: string;
  emptyMessage?: string;
  showCreateFeedButton?: boolean;
}

export default function FeedList({
  feeds,
  onFeedItemClick,
  title = "Feeds",
  emptyMessage = "No pings found nearby.",
  showCreateFeedButton = true,
}: FeedListProps) {
  const router = useRouter();

  const handleCreateFeedClick = () => {
    router.push("/feed/new");
  };

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden shadow-2xl m-2">
      {title && (
        <div className="p-4 border-b border-gray-800 flex justify-between items-center bg-gray-950/60">
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <MapPin className="w-4 h-4 text-blue-500" />
            <span>{title}</span>
          </h2>
          <span className="text-xs text-gray-500 font-mono bg-gray-900 border border-gray-800 px-2 py-0.5 rounded-md">
            {feeds.length} Pings
          </span>
        </div>
      )}

      {feeds.length > 0 ? (
        <div className="divide-y divide-gray-800/60 max-h-[calc(100vh-14rem)] overflow-y-auto p-2 space-y-1">
          {feeds.map((feed) => (
            <div
              key={feed.fid}
              onClick={() => onFeedItemClick(feed)}
              className="cursor-pointer p-3.5 rounded-xl hover:bg-gray-800/80 transition-all border border-transparent hover:border-gray-700/60 group"
            >
              <div className="flex items-center mb-2">
                <div className="w-8 h-8 rounded-full bg-gray-800 border border-gray-700 mr-2.5 flex justify-center items-center shrink-0">
                  <User className="w-4 h-4 text-gray-400" />
                </div>
                <span className="font-semibold text-sm text-gray-200 group-hover:text-blue-400 transition-colors">
                  {feed.nickname || feed.uid}
                </span>
              </div>
              <p className="text-sm text-gray-300 mb-2 line-clamp-2 leading-relaxed">
                {feed.content}
              </p>
              <p className="text-[11px] text-gray-500">
                {formatLocalDate(feed.post_date)}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <div className="p-8 text-center text-sm text-gray-500">
          {emptyMessage}
        </div>
      )}

      {showCreateFeedButton && (
        <div className="p-3 bg-gray-950/80 border-t border-gray-800">
          <button
            onClick={handleCreateFeedClick}
            className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 transition-all shadow-md shadow-blue-600/20 text-sm cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Create Ping</span>
          </button>
        </div>
      )}
    </div>
  );
}
