"use client";

import { useParams } from "next/navigation";
import ChatSidebar from "@/app/components/ChatSidebar";
import ChatRoomView from "@/app/components/ChatRoomView";

export default function ChatRoomPage() {
  const params = useParams();
  const cid = params.cid as string;

  return (
    <div className="flex h-[calc(100vh-4rem)] w-full overflow-hidden bg-black">
      <ChatSidebar activeCid={cid} />
      <ChatRoomView cid={cid} />
    </div>
  );
}
