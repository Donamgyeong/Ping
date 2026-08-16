"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { MessageSquare, Plus, Users } from "lucide-react";

interface ChatRoom {
  cid: string;
  title: string;
}

interface ChatSidebarProps {
  activeCid?: string;
  onSelectRoom?: (cid: string) => void;
}

export default function ChatSidebar({ activeCid, onSelectRoom }: ChatSidebarProps) {
  const { token, loading: authLoading } = useAuth();
  const [chatRooms, setChatRooms] = useState<ChatRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

  useEffect(() => {
    if (!authLoading && token) {
      const fetchChatRooms = async () => {
        try {
          const response = await fetch(`${API_URL}/chat/rooms`, {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          });

          if (!response.ok) {
            throw new Error("Failed to fetch chat rooms");
          }

          const data = await response.json();
          if (data.result === "success" && data.chatrooms) {
            setChatRooms(data.chatrooms);
          }
        } catch (err: any) {
          setError(err.message);
        } finally {
          setLoading(false);
        }
      };

      fetchChatRooms();
    } else if (!authLoading && !token) {
      setLoading(false);
    }
  }, [token, authLoading, API_URL]);

  const handleRoomClick = (cid: string) => {
    if (onSelectRoom) {
      onSelectRoom(cid);
    }
    router.push(`/chat/${cid}`);
  };

  return (
    <aside className="w-full md:w-80 bg-gray-900 border-r border-gray-800 flex flex-col h-full shrink-0">
      {/* Header */}
      <div className="p-4 border-b border-gray-800 flex justify-between items-center bg-gray-950">
        <div className="flex items-center gap-2 text-white">
          <MessageSquare className="w-5 h-5 text-blue-500" />
          <h2 className="font-bold text-lg">Chats</h2>
        </div>
        <Link
          href="/chat/new"
          className="flex items-center gap-1 text-xs bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg transition-colors font-medium"
        >
          <Plus className="w-4 h-4" />
          <span>New</span>
        </Link>
      </div>

      {/* Room List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1 pb-20 md:pb-2">
        {loading ? (
          <div className="p-4 text-center text-sm text-gray-500">
            Loading chats...
          </div>
        ) : error ? (
          <div className="p-4 text-center text-sm text-red-400">{error}</div>
        ) : chatRooms.length === 0 ? (
          <div className="p-6 text-center text-sm text-gray-500">
            No chat rooms yet. Click &quot;New&quot; to create one.
          </div>
        ) : (
          chatRooms.map((room) => {
            const isActive = room.cid === activeCid;
            return (
              <button
                key={room.cid}
                onClick={() => handleRoomClick(room.cid)}
                className={`w-full text-left p-3 rounded-xl flex items-center gap-3 transition-all cursor-pointer ${
                  isActive
                    ? "bg-blue-600 text-white shadow-md font-semibold"
                    : "text-gray-300 hover:bg-gray-800/80 hover:text-white"
                }`}
              >
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                    isActive ? "bg-blue-700 text-white" : "bg-gray-800 text-gray-400"
                  }`}
                >
                  <Users className="w-5 h-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-medium truncate">{room.title}</h3>
                  <p
                    className={`text-xs truncate ${
                      isActive ? "text-blue-100" : "text-gray-500"
                    }`}
                  >
                    Click to join discussion
                  </p>
                </div>
              </button>
            );
          })
        )}
      </div>
    </aside>
  );
}
