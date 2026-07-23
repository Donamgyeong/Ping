"use client";

import { useEffect, useState, useRef } from "react";
import { useParams } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { User } from "lucide-react";

interface Message {
  mid: string;
  cid: string;
  uid: string;
  message: string;
  date: string;
  avatar?: string;
}

export default function ChatPage() {
  const params = useParams();
  const cid = params.cid as string;
  const { token, uid } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const socketRef = useRef<WebSocket | null>(null);
  const messagesEndRef = useRef<null | HTMLDivElement>(null);

  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
  const WEBSOCKET_URL = API_URL.replace(/^http/, "ws");

  useEffect(() => {
    if (cid && token) {
      const socket = new WebSocket(`${WEBSOCKET_URL}/chat/ws`);
      socketRef.current = socket;

      socket.onopen = () => {
        console.log("WebSocket connection established");

        socket.send(
          JSON.stringify({
            type: "AUTH",
            payload: token,
          }),
        );
      };

      socket.onmessage = (event) => {
        const messageData = JSON.parse(event.data);
        setMessages((prevMessages) => [...prevMessages, messageData]);
      };

      socket.onclose = () => {
        console.log("WebSocket connection closed");
      };

      socket.onerror = (error) => {
        console.error("WebSocket error:", error);
      };

      return () => {
        if (socketRef.current) {
          socketRef.current.close();
        }
      };
    }
  }, [cid, token, WEBSOCKET_URL]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (newMessage.trim() && socketRef.current?.readyState === WebSocket.OPEN) {
      const message = {
        cid,
        message: newMessage,
        uid,
      };
      socketRef.current.send(JSON.stringify(message));
      setNewMessage("");
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      <div className="bg-gray-100 p-4 border-b">
        <h1 className="text-xl font-bold">Chat Room: {cid}</h1>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        <div className="flex flex-col space-y-4">
          {messages.map((msg) => (
            <div
              key={msg.mid}
              className={`flex items-end gap-2 ${
                msg.uid === uid ? "justify-end" : "justify-start"
              }`}
            >
              {msg.uid !== uid && (
                <div className="w-8 h-8 rounded-full bg-gray-300 flex items-center justify-center text-gray-600 shrink-0 mb-1 overflow-hidden">
                  {msg.avatar ? (
                    <img
                      src={msg.avatar}
                      alt="avatar"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <User className="w-5 h-5" />
                  )}
                </div>
              )}
              <div
                className={`px-4 py-2 rounded-lg ${
                  msg.uid === uid
                    ? "bg-blue-500 text-white"
                    : "bg-gray-200 text-gray-800"
                }`}
              >
                <p className="text-sm">{msg.message}</p>
                <p className="text-xs text-right opacity-75">
                  {new Date(msg.date).toLocaleTimeString()}
                </p>
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>
      </div>
      <div className="p-4 border-t">
        <form onSubmit={handleSendMessage} className="flex space-x-4">
          <input
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            className="flex-1 p-2 border rounded-lg"
            placeholder="Type a message..."
          />
          <button
            type="submit"
            className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
          >
            Send
          </button>
        </form>
      </div>
    </div>
  );
}
