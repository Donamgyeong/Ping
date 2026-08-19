"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
  ReactNode,
} from "react";
import { useAuth } from "./useAuth";
import { usePathname, useRouter } from "next/navigation";

export interface ChatItem {
  idx: number;
  cid: string;
  uid: string;
  message: string;
  date: string;
  avatar?: string;
}

export interface NotiItem {
  noti_id: string;
  type: string;
  receiver: string;
  content: string;
  link: string;
  date: string;
}

export interface ToastBanner {
  id: string;
  type: "chat" | "notification";
  subType?: string;
  title: string;
  content: string;
  link?: string;
  date: string;
  cid?: string;
  senderUid?: string;
}

interface WebSocketContextType {
  isConnected: boolean;
  sendChatMessage: (cid: string, message: string) => boolean;
  subscribeChat: (cid: string, callback: (msg: ChatItem) => void) => () => void;
  banners: ToastBanner[];
  dismissBanner: (id: string) => void;
  unreadNotiCount: number;
  setUnreadNotiCount: React.Dispatch<React.SetStateAction<number>>;
  refreshUnreadCount: () => Promise<void>;
}

const WebSocketContext = createContext<WebSocketContextType | undefined>(
  undefined
);

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const WEBSOCKET_URL = API_URL.replace(/^http/, "ws");

function parseSocketMessage(raw: any): { type: string; payload: any } | null {
  if (!raw) return null;

  let parsed = raw;
  while (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      // Handle Python dict repr formatting (e.g. single quotes, True/False/None)
      try {
        const jsonFormatted = parsed
          .replace(/'/g, '"')
          .replace(/\bNone\b/g, "null")
          .replace(/\bTrue\b/g, "true")
          .replace(/\bFalse\b/g, "false");
        parsed = JSON.parse(jsonFormatted);
      } catch {
        return null;
      }
    }
  }

  // If redis pubsub wrapped format: { type: "message", data: ... }
  if (parsed && typeof parsed === "object") {
    if (parsed.data !== undefined) {
      return parseSocketMessage(parsed.data);
    }

    if (typeof parsed.type === "string") {
      let payload = parsed.payload;
      while (typeof payload === "string") {
        try {
          payload = JSON.parse(payload);
        } catch {
          try {
            const jsonFormatted = payload
              .replace(/'/g, '"')
              .replace(/\bNone\b/g, "null")
              .replace(/\bTrue\b/g, "true")
              .replace(/\bFalse\b/g, "false");
            payload = JSON.parse(jsonFormatted);
          } catch {
            break;
          }
        }
      }
      return {
        type: parsed.type,
        payload,
      };
    }
  }

  return null;
}

export function WebSocketProvider({ children }: { children: ReactNode }) {
  const { token, uid, loading: authLoading, authFetch } = useAuth();
  const pathname = usePathname();
  const [isConnected, setIsConnected] = useState(false);
  const [banners, setBanners] = useState<ToastBanner[]>([]);
  const [unreadNotiCount, setUnreadNotiCount] = useState(0);

  const socketRef = useRef<WebSocket | null>(null);
  const chatSubscribersRef = useRef<Map<string, Set<(msg: ChatItem) => void>>>(
    new Map()
  );
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;

  const currentUidRef = useRef(uid);
  currentUidRef.current = uid;

  const dismissBanner = useCallback((id: string) => {
    setBanners((prev) => prev.filter((b) => b.id !== id));
  }, []);

  const addBanner = useCallback(
    (banner: Omit<ToastBanner, "id">) => {
      const id = `${banner.type}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const newBanner: ToastBanner = { ...banner, id };

      setBanners((prev) => [newBanner, ...prev].slice(0, 5));

      // Auto dismiss after 5 seconds
      setTimeout(() => {
        dismissBanner(id);
      }, 5000);
    },
    [dismissBanner]
  );

  const addBannerRef = useRef(addBanner);
  addBannerRef.current = addBanner;

  const refreshUnreadCount = useCallback(async () => {
    if (!token) {
      setUnreadNotiCount(0);
      return;
    }
    try {
      const res = await authFetch(`${API_URL}/notification/get/count`);
      if (res.ok) {
        const data = await res.json();
        if (data.result === "OK" && typeof data.cnt === "number") {
          setUnreadNotiCount(data.cnt > 0 ? data.cnt : 0);
        }
      }
    } catch (error) {
      console.error("Failed to fetch notification count:", error);
    }
  }, [token, authFetch]);

  // Initial & periodic notification count sync
  useEffect(() => {
    refreshUnreadCount();
    const interval = setInterval(refreshUnreadCount, 30000);
    return () => clearInterval(interval);
  }, [refreshUnreadCount]);

  // WebSocket Connection Lifecycle
  useEffect(() => {
    if (authLoading || !token) {
      if (socketRef.current) {
        socketRef.current.close();
        socketRef.current = null;
      }
      setIsConnected(false);
      return;
    }

    let isMounted = true;
    let pingInterval: NodeJS.Timeout | null = null;
    let reconnectTimeout: NodeJS.Timeout | null = null;

    const connectWebSocket = () => {
      if (!isMounted) return;

      try {
        const wsUrl = `${WEBSOCKET_URL}/ws`;
        const socket = new WebSocket(wsUrl);
        socketRef.current = socket;

        socket.onopen = () => {
          if (!isMounted) return;
          setIsConnected(true);

          // 1. Send AUTH payload.
          // Backend executes: auth_msg = await websocket.receive_json(); sock_msg = SocketMsg.model_validate_json(auth_msg)
          // Double stringify ensures receive_json() returns a JSON string that model_validate_json() can parse.
          const authMsgStr = JSON.stringify({
            type: "AUTH",
            payload: token,
          });
          socket.send(JSON.stringify(authMsgStr));

          // 2. Setup Heartbeat ping every 15 seconds (backend timeout is 30s)
          if (pingInterval) clearInterval(pingInterval);
          pingInterval = setInterval(() => {
            if (socket.readyState === WebSocket.OPEN) {
              const pingMsgStr = JSON.stringify({
                type: "PING",
                payload: null,
              });
              socket.send(JSON.stringify(pingMsgStr));
            }
          }, 15000);
        };

        socket.onmessage = (event) => {
          if (!isMounted) return;

          try {
            const sockMsg = parseSocketMessage(event.data);
            if (!sockMsg) return;

            const { type, payload } = sockMsg;

            if (type === "PONG") {
              return;
            }

            if (type === "CHAT" && payload) {
              const chatItem: ChatItem = payload;

              // Notify subscribers for this chat room
              const roomSubscribers = chatSubscribersRef.current.get(
                chatItem.cid
              );
              if (roomSubscribers && roomSubscribers.size > 0) {
                roomSubscribers.forEach((cb) => {
                  try {
                    cb(chatItem);
                  } catch (e) {
                    console.error("Chat subscriber error:", e);
                  }
                });
              }

              // Show banner if not currently inside that specific chat room
              const currentPath = pathnameRef.current;
              const isInsideThisChat = currentPath === `/chat/${chatItem.cid}`;
              const isMyOwnMessage =
                currentUidRef.current &&
                chatItem.uid === currentUidRef.current;

              if (!isInsideThisChat && !isMyOwnMessage) {
                addBannerRef.current({
                  type: "chat",
                  title: "새로운 채팅 메시지",
                  content: chatItem.message,
                  link: `/chat/${chatItem.cid}`,
                  date: chatItem.date || new Date().toISOString(),
                  cid: chatItem.cid,
                  senderUid: chatItem.uid,
                });
              }
            } else if (type === "NOTI" && payload) {
              const noti: NotiItem = payload;

              // Increment unread notification count
              setUnreadNotiCount((prev) => prev + 1);

              // Show banner notification
              addBannerRef.current({
                type: "notification",
                subType: noti.type,
                title: "새로운 알림",
                content: noti.content || "새로운 알림이 도착했습니다.",
                link: noti.link || "/notification",
                date: noti.date || new Date().toISOString(),
              });
            }
          } catch (e) {
            console.error("Failed to process WebSocket message:", e);
          }
        };

        socket.onclose = () => {
          if (pingInterval) clearInterval(pingInterval);
          if (!isMounted) return;
          setIsConnected(false);

          // Try reconnect after 3 seconds
          if (!reconnectTimeout) {
            reconnectTimeout = setTimeout(() => {
              reconnectTimeout = null;
              if (isMounted && token) {
                connectWebSocket();
              }
            }, 3000);
          }
        };

        socket.onerror = (err) => {
          console.error("WebSocket error:", err);
        };
      } catch (err) {
        console.error("Failed to establish WebSocket connection:", err);
      }
    };

    connectWebSocket();

    return () => {
      isMounted = false;
      if (pingInterval) clearInterval(pingInterval);
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (socketRef.current) {
        socketRef.current.onopen = null;
        socketRef.current.onmessage = null;
        socketRef.current.onclose = null;
        socketRef.current.onerror = null;
        if (
          socketRef.current.readyState === WebSocket.OPEN ||
          socketRef.current.readyState === WebSocket.CONNECTING
        ) {
          socketRef.current.close();
        }
        socketRef.current = null;
      }
      setIsConnected(false);
    };
  }, [token, authLoading]);

  // Method to send chat message through global WebSocket
  const sendChatMessage = useCallback(
    (cid: string, messageText: string): boolean => {
      const socket = socketRef.current;
      if (!socket || socket.readyState !== WebSocket.OPEN || !cid || !messageText.trim()) {
        return false;
      }

      const chatPayload = {
        idx: 0,
        cid,
        uid: currentUidRef.current || "",
        message: messageText.trim(),
        date: new Date().toISOString(),
      };

      const socketMsg = {
        type: "CHAT",
        payload: chatPayload,
      };

      const socketMsgStr = JSON.stringify(socketMsg);
      socket.send(JSON.stringify(socketMsgStr));
      return true;
    },
    []
  );

  // Method for components (e.g. ChatRoomView) to subscribe to real-time chat messages
  const subscribeChat = useCallback(
    (cid: string, callback: (msg: ChatItem) => void) => {
      if (!chatSubscribersRef.current.has(cid)) {
        chatSubscribersRef.current.set(cid, new Set());
      }
      const subscribers = chatSubscribersRef.current.get(cid)!;
      subscribers.add(callback);

      return () => {
        subscribers.delete(callback);
        if (subscribers.size === 0) {
          chatSubscribersRef.current.delete(cid);
        }
      };
    },
    []
  );

  const value: WebSocketContextType = {
    isConnected,
    sendChatMessage,
    subscribeChat,
    banners,
    dismissBanner,
    unreadNotiCount,
    setUnreadNotiCount,
    refreshUnreadCount,
  };

  return (
    <WebSocketContext.Provider value={value}>
      {children}
    </WebSocketContext.Provider>
  );
}

export function useWebSocket() {
  const context = useContext(WebSocketContext);
  if (context === undefined) {
    throw new Error("useWebSocket must be used within a WebSocketProvider");
  }
  return context;
}
