"use client";

import { useRouter } from 'next/navigation';

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

export default function FeedList({ feeds, onFeedItemClick, title = "Feeds", emptyMessage = "No pings found nearby.", showCreateFeedButton = true }: FeedListProps) {
  const router = useRouter();

  const handleCreateFeedClick = () => {
    router.push('/feed/new');
  };

  return (
    <div className="bg-black">
      {title && <h2 className="text-lg font-semibold p-4 border-b border-gray-300">{title}</h2>}
      {feeds.length > 0 ? (
        <ul>
          {feeds.map((feed) => (
            <li
              key={feed.fid}
              onClick={() => onFeedItemClick(feed)}
              className="cursor-pointer p-4 border-b border-gray-300"
            >
              <div className="flex items-center mb-2">
                  {/* Placeholder for user avatar */}
                  <div className="w-8 h-8 rounded-full bg-gray-300 mr-3"></div>
                  <span className="font-semibold text-sm">{feed.nickname}</span>
              </div>
              <p className="text-sm mb-2">{feed.content}</p>
              <p className="text-xs text-gray-400">
                {new Date(feed.post_date).toLocaleString()}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="p-4 text-sm text-gray-500">{emptyMessage}</p>
      )}
      {showCreateFeedButton && (
        <div className="p-4">
          <button
            onClick={handleCreateFeedClick}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
          >
            Create Feed
          </button>
        </div>
      )}
    </div>
  );
}
