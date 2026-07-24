"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import {
  User as UserIcon,
  Mail,
  Lock,
  ArrowLeft,
  CheckCircle,
  AlertCircle,
  Save,
  Camera,
  FileText,
} from "lucide-react";

export default function EditProfilePage() {
  const { token, uid, loading: authLoading, authFetch } = useAuth();
  const router = useRouter();

  // Profile state
  const [nickname, setNickname] = useState("");
  const [email, setEmail] = useState("");
  const [bio, setBio] = useState("");
  const [profilePictureId, setProfilePictureId] = useState<string | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [initialLoaded, setInitialLoaded] = useState(false);
  const fetchedRef = useRef(false);

  // Password fields
  const [prevPassword, setPrevPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // Status state alerts
  const [pictureMessage, setPictureMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [bioMessage, setBioMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [nicknameMessage, setNicknameMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [emailMessage, setEmailMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [passwordMessage, setPasswordMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const [uploadingPicture, setUploadingPicture] = useState(false);
  const [savingBio, setSavingBio] = useState(false);
  const [savingNickname, setSavingNickname] = useState(false);
  const [savingEmail, setSavingEmail] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

  // Redirect if not logged in
  useEffect(() => {
    if (!authLoading && !token) {
      router.push("/user/login");
    }
  }, [token, authLoading, router]);

  // Load initial profile data
  useEffect(() => {
    if (token && uid && !fetchedRef.current) {
      fetchedRef.current = true;
      authFetch(`${API_URL}/user/profile/${uid}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.result === "success" || data.nickname) {
            if (data.nickname) setNickname(data.nickname);
            if (data.email) setEmail(data.email);
            if (data.bio) setBio(data.bio);
            if (data.profile_picture) {
              setProfilePictureId(data.profile_picture);
              fetch(`${API_URL}/file/get/${data.profile_picture}`, {
                headers: { Authorization: `Bearer ${token}` },
              })
                .then((res) => (res.ok ? res.blob() : null))
                .then((blob) => {
                  if (blob) {
                    setAvatarPreview(URL.createObjectURL(blob));
                  }
                })
                .catch(() => {});
            }
          }
        })
        .catch((err) => {
          console.error("Failed to load user profile:", err);
          fetchedRef.current = false;
        })
        .finally(() => {
          setInitialLoaded(true);
        });
    }
  }, [token, uid, API_URL, authFetch]);

  // Handle Profile Picture File Change
  const handlePictureChange = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file || !token) return;

    setPictureMessage(null);
    setUploadingPicture(true);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("private", "false");

      const uploadRes = await fetch(`${API_URL}/file/upload`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      if (!uploadRes.ok) throw new Error("Failed to upload image file.");
      const uploadData = await uploadRes.json();

      if (uploadData.result === "success" && uploadData.id) {
        const fileId = uploadData.id;

        const updateRes = await authFetch(
          `${API_URL}/user/update/picture?profile_picture=${encodeURIComponent(
            fileId
          )}`,
          { method: "POST" }
        );

        const updateData = await updateRes.json();
        if (updateRes.ok && updateData.result === "success") {
          setProfilePictureId(fileId);
          setAvatarPreview(URL.createObjectURL(file));
          setPictureMessage({
            type: "success",
            text: "Profile picture updated successfully!",
          });
        } else {
          throw new Error(updateData.detail || "Failed to update profile picture.");
        }
      } else {
        throw new Error("File upload response missing ID.");
      }
    } catch (err: any) {
      setPictureMessage({ type: "error", text: err.message });
    } finally {
      setUploadingPicture(false);
    }
  };

  // Update Bio
  const handleUpdateBio = async (e: React.FormEvent) => {
    e.preventDefault();
    setBioMessage(null);
    setSavingBio(true);

    try {
      const response = await authFetch(
        `${API_URL}/user/update/bio?bio=${encodeURIComponent(bio.trim())}`,
        { method: "POST" }
      );

      const data = await response.json();
      if (response.ok && data.result === "success") {
        setBioMessage({
          type: "success",
          text: "Bio updated successfully!",
        });
      } else {
        throw new Error(data.detail || "Failed to update bio.");
      }
    } catch (err: any) {
      setBioMessage({ type: "error", text: err.message });
    } finally {
      setSavingBio(false);
    }
  };

  // Update Nickname
  const handleUpdateNickname = async (e: React.FormEvent) => {
    e.preventDefault();
    setNicknameMessage(null);
    if (!nickname.trim()) {
      setNicknameMessage({ type: "error", text: "Please enter a valid nickname." });
      return;
    }

    setSavingNickname(true);
    try {
      const response = await authFetch(
        `${API_URL}/user/update/nickname?nickname=${encodeURIComponent(
          nickname.trim()
        )}`,
        { method: "POST" }
      );

      const data = await response.json();
      if (response.ok && data.result === "success") {
        setNicknameMessage({
          type: "success",
          text: "Nickname updated successfully!",
        });
      } else {
        throw new Error(data.detail || "Failed to update nickname.");
      }
    } catch (err: any) {
      setNicknameMessage({ type: "error", text: err.message });
    } finally {
      setSavingNickname(false);
    }
  };

  // Update Email
  const handleUpdateEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmailMessage(null);
    if (!email.trim()) {
      setEmailMessage({ type: "error", text: "Please enter a valid email." });
      return;
    }

    setSavingEmail(true);
    try {
      const response = await authFetch(
        `${API_URL}/user/update/email?email=${encodeURIComponent(email.trim())}`,
        { method: "POST" }
      );

      const data = await response.json();
      if (response.ok && data.result === "success") {
        setEmailMessage({
          type: "success",
          text: "Email updated successfully!",
        });
      } else {
        throw new Error(data.detail || "Failed to update email.");
      }
    } catch (err: any) {
      setEmailMessage({ type: "error", text: err.message });
    } finally {
      setSavingEmail(false);
    }
  };

  // Update Password
  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordMessage(null);

    if (!prevPassword) {
      setPasswordMessage({
        type: "error",
        text: "Current password is required.",
      });
      return;
    }
    if (newPassword.length < 4) {
      setPasswordMessage({
        type: "error",
        text: "New password must be at least 4 characters.",
      });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordMessage({
        type: "error",
        text: "New passwords do not match.",
      });
      return;
    }

    setSavingPassword(true);
    try {
      const response = await authFetch(
        `${API_URL}/user/update/password?prev_pwd=${encodeURIComponent(
          prevPassword
        )}&new_pwd=${encodeURIComponent(newPassword)}`,
        { method: "POST" }
      );

      const data = await response.json();
      if (response.ok && data.result === "success") {
        setPasswordMessage({
          type: "success",
          text: "Password changed successfully!",
        });
        setPrevPassword("");
        setNewPassword("");
        setConfirmPassword("");
      } else {
        throw new Error(data.detail || "Failed to update password.");
      }
    } catch (err: any) {
      setPasswordMessage({ type: "error", text: err.message });
    } finally {
      setSavingPassword(false);
    }
  };

  if (authLoading || !token) return null;

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-black text-white p-4 sm:p-6 flex justify-center">
      <div className="w-full max-w-xl space-y-6">
        {/* Top Navigation */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => (uid ? router.push(`/user/profile/${uid}`) : router.back())}
            className="p-2 text-gray-400 hover:text-white bg-gray-900 border border-gray-800 rounded-xl transition-all cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight">
              Edit Profile
            </h1>
            <p className="text-xs text-gray-400">
              Manage your personal information, avatar, and settings
            </p>
          </div>
        </div>

        {/* Profile Picture Card */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 shadow-2xl space-y-4">
          <h2 className="text-sm font-semibold text-gray-200 flex items-center gap-2 border-b border-gray-800 pb-3">
            <Camera className="w-4 h-4 text-blue-500" />
            <span>Profile Picture</span>
          </h2>

          <div className="flex flex-col sm:flex-row items-center gap-6">
            <div className="relative group w-24 h-24 rounded-full overflow-hidden bg-gray-800 border-2 border-gray-700 flex items-center justify-center shrink-0 shadow-lg">
              {avatarPreview ? (
                <img
                  src={avatarPreview}
                  alt="Profile Avatar"
                  className="w-full h-full object-cover"
                />
              ) : (
                <UserIcon className="w-12 h-12 text-gray-400" />
              )}
              <label
                htmlFor="profile-picture-input-alt"
                className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center cursor-pointer text-white text-[11px] font-medium"
              >
                <Camera className="w-5 h-5 mb-0.5" />
                <span>Change</span>
              </label>
              <input
                id="profile-picture-input-alt"
                type="file"
                accept="image/*"
                onChange={handlePictureChange}
                className="hidden"
                disabled={uploadingPicture}
              />
            </div>

            <div className="flex-1 text-center sm:text-left space-y-2">
              <p className="text-xs text-gray-300">
                Upload a new avatar. Recommended size is 250x250px (JPG, PNG, GIF).
              </p>
              <label
                htmlFor="profile-picture-input-alt"
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-xl text-xs font-semibold border border-gray-700 transition-all cursor-pointer"
              >
                <Camera className="w-3.5 h-3.5 text-blue-400" />
                <span>{uploadingPicture ? "Uploading..." : "Upload New Photo"}</span>
              </label>
            </div>
          </div>

          {pictureMessage && (
            <div
              className={`flex items-center gap-2 p-3 rounded-xl text-xs border ${
                pictureMessage.type === "success"
                  ? "bg-green-950/40 border-green-800/60 text-green-300"
                  : "bg-red-950/40 border-red-800/60 text-red-300"
              }`}
            >
              {pictureMessage.type === "success" ? (
                <CheckCircle className="w-4 h-4 text-green-400 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
              )}
              <span>{pictureMessage.text}</span>
            </div>
          )}
        </div>

        {/* Bio Card */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 shadow-2xl space-y-4">
          <h2 className="text-sm font-semibold text-gray-200 flex items-center gap-2 border-b border-gray-800 pb-3">
            <FileText className="w-4 h-4 text-blue-500" />
            <span>Bio / About Me</span>
          </h2>

          <form onSubmit={handleUpdateBio} className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">
                Bio
              </label>
              <textarea
                rows={3}
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="Tell us a little bit about yourself..."
                className="w-full px-4 py-2.5 bg-gray-950 border border-gray-800 rounded-xl text-white text-sm focus:outline-none focus:border-blue-500 transition-colors"
              />
            </div>

            {bioMessage && (
              <div
                className={`flex items-center gap-2 p-3 rounded-xl text-xs border ${
                  bioMessage.type === "success"
                    ? "bg-green-950/40 border-green-800/60 text-green-300"
                    : "bg-red-950/40 border-red-800/60 text-red-300"
                }`}
              >
                {bioMessage.type === "success" ? (
                  <CheckCircle className="w-4 h-4 text-green-400 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                )}
                <span>{bioMessage.text}</span>
              </div>
            )}

            <div className="flex justify-end pt-1">
              <button
                type="submit"
                disabled={savingBio}
                className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-xl text-xs font-semibold transition-all shadow-md cursor-pointer"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{savingBio ? "Saving..." : "Save Bio"}</span>
              </button>
            </div>
          </form>
        </div>

        {/* Section 1: Nickname */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 shadow-2xl space-y-4">
          <h2 className="text-sm font-semibold text-gray-200 flex items-center gap-2 border-b border-gray-800 pb-3">
            <UserIcon className="w-4 h-4 text-blue-500" />
            <span>Change Nickname</span>
          </h2>

          <form onSubmit={handleUpdateNickname} className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">
                Nickname
              </label>
              <input
                type="text"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder="Enter your new nickname"
                className="w-full px-4 py-2.5 bg-gray-950 border border-gray-800 rounded-xl text-white text-sm focus:outline-none focus:border-blue-500 transition-colors"
              />
            </div>

            {nicknameMessage && (
              <div
                className={`flex items-center gap-2 p-3 rounded-xl text-xs border ${
                  nicknameMessage.type === "success"
                    ? "bg-green-950/40 border-green-800/60 text-green-300"
                    : "bg-red-950/40 border-red-800/60 text-red-300"
                }`}
              >
                {nicknameMessage.type === "success" ? (
                  <CheckCircle className="w-4 h-4 text-green-400 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                )}
                <span>{nicknameMessage.text}</span>
              </div>
            )}

            <div className="flex justify-end pt-1">
              <button
                type="submit"
                disabled={savingNickname || !nickname.trim()}
                className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-xl text-xs font-semibold transition-all shadow-md cursor-pointer"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{savingNickname ? "Saving..." : "Save Nickname"}</span>
              </button>
            </div>
          </form>
        </div>

        {/* Section 2: Email */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 shadow-2xl space-y-4">
          <h2 className="text-sm font-semibold text-gray-200 flex items-center gap-2 border-b border-gray-800 pb-3">
            <Mail className="w-4 h-4 text-blue-500" />
            <span>Change Email</span>
          </h2>

          <form onSubmit={handleUpdateEmail} className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">
                Email Address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                className="w-full px-4 py-2.5 bg-gray-950 border border-gray-800 rounded-xl text-white text-sm focus:outline-none focus:border-blue-500 transition-colors"
              />
            </div>

            {emailMessage && (
              <div
                className={`flex items-center gap-2 p-3 rounded-xl text-xs border ${
                  emailMessage.type === "success"
                    ? "bg-green-950/40 border-green-800/60 text-green-300"
                    : "bg-red-950/40 border-red-800/60 text-red-300"
                }`}
              >
                {emailMessage.type === "success" ? (
                  <CheckCircle className="w-4 h-4 text-green-400 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                )}
                <span>{emailMessage.text}</span>
              </div>
            )}

            <div className="flex justify-end pt-1">
              <button
                type="submit"
                disabled={savingEmail || !email.trim()}
                className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-xl text-xs font-semibold transition-all shadow-md cursor-pointer"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{savingEmail ? "Saving..." : "Save Email"}</span>
              </button>
            </div>
          </form>
        </div>

        {/* Section 3: Password */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 shadow-2xl space-y-4">
          <h2 className="text-sm font-semibold text-gray-200 flex items-center gap-2 border-b border-gray-800 pb-3">
            <Lock className="w-4 h-4 text-blue-500" />
            <span>Change Password</span>
          </h2>

          <form onSubmit={handleUpdatePassword} className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">
                Current Password
              </label>
              <input
                type="password"
                value={prevPassword}
                onChange={(e) => setPrevPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-4 py-2.5 bg-gray-950 border border-gray-800 rounded-xl text-white text-sm focus:outline-none focus:border-blue-500 transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">
                New Password
              </label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-4 py-2.5 bg-gray-950 border border-gray-800 rounded-xl text-white text-sm focus:outline-none focus:border-blue-500 transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">
                Confirm New Password
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-4 py-2.5 bg-gray-950 border border-gray-800 rounded-xl text-white text-sm focus:outline-none focus:border-blue-500 transition-colors"
              />
            </div>

            {passwordMessage && (
              <div
                className={`flex items-center gap-2 p-3 rounded-xl text-xs border ${
                  passwordMessage.type === "success"
                    ? "bg-green-950/40 border-green-800/60 text-green-300"
                    : "bg-red-950/40 border-red-800/60 text-red-300"
                }`}
              >
                {passwordMessage.type === "success" ? (
                  <CheckCircle className="w-4 h-4 text-green-400 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                )}
                <span>{passwordMessage.text}</span>
              </div>
            )}

            <div className="flex justify-end pt-1">
              <button
                type="submit"
                disabled={
                  savingPassword ||
                  !prevPassword ||
                  !newPassword ||
                  !confirmPassword
                }
                className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-xl text-xs font-semibold transition-all shadow-md cursor-pointer"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{savingPassword ? "Updating..." : "Update Password"}</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
