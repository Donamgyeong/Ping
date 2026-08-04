"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { formatLocalDate } from "@/utils/date";
import { useAuth } from "@/hooks/useAuth";
import { Trash2, MessageSquare, Send, MapPin } from "lucide-react";

interface FeedItem {
  fid: string;
  uid: string;
  content: string;
  post_date: string;
  location: {
    long: number;
    lat: number;
  };
  images: string[];
  nickname?: string;
  private: boolean;
}

interface CommentItem {
  comment_id: string;
  feed_id: string;
  writer: string;
  writer_nickname: string;
  content: string;
  comment_date: string;
}

interface FeedDetailProps {
  feed: FeedItem;
  onBack: () => void;
  token: string | null;
}

export default function FeedDetail({ feed, onBack, token }: FeedDetailProps) {
  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
  const { uid: currentUid } = useAuth();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  const [comments, setComments] = useState<CommentItem[]>([]);
  const [newComment, setNewComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [loadingComments, setLoadingComments] = useState(true);
  const [address, setAddress] = useState<string | null>(null);

  // Fetch Address from position
  useEffect(() => {
    const fetchAddress = async () => {
      const loc = feed.location as any;
      if (!loc || !token) return;

      const lat = loc.lat ?? loc.latitude;
      const long = loc.long ?? loc.lng ?? loc.longitude;

      if (
        lat == null ||
        long == null ||
        isNaN(Number(lat)) ||
        isNaN(Number(long))
      ) {
        return;
      }

      try {
        const response = await fetch(
          `${API_URL}/feed/address?lat=${lat}&long=${long}`,
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );
        if (response.ok) {
          const data = await response.json();
          if (data.result === "success") {
            const formatted = [data.sido_nm, data.sigungu_nm]
              .filter(Boolean)
              .join(" ");
            setAddress(formatted || null);
          }
        }
      } catch (err) {
        console.error("Failed to fetch address:", err);
      }
    };

    fetchAddress();
  }, [feed.location, token, API_URL]);

  const goToPrevious = () => {
    const isFirstImage = currentImageIndex === 0;
    const newIndex = isFirstImage
      ? imageUrls.length - 1
      : currentImageIndex - 1;
    setCurrentImageIndex(newIndex);
  };

  const goToNext = () => {
    const isLastImage = currentImageIndex === imageUrls.length - 1;
    const newIndex = isLastImage ? 0 : currentImageIndex + 1;
    setCurrentImageIndex(newIndex);
  };

  // 1. Fetch Feed Images
  useEffect(() => {
    const fetchImageUrls = async () => {
      if (feed.images && feed.images.length > 0 && token) {
        const urls = await Promise.all(
          feed.images.map(async (imageId) => {
            try {
              const response = await fetch(`${API_URL}/file/get/${imageId}`, {
                headers: {
                  Authorization: `Bearer ${token}`,
                },
              });
              if (!response.ok) {
                console.error(`Failed to fetch image: ${imageId}`);
                return "";
              }
              const blob = await response.blob();
              return URL.createObjectURL(blob);
            } catch (error) {
              console.error(`Error fetching image ${imageId}:`, error);
              return "";
            }
          })
        );
        setImageUrls(urls.filter((url) => url !== ""));
        setCurrentImageIndex(0);
      }
    };

    fetchImageUrls();

    return () => {
      imageUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [feed.images, token, API_URL]);

  // 2. Fetch Comments
  const fetchComments = async () => {
    if (!token || !feed.fid) return;
    setLoadingComments(true);
    try {
      const response = await fetch(`${API_URL}/comment/list/${feed.fid}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        const data = await response.json();
        if (data.result === "success" && Array.isArray(data.comments)) {
          setComments(data.comments);
        }
      }
    } catch (err) {
      console.error("Failed to fetch comments:", err);
    } finally {
      setLoadingComments(false);
    }
  };

  useEffect(() => {
    fetchComments();
  }, [feed.fid, token]);

  // 3. Add Comment
  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim() || !token || submitting) return;

    setSubmitting(true);
    try {
      const response = await fetch(`${API_URL}/comment/new`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          feed_id: feed.fid,
          content: newComment.trim(),
        }),
      });

      if (response.ok) {
        setNewComment("");
        await fetchComments();
      } else {
        console.error("Failed to add comment");
      }
    } catch (err) {
      console.error("Error adding comment:", err);
    } finally {
      setSubmitting(false);
    }
  };

  const [commentToDelete, setCommentToDelete] = useState<string | null>(null);
  const [showFeedDeleteModal, setShowFeedDeleteModal] = useState(false);
  const [deletingFeed, setDeletingFeed] = useState(false);

  // 4. Delete Comment
  const confirmDeleteComment = async () => {
    if (!token || !commentToDelete) return;
    try {
      const response = await fetch(`${API_URL}/comment/${commentToDelete}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        setComments((prev) =>
          prev.filter((c) => c.comment_id !== commentToDelete)
        );
      } else {
        console.error("Failed to delete comment");
      }
    } catch (err) {
      console.error("Error deleting comment:", err);
    } finally {
      setCommentToDelete(null);
    }
  };

  // 5. Delete Feed (Owner only)
  const confirmDeleteFeed = async () => {
    if (!token || !feed.fid || deletingFeed) return;
    setDeletingFeed(true);
    try {
      const response = await fetch(`${API_URL}/feed/delete?fid=${feed.fid}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        setShowFeedDeleteModal(false);
        onBack();
      } else {
        console.error("Failed to delete feed");
      }
    } catch (err) {
      console.error("Error deleting feed:", err);
    } finally {
      setDeletingFeed(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto bg-black m-3 p-2 text-white">
      <button
        onClick={onBack}
        className="mb-4 text-blue-400 hover:text-blue-300 transition-colors"
      >
        &larr; Back to list
      </button>

      {/* Author Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center">
          <div className="w-10 h-10 rounded-full bg-gray-700 border border-gray-600 mr-3 flex justify-center items-center">
            <span className="font-semibold text-gray-300">
              {(feed.nickname || feed.uid || "U").slice(0, 1).toUpperCase()}
            </span>
          </div>
          <div>
            <Link href={`/user/profile/${feed.uid}`}>
              <p className="font-semibold text-white hover:underline cursor-pointer">
                {feed.nickname || feed.uid}
              </p>
            </Link>
            <div className="flex flex-wrap items-center gap-1.5 text-xs text-gray-400 mt-0.5">
              <span>{formatLocalDate(feed.post_date)}</span>
              {address && (
                <>
                  <span>•</span>
                  <div className="flex items-center gap-1 text-blue-400 font-medium">
                    <MapPin className="w-3.5 h-3.5 shrink-0 text-blue-400" />
                    <span>{address}</span>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Delete Feed Button (Writer Only) */}
        {currentUid === feed.uid && (
          <button
            onClick={() => setShowFeedDeleteModal(true)}
            className="flex items-center gap-1 text-xs text-red-400 hover:text-red-300 bg-red-950/40 hover:bg-red-900/60 border border-red-800/60 px-3 py-1.5 rounded-lg transition-all cursor-pointer font-medium"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>피드 삭제</span>
          </button>
        )}
      </div>

      {/* Fixed aspect Image Frame */}
      {imageUrls.length > 0 && (
        <div className="relative w-full h-[360px] sm:h-[450px] mb-4 flex justify-center items-center bg-gray-950 rounded-xl overflow-hidden border border-gray-800 shadow-lg">
          {imageUrls.length > 1 && (
            <>
              <button
                onClick={goToPrevious}
                className="absolute left-3 z-10 bg-black/60 hover:bg-black/80 text-white p-2 rounded-full transition-all focus:outline-none"
                aria-label="Previous image"
              >
                &#10094;
              </button>
              <button
                onClick={goToNext}
                className="absolute right-3 z-10 bg-black/60 hover:bg-black/80 text-white p-2 rounded-full transition-all focus:outline-none"
                aria-label="Next image"
              >
                &#10095;
              </button>
              <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-1.5 z-10">
                {imageUrls.map((_, idx) => (
                  <span
                    key={idx}
                    className={`w-2 h-2 rounded-full transition-all ${
                      idx === currentImageIndex ? "bg-white w-4" : "bg-white/40"
                    }`}
                  />
                ))}
              </div>
            </>
          )}
          <img
            src={imageUrls[currentImageIndex]}
            alt={`feed-image-${currentImageIndex}`}
            className="w-full h-full object-contain select-none"
          />
        </div>
      )}

      {/* Feed Content */}
      <p className="mb-6 text-gray-200 leading-relaxed text-base">
        {feed.content}
      </p>

      {/* Comment Section Header */}
      <div className="border-t border-gray-800 pt-4 mt-6">
        <div className="flex items-center gap-2 mb-4 text-gray-300">
          <MessageSquare className="w-5 h-5 text-blue-400" />
          <h3 className="font-semibold text-lg">
            Comments ({comments.length})
          </h3>
        </div>

        {/* Comment List */}
        <div className="space-y-3 mb-6">
          {loadingComments ? (
            <p className="text-sm text-gray-500 py-2">Loading comments...</p>
          ) : comments.length === 0 ? (
            <p className="text-sm text-gray-500 py-2">
              No comments yet. Be the first to leave a comment!
            </p>
          ) : (
            comments.map((comment) => {
              const canDelete =
                currentUid === comment.writer || currentUid === feed.uid;
              return (
                <div
                  key={comment.comment_id}
                  className="bg-gray-900/70 border border-gray-800 p-3 rounded-lg flex justify-between items-start group"
                >
                  <div className="flex-1 min-w-0 pr-2">
                    <div className="flex items-center gap-2 mb-1">
                      <Link href={`/user/profile/${comment.writer}`}>
                        <span className="font-semibold text-sm text-gray-200 hover:underline cursor-pointer">
                          {comment.writer_nickname}
                        </span>
                      </Link>
                      <span className="text-xs text-gray-500">
                        {formatLocalDate(comment.comment_date)}
                      </span>
                    </div>
                    <p className="text-sm text-gray-300 break-words">
                      {comment.content}
                    </p>
                  </div>
                  {canDelete && (
                    <button
                      onClick={() => setCommentToDelete(comment.comment_id)}
                      className="text-gray-500 hover:text-red-400 p-1 transition-colors"
                      title="Delete comment"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Comment Input Form */}
        <form onSubmit={handleAddComment} className="flex gap-2">
          <input
            type="text"
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            placeholder="Add a comment..."
            className="flex-1 bg-gray-900 border border-gray-700 text-white text-sm rounded-lg px-4 py-2.5 focus:outline-none focus:border-blue-500 transition-colors"
          />
          <button
            type="submit"
            disabled={!newComment.trim() || submitting}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-4 py-2.5 rounded-lg flex items-center gap-1.5 transition-colors font-medium text-sm"
          >
            <Send className="w-4 h-4" />
            <span>Post</span>
          </button>
        </form>
      </div>

      {/* Delete Comment Confirmation Modal Popup */}
      {mounted &&
        commentToDelete &&
        createPortal(
          <div className="fixed inset-0 bg-black/75 backdrop-blur-xs z-[9999] flex items-center justify-center p-4">
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 max-w-sm w-full shadow-2xl space-y-4">
              <h4 className="text-lg font-bold text-white">댓글 삭제</h4>
              <p className="text-sm text-gray-300">
                정말로 이 댓글을 삭제하시겠습니까? 삭제된 댓글은 복구할 수
                없습니다.
              </p>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setCommentToDelete(null)}
                  className="px-4 py-2 text-sm rounded-lg bg-gray-800 text-gray-300 hover:bg-gray-700 transition-colors font-medium cursor-pointer"
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={confirmDeleteComment}
                  className="px-4 py-2 text-sm rounded-lg bg-red-600 hover:bg-red-700 text-white transition-colors font-medium shadow-md cursor-pointer"
                >
                  삭제
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* Delete Feed Confirmation Modal Popup */}
      {mounted &&
        showFeedDeleteModal &&
        createPortal(
          <div className="fixed inset-0 bg-black/75 backdrop-blur-xs z-[9999] flex items-center justify-center p-4">
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 max-w-sm w-full shadow-2xl space-y-4">
              <h4 className="text-lg font-bold text-white">피드 삭제</h4>
              <p className="text-sm text-gray-300">
                정말로 이 피드를 삭제하시겠습니까? 게시물 및 포함된 내용이 모두
                삭제됩니다.
              </p>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowFeedDeleteModal(false)}
                  className="px-4 py-2 text-sm rounded-lg bg-gray-800 text-gray-300 hover:bg-gray-700 transition-colors font-medium cursor-pointer"
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={confirmDeleteFeed}
                  disabled={deletingFeed}
                  className="px-4 py-2 text-sm rounded-lg bg-red-600 hover:bg-red-700 text-white transition-colors font-medium shadow-md cursor-pointer disabled:opacity-50"
                >
                  {deletingFeed ? "삭제 중..." : "삭제"}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
