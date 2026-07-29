"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";

export default function ProfilePage() {
  const { token, uid } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!token) {
      router.push("/user/login");
    } else if (uid) {
      router.replace(`/user/profile/${uid}`);
    }
  }, [token, uid, router]);

  return (
    <div className="flex justify-center items-center min-h-[calc(100vh-4rem)] bg-black text-gray-500 text-sm">
      Loading profile...
    </div>
  );
}
