"use client";

import React, { useEffect, useState, useRef, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { User, Loader2, MessageSquare, Send } from "lucide-react";

interface Message {
  mid: string;
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
const WEBSOCKET_URL = API_URL.replace(/^http/, "ws");

export default function ChatRoomView({ cid }: ChatRoomViewProps) {
  const { token, uid, loading, authFetch } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [hasMore, setHasMore] = useState(true);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [isInitialLoaded, setIsInitialLoaded] = useState(false);

  const socketRef = useRef<WebSocket | null>(null);
  const messagesEndRef = useRef<null | HTMLDivElement>(null);
  const scrollContainerRef = useRef<null | HTMLDivElement>(null);

  // 1. Reset state when cid changes
  useEffect(() => {
    setMessages([]);
    setHasMore(true);
    setIsInitialLoaded(false);
  }, [cid]);

  // 2. Initial Chat History Loading
  useEffect(() => {
    if (!loading && cid && token) {
      let isMounted = true;
      setLoadingHistory(true);

      authFetch(`${API_URL}/chat/messages/${cid}?limit=50`)
        .then((res) => res.json())
        .then((data) => {
          if (!isMounted) return;
          if (data.result === "success" && Array.isArray(data.chat)) {
            setMessages(data.chat);
            if (data.chat.length < 50) {
              setHasMore(false);
            }
          }
        })
        .catch((err) => {
          console.error("Failed to load initial chat history:", err);
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

  // 3. Load Older Messages (Pagination)
  const loadMoreMessages = useCallback(async () => {
    if (loadingHistory || !hasMore || messages.length === 0 || !cid) return;

    const oldestMessageId = messages[0].mid;
    setLoadingHistory(true);

    const container = scrollContainerRef.current;
    const oldScrollHeight = container ? container.scrollHeight : 0;

    try {
      const response = await authFetch(
        `${API_URL}/chat/messages/${cid}?limit=50&before=${oldestMessageId}`
      );
      const data = await response.json();

      if (data.result === "success" && Array.isArray(data.chat)) {
        if (data.chat.length < 50) {
          setHasMore(false);
        }
        if (data.chat.length > 0) {
          setMessages((prev) => [...data.chat, ...prev]);

          requestAnimationFrame(() => {
            if (container) {
              const newScrollHeight = container.scrollHeight;
              container.scrollTop = newScrollHeight - oldScrollHeight;
            }
          });
        }
      }
    } catch (err) {
      console.error("Failed to load older messages:", err);
    } finally {
      setLoadingHistory(false);
    }
  }, [loadingHistory, hasMore, messages, cid, authFetch]);

  // 4. Scroll Event Listener for Infinity Scroll
  const handleScroll = () => {
    const container = scrollContainerRef.current;
    if (container && container.scrollTop === 0 && hasMore && !loadingHistory) {
      loadMoreMessages();
    }
  };

  // 5. WebSocket Connection
  useEffect(() => {
    if (!loading && cid && token) {
      const socket = new WebSocket(`${WEBSOCKET_URL}/chat/ws`);
      socketRef.current = socket;

      socket.onopen = () => {
        console.log("WebSocket connection established");
        socket.send(
          JSON.stringify({
            type: "AUTH",
            payload: token,
          })
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
        socket.onopen = null;
        socket.onmessage = null;
        socket.onclose = null;
        socket.onerror = null;
        if (
          socket.readyState === WebSocket.OPEN ||
          socket.readyState === WebSocket.CONNECTING
        ) {
          socket.close();
        }
        if (socketRef.current === socket) {
          socketRef.current = null;
        }
      };
    }
  }, [cid, token, loading]);

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
    if (newMessage.trim() && socketRef.current?.readyState === WebSocket.OPEN && cid) {
      const message = {
        cid,
        message: newMessage.trim(),
        uid,
      };
      socketRef.current.send(JSON.stringify(message));
      setNewMessage("");
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
    <div className="flex-1 flex flex-col h-full bg-gray-950">
      {/* Header */}
      <div className="bg-gray-900 p-4 border-b border-gray-800 flex items-center justify-between shadow-xs">
        <div>
          <h1 className="text-lg font-bold text-white flex items-center gap-2">
            <span>Chat Room</span>
            <span className="text-xs bg-gray-800 text-gray-300 font-mono px-2 py-0.5 rounded-md border border-gray-700">
              {cid}
            </span>
          </h1>
        </div>
      </div>

      {/* Messages Scroll Area */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto p-4 space-y-4"
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
              <React.Fragment key={msg.mid}>
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
                    className={`max-w-[75%] px-4 py-2.5 rounded-2xl shadow-sm ${
                      msg.uid === uid
                        ? "bg-blue-600 text-white rounded-br-none"
                        : "bg-gray-800 text-gray-100 border border-gray-700 rounded-bl-none"
                    }`}
                  >
                    <p className="text-sm leading-relaxed">{msg.message}</p>
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
      <div className="p-4 bg-gray-900 border-t border-gray-800">
        <form onSubmit={handleSendMessage} className="flex gap-3">
          <input
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            className="flex-1 bg-gray-950 border border-gray-800 text-white text-sm rounded-xl px-4 py-3 focus:outline-none focus:border-blue-500 transition-colors"
            placeholder="Type a message..."
          />
          <button
            type="submit"
            disabled={!newMessage.trim()}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-5 py-3 rounded-xl flex items-center gap-1.5 transition-colors font-medium text-sm cursor-pointer shadow-md"
          >
            <Send className="w-4 h-4" />
            <span>Send</span>
          </button>
        </form>
      </div>
    </div>
  );
}
