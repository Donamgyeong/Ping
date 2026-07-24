"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { MessageSquarePlus, Users, ArrowLeft, Check } from "lucide-react";

interface Follower {
  uid: string;
  nickname: string;
}

export default function NewChatPage() {
  const [title, setTitle] = useState("");
  const [selectedParticipants, setSelectedParticipants] = useState<string[]>([]);
  const [followers, setFollowers] = useState<Follower[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const { token, loading: authLoading } = useAuth();
  const router = useRouter();

  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

  useEffect(() => {
    if (!authLoading && !token) {
      router.push("/user/login");
    }
  }, [token, authLoading, router]);

  useEffect(() => {
    if (token) {
      const fetchFollowers = async () => {
        try {
          const response = await fetch(`${API_URL}/user/following`, {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          });

          if (!response.ok) {
            throw new Error("Failed to fetch followers");
          }

          const data = await response.json();
          if (data.result === "success" && data.following) {
            setFollowers(data.following);
          }
        } catch (err: any) {
          setError(err.message);
        } finally {
          setLoading(false);
        }
      };
      fetchFollowers();
    }
  }, [token, API_URL]);

  const handleParticipantChange = (uid: string) => {
    setSelectedParticipants((prev) =>
      prev.includes(uid) ? prev.filter((p) => p !== uid) : [...prev, uid]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!title.trim() || selectedParticipants.length === 0) {
      setError("Title and at least one participant are required.");
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch(`${API_URL}/chat/new`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: title.trim(),
          participants: selectedParticipants,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || "Failed to create chat room");
      }

      const data = await response.json();

      if (data.result === "success" && data.id) {
        router.push(`/chat/${data.id}`);
      } else {
        throw new Error("Failed to get chat room ID from response");
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (authLoading || !token) return null;

  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-4rem)] p-4 bg-black">
      <div className="w-full max-w-md bg-gray-900 border border-gray-800 rounded-2xl p-6 shadow-2xl space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="p-2 text-gray-400 hover:text-white bg-gray-950 border border-gray-800 rounded-xl transition-all cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-white flex items-center gap-2">
              <MessageSquarePlus className="w-5 h-5 text-blue-500" />
              <span>Create New Chat</span>
            </h1>
            <p className="text-xs text-gray-400">
              Start a new discussion with friends
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-400 mb-1.5">
              Chat Room Title
            </label>
            <input
              type="text"
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Weekend Hangout"
              className="w-full px-4 py-2.5 bg-gray-950 border border-gray-800 rounded-xl text-white text-sm focus:outline-none focus:border-blue-500 transition-colors"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-400 mb-1.5 flex justify-between items-center">
              <span>Select Participants</span>
              <span className="text-[10px] text-blue-400">
                {selectedParticipants.length} selected
              </span>
            </label>
            {loading ? (
              <div className="p-4 text-center text-xs text-gray-500">
                Loading followers...
              </div>
            ) : (
              <div className="space-y-1.5 border border-gray-800 bg-gray-950 rounded-xl p-3 max-h-56 overflow-y-auto">
                {followers.length > 0 ? (
                  followers.map((follower) => {
                    const isSelected = selectedParticipants.includes(
                      follower.uid
                    );
                    return (
                      <div
                        key={follower.uid}
                        onClick={() => handleParticipantChange(follower.uid)}
                        className={`flex items-center justify-between p-2.5 rounded-lg cursor-pointer transition-all border ${
                          isSelected
                            ? "bg-blue-600/20 border-blue-500/40 text-white"
                            : "hover:bg-gray-900 border-transparent text-gray-300"
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-full bg-gray-800 border border-gray-700 flex items-center justify-center">
                            <Users className="w-3.5 h-3.5 text-gray-400" />
                          </div>
                          <span className="text-sm font-medium">
                            {follower.nickname}
                          </span>
                        </div>
                        {isSelected && (
                          <div className="w-5 h-5 rounded-full bg-blue-600 flex items-center justify-center text-white">
                            <Check className="w-3 h-3" />
                          </div>
                        )}
                      </div>
                    );
                  })
                ) : (
                  <p className="text-xs text-gray-500 text-center py-3">
                    No followers found to invite.
                  </p>
                )}
              </div>
            )}
          </div>

          {error && (
            <div className="p-3 rounded-xl bg-red-950/40 border border-red-800/60 text-xs text-red-400">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={!title.trim() || selectedParticipants.length === 0 || submitting}
            className="w-full py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold rounded-xl text-sm transition-all shadow-md shadow-blue-600/20 cursor-pointer"
          >
            {submitting ? "Creating..." : "Create Chat Room"}
          </button>
        </form>
      </div>
    </div>
  );
}
