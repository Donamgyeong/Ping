import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";

/**
 * Redirects to /user/login if the user is not authenticated.
 * Returns { loading } so pages can show a loading state while auth is resolving.
 */
export function useRequireAuth() {
  const { token, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !token) {
      router.replace("/user/login");
    }
  }, [loading, token, router]);

  return { loading, isAuthenticated: !!token };
}
