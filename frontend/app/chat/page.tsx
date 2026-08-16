"use client";

import { useRequireAuth } from "@/hooks/useRequireAuth";
import ChatSidebar from "@/app/components/ChatSidebar";
import ChatRoomView from "@/app/components/ChatRoomView";

export default function ChatPage() {
  const { loading, isAuthenticated } = useRequireAuth();

  if (loading || !isAuthenticated) {
    return (
      <div className="flex h-[calc(100vh-4rem)] w-full items-center justify-center bg-black text-gray-500 text-sm">
        Loading...
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] h-[calc(100dvh-4rem)] w-full overflow-hidden bg-black">
      <div className="w-full md:w-80 h-full shrink-0 flex flex-col">
        <ChatSidebar />
      </div>
      <div className="hidden md:flex flex-1 h-full min-w-0">
        <ChatRoomView />
      </div>
    </div>
  );
}
