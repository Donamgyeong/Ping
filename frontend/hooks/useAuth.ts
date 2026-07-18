"use client";

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';

export const useAuth = () => {
    const [token, setToken] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const router = useRouter();

    const logout = useCallback(() => {
        localStorage.removeItem('token');
        localStorage.removeItem('tokenExpiration');
        setToken(null);
        router.push('/user/login');
    }, [router]);

    useEffect(() => {
        const storedToken = localStorage.getItem('token');
        const tokenExpiration = localStorage.getItem('tokenExpiration');
        
        if (storedToken && tokenExpiration) {
            const expirationTime = parseInt(tokenExpiration, 10);
            if (new Date().getTime() > expirationTime) {
                logout();
            } else {
                setToken(storedToken);
            }
        }
        setLoading(false);
    }, [logout]);

    return { token, logout, loading };
};
