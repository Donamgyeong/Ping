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
    <div className="flex h-[calc(100vh-4rem)] w-full overflow-hidden bg-black">
      <ChatSidebar activeCid={cid} />
      <ChatRoomView cid={cid} />
    </div>
  );
}
