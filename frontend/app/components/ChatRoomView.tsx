"use client";

import React, { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";
import { useWebSocket } from "@/hooks/useWebSocket";
import { User, Loader2, MessageSquare, Send, ArrowLeft } from "lucide-react";

interface Message {
  idx?: number;
  mid?: string;
  cid: string;
  uid: string;
  message: string;
  date: string;
  avatar?: string;
}

interface ChatRoomViewProps {
  cid?: string;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export default function ChatRoomView({ cid }: ChatRoomViewProps) {
  const { token, uid, loading, authFetch } = useAuth();
  const { sendChatMessage, subscribeChat } = useWebSocket();
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [isInitialLoaded, setIsInitialLoaded] = useState(false);

  const messagesEndRef = useRef<null | HTMLDivElement>(null);
  const scrollContainerRef = useRef<null | HTMLDivElement>(null);

  // 1. Reset state when cid changes
  useEffect(() => {
    setMessages([]);
    setIsInitialLoaded(false);
  }, [cid]);

  // 2. Initial Chat History Loading with last_idx=0
  useEffect(() => {
    if (!loading && cid && token) {
      let isMounted = true;
      setLoadingHistory(true);

      authFetch(`${API_URL}/chat/messages/${cid}?last_idx=0`)
        .then((res) => res.json())
        .then((data) => {
          if (!isMounted) return;
          if (data.result === "success" && Array.isArray(data.chat)) {
            setMessages(data.chat);
          }
        })
        .catch((err) => {
          console.error("Failed to load chat history:", err);
        })
        .finally(() => {
          if (isMounted) {
            setLoadingHistory(false);
            setIsInitialLoaded(true);
          }
        });

      return () => {
        isMounted = false;
      };
    }
  }, [cid, token, loading, authFetch]);

  // 3. Subscribe to real-time chat messages from global WebSocket
  useEffect(() => {
    if (!cid) return;

    const unsubscribe = subscribeChat(cid, (chatItem) => {
      setMessages((prevMessages) => {
        if (
          chatItem.idx !== undefined &&
          prevMessages.some((m) => m.idx === chatItem.idx)
        ) {
          return prevMessages;
        }
        return [...prevMessages, chatItem];
      });
    });

    return () => {
      unsubscribe();
    };
  }, [cid, subscribeChat]);

  // 6. Scroll to bottom on initial load & new incoming message
  useEffect(() => {
    if (isInitialLoaded && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages.length, isInitialLoaded]);

  const parseLocalDate = (dateString: string) => {
    if (!dateString) return new Date();
    const isUtc = dateString.endsWith("Z") || dateString.includes("+");
    const utcString = isUtc ? dateString : `${dateString}Z`;
    return new Date(utcString);
  };

  const formatDateSeparator = (dateString: string) => {
    const date = parseLocalDate(dateString);
    return date.toLocaleDateString("ko-KR", {
      year: "numeric",
      month: "long",
      day: "numeric",
      weekday: "long",
    });
  };

  const getLocalDateKey = (dateString: string) => {
    const date = parseLocalDate(dateString);
    return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
  };

  const formatMessageTime = (dateString: string) => {
    if (!dateString) return "";
    const date = parseLocalDate(dateString);
    return date.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (newMessage.trim() && cid) {
      const success = sendChatMessage(cid, newMessage.trim());
      if (success) {
        setNewMessage("");
      }
    }
  };

  // If no chat room is selected, render placeholder view
  if (!cid) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-gray-950 text-gray-400 p-6">
        <div className="w-16 h-16 rounded-full bg-gray-900 border border-gray-800 flex items-center justify-center mb-4">
          <MessageSquare className="w-8 h-8 text-blue-500" />
        </div>
        <h3 className="text-xl font-semibold text-white mb-2">Your Messages</h3>
        <p className="text-sm text-gray-500 max-w-sm text-center">
          Select a chat room from the sidebar to start messaging or join existing conversations.
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-gray-950 min-w-0">
      {/* Header */}
      <div className="bg-gray-900 px-4 py-3 md:py-3.5 border-b border-gray-800 flex items-center justify-between shrink-0 shadow-xs">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href="/chat"
            className="md:hidden p-1.5 -ml-1 text-gray-400 hover:text-white bg-gray-950/80 border border-gray-800 rounded-lg transition-all flex items-center justify-center shrink-0"
            title="Back to chats"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div className="flex items-center gap-2 min-w-0">
            <h1 className="text-base md:text-lg font-bold text-white shrink-0">
              Chat Room
            </h1>
            <span className="text-xs bg-gray-800 text-gray-300 font-mono px-2 py-0.5 rounded-md border border-gray-700 max-w-[130px] sm:max-w-[220px] truncate">
              {cid}
            </span>
          </div>
        </div>
      </div>

      {/* Messages Scroll Area */}
      <div
        ref={scrollContainerRef}
        className="flex-1 min-h-0 overflow-y-auto p-3 sm:p-4 space-y-4"
      >
        {loadingHistory && (
          <div className="flex justify-center items-center py-2">
            <Loader2 className="w-5 h-5 animate-spin text-blue-500 mr-2" />
            <span className="text-sm text-gray-400">Loading history...</span>
          </div>
        )}

        <div className="flex flex-col space-y-4">
          {messages.map((msg, index) => {
            const currentDateKey = getLocalDateKey(msg.date);
            const prevDateKey =
              index > 0 ? getLocalDateKey(messages[index - 1].date) : null;
            const isNewDay = currentDateKey !== prevDateKey;

            return (
              <React.Fragment key={msg.idx ?? msg.mid ?? `${msg.cid}-${msg.date}-${index}`}>
                {isNewDay && (
                  <div className="flex items-center justify-center my-4">
                    <div className="bg-gray-800 text-gray-300 border border-gray-700 text-xs px-3.5 py-1 rounded-full shadow-sm font-medium">
                      {formatDateSeparator(msg.date)}
                    </div>
                  </div>
                )}
                <div
                  className={`flex items-end gap-2 ${
                    msg.uid === uid ? "justify-end" : "justify-start"
                  }`}
                >
                  {msg.uid !== uid && (
                    <div className="w-8 h-8 rounded-full bg-gray-700 border border-gray-600 flex items-center justify-center text-gray-300 shrink-0 mb-1 overflow-hidden">
                      {msg.avatar ? (
                        <img
                          src={msg.avatar}
                          alt="avatar"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <User className="w-4 h-4" />
                      )}
                    </div>
                  )}
                  <div
                    className={`max-w-[85%] sm:max-w-[75%] px-3.5 py-2.5 sm:px-4 rounded-2xl shadow-sm ${
                      msg.uid === uid
                        ? "bg-blue-600 text-white rounded-br-none"
                        : "bg-gray-800 text-gray-100 border border-gray-700 rounded-bl-none"
                    }`}
                  >
                    <p className="text-sm leading-relaxed break-words whitespace-pre-wrap">{msg.message}</p>
                    <p
                      className={`text-[10px] text-right mt-1 opacity-75 ${
                        msg.uid === uid ? "text-blue-100" : "text-gray-400"
                      }`}
                    >
                      {formatMessageTime(msg.date)}
                    </p>
                  </div>
                </div>
              </React.Fragment>
            );
          })}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input Form */}
      <div className="p-3 sm:p-4 bg-gray-900 border-t border-gray-800 shrink-0">
        <form onSubmit={handleSendMessage} className="flex items-center gap-2 sm:gap-3">
          <input
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            className="flex-1 bg-gray-950 border border-gray-800 text-white text-sm rounded-xl px-3.5 py-2.5 sm:px-4 sm:py-3 focus:outline-none focus:border-blue-500 transition-colors"
            placeholder="Type a message..."
          />
          <button
            type="submit"
            disabled={!newMessage.trim()}
            className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-3.5 py-2.5 sm:px-5 sm:py-3 rounded-xl flex items-center gap-1.5 transition-colors font-medium text-sm cursor-pointer shadow-md shrink-0"
          >
            <Send className="w-4 h-4" />
            <span className="hidden sm:inline">Send</span>
          </button>
        </form>
      </div>
    </div>
  );
}
