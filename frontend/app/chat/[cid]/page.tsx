"use client";

import { useParams } from "next/navigation";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import ChatSidebar from "@/app/components/ChatSidebar";
import ChatRoomView from "@/app/components/ChatRoomView";

export default function ChatRoomPage() {
  const params = useParams();
  const cid = params.cid as string;
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
      <div className="hidden md:flex md:w-80 h-full shrink-0 flex-col">
        <ChatSidebar activeCid={cid} />
      </div>
      <div className="w-full flex-1 h-full flex flex-col min-w-0">
        <ChatRoomView cid={cid} />
      </div>
    </div>
  );
}
