"use client";

import ChatSidebar from "@/app/components/ChatSidebar";
import ChatRoomView from "@/app/components/ChatRoomView";

export default function ChatPage() {
  return (
    <div className="flex h-[calc(100vh-4rem)] w-full overflow-hidden bg-black">
      <ChatSidebar />
      <ChatRoomView />
    </div>
  );
}
