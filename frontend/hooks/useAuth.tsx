"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react";
import { useRouter } from "next/navigation";

interface AuthContextType {
  token: string | null;
  uid: string | null;
  loading: boolean;
  login: (token: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [uid, setUid] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const storedToken = localStorage.getItem("token");
    const storedUid = localStorage.getItem("uid");
    if (storedToken) {
      setToken(storedToken);
      if (storedUid) {
        setUid(storedUid);
      }
    }
    setLoading(false);
  }, []);

    const login = async (newToken: string) => {
    try {
      const response = await fetch(`${API_URL}/user/me`, {
        headers: { Authorization: `Bearer ${newToken}` },
      });
      if (!response.ok) {
        throw new Error("Failed to fetch user data after login");
      }
      const userData = await response.json();
      const newUid = userData.id;

      localStorage.setItem("token", newToken);
      localStorage.setItem("uid", newUid);
      setToken(newToken);
      setUid(newUid);
    } catch (error) {
      console.error(error);
      // Handle login failure if needed
    }
  };

  const logout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("uid");
    setToken(null);
    setUid(null);
    router.push("/user/login");
  };

  const value = { token, uid, loading, login, logout };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}