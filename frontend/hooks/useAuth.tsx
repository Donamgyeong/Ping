"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
  useCallback,
} from "react";
import { useRouter } from "next/navigation";
import { jwtDecode } from "jwt-decode";

interface JwtPayload {
  sub?: string;
  exp?: number;
}

interface AuthContextType {
  token: string | null;
  refreshToken: string | null;
  uid: string | null;
  loading: boolean;
  login: (accessToken: string, refreshToken?: string) => Promise<void>;
  logout: () => void;
  refreshAccessToken: () => Promise<string | null>;
  authFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const isTokenExpired = (token: string, bufferSeconds = 0): boolean => {
  try {
    const decoded = jwtDecode<JwtPayload>(token);
    if (!decoded.exp) return false;
    return decoded.exp * 1000 - bufferSeconds * 1000 <= Date.now();
  } catch {
    return true;
  }
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState<string | null>(null);
  const [uid, setUid] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const logout = useCallback(() => {
    localStorage.removeItem("token");
    localStorage.removeItem("refreshToken");
    localStorage.removeItem("uid");
    setToken(null);
    setRefreshToken(null);
    setUid(null);
    router.push("/user/login");
  }, [router]);

  const refreshAccessToken = useCallback(async (): Promise<string | null> => {
    const currentRefreshToken =
      localStorage.getItem("refreshToken") || refreshToken;
    if (!currentRefreshToken || isTokenExpired(currentRefreshToken)) {
      logout();
      return null;
    }

    try {
      const response = await fetch(`${API_URL}/auth/refresh`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${currentRefreshToken}`,
        },
        body: JSON.stringify({ refresh_token: currentRefreshToken }),
      });

      if (!response.ok) {
        throw new Error("Token refresh failed");
      }

      const data = await response.json();
      const newAccessToken = data.access_token;
      const newRefreshToken = data.refresh_token || currentRefreshToken;

      localStorage.setItem("token", newAccessToken);
      localStorage.setItem("refreshToken", newRefreshToken);
      setToken(newAccessToken);
      setRefreshToken(newRefreshToken);

      return newAccessToken;
    } catch (error) {
      console.error("Failed to refresh access token:", error);
      logout();
      return null;
    }
  }, [refreshToken, logout]);

  useEffect(() => {
    const initializeAuth = async () => {
      const storedToken = localStorage.getItem("token");
      const storedRefreshToken = localStorage.getItem("refreshToken");
      const storedUid = localStorage.getItem("uid");

      if (storedRefreshToken) {
        setRefreshToken(storedRefreshToken);
      }

      if (storedToken) {
        if (isTokenExpired(storedToken)) {
          if (storedRefreshToken && !isTokenExpired(storedRefreshToken)) {
            const newToken = await refreshAccessToken();
            if (newToken && storedUid) {
              setUid(storedUid);
            }
          } else {
            logout();
          }
        } else {
          setToken(storedToken);
          if (storedUid) {
            setUid(storedUid);
          }
        }
      }
      setLoading(false);
    };

    initializeAuth();
  }, [refreshAccessToken, logout]);

  useEffect(() => {
    if (!token) return;

    try {
      const decoded = jwtDecode<JwtPayload>(token);
      if (decoded.exp) {
        const refreshTimeMs = decoded.exp * 1000 - 30000 - Date.now();
        const timeoutDelay = Math.max(refreshTimeMs, 0);

        const timer = setTimeout(async () => {
          const currentRefresh =
            localStorage.getItem("refreshToken") || refreshToken;
          if (currentRefresh && !isTokenExpired(currentRefresh)) {
            await refreshAccessToken();
          } else {
            logout();
          }
        }, timeoutDelay);

        return () => clearTimeout(timer);
      }
    } catch {
      logout();
    }
  }, [token, refreshToken, refreshAccessToken, logout]);

  const login = async (newAccessToken: string, newRefreshToken?: string) => {
    try {
      const response = await fetch(`${API_URL}/user/me`, {
        headers: { Authorization: `Bearer ${newAccessToken}` },
      });
      if (!response.ok) {
        throw new Error("Failed to fetch user data after login");
      }
      const userData = await response.json();
      const newUid = userData.id;

      localStorage.setItem("token", newAccessToken);
      if (newRefreshToken) {
        localStorage.setItem("refreshToken", newRefreshToken);
        setRefreshToken(newRefreshToken);
      }
      localStorage.setItem("uid", newUid);

      setToken(newAccessToken);
      setUid(newUid);
    } catch (error) {
      console.error(error);
    }
  };

  const authFetch = useCallback(
    async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      let currentToken = token || localStorage.getItem("token");

      if (currentToken && isTokenExpired(currentToken)) {
        currentToken = await refreshAccessToken();
      }

      const headers = new Headers(init?.headers || {});
      if (currentToken) {
        headers.set("Authorization", `Bearer ${currentToken}`);
      }

      let response = await fetch(input, { ...init, headers });

      if (response.status === 401) {
        const newToken = await refreshAccessToken();
        if (newToken) {
          headers.set("Authorization", `Bearer ${newToken}`);
          response = await fetch(input, { ...init, headers });
        }
      }

      return response;
    },
    [token, refreshAccessToken]
  );

  const value = {
    token,
    refreshToken,
    uid,
    loading,
    login,
    logout,
    refreshAccessToken,
    authFetch,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}