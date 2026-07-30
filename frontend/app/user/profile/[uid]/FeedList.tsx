"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { formatLocalDate } from "@/utils/date";
import { User } from "lucide-react";

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
}

export default function ProfileFeedList({
  feeds,
  onFeedItemClick,
  title = "Feeds",
  emptyMessage = "No pings found.",
}: FeedListProps) {
  const router = useRouter();

  const uniqueFeeds = useMemo(() => {
    const seen = new Set<string>();
    return feeds.filter((feed) => {
      if (!feed || !feed.fid || seen.has(feed.fid)) return false;
      seen.add(feed.fid);
      return true;
    });
  }, [feeds]);

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden shadow-2xl">
      {title && (
        <div className="p-4 border-b border-gray-800 bg-gray-950/60">
          <h2 className="text-base font-bold text-white">{title}</h2>
        </div>
      )}
      {uniqueFeeds.length > 0 ? (
        <div className="divide-y divide-gray-800/60 p-2 space-y-1">
          {uniqueFeeds.map((feed) => (
            <div
              key={feed.fid}
              onClick={() => onFeedItemClick(feed)}
              className="cursor-pointer p-4 rounded-xl hover:bg-gray-800/80 transition-all border border-transparent hover:border-gray-700/60 group"
            >
              <div className="flex items-center mb-2">
                <div className="w-7 h-7 rounded-full bg-gray-800 border border-gray-700 mr-2 flex justify-center items-center shrink-0">
                  <User className="w-3.5 h-3.5 text-gray-400" />
                </div>
                <span className="font-semibold text-sm text-gray-200 group-hover:text-blue-400 transition-colors">
                  {feed.nickname}
                </span>
              </div>
              <p className="text-sm text-gray-300 mb-2 leading-relaxed">
                {feed.content}
              </p>
              <p className="text-[11px] text-gray-500">
                {formatLocalDate(feed.post_date)}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <p className="p-8 text-center text-sm text-gray-500">{emptyMessage}</p>
      )}
    </div>
  );
}
