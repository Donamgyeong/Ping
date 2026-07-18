"use client";

import { useAuth } from '@/hooks/useAuth';
import { useState, useEffect } from 'react';
import Link from 'next/link';

interface ChatRoom {
    cid: string;
    title: string;
}

export default function ChatPage() {
    const { token } = useAuth();
    const [chatRooms, setChatRooms] = useState<ChatRoom[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const API_URL = process.env.API_URL || "http://localhost:8000";

    useEffect(() => {
        if (token) {
            const fetchChatRooms = async () => {
                try {
                    const response = await fetch(`${API_URL}/chat/rooms`, {
                        headers: {
                            'Authorization': `Bearer ${token}`,
                        },
                    });

                    if (!response.ok) {
                        throw new Error('Failed to fetch chat rooms');
                    }

                    const data = await response.json();
                    if (data.result === 'success' && data.chatrooms) {
                        setChatRooms(data.chatrooms);
                    } else {
                        throw new Error('Failed to parse chat rooms');
                    }
                } catch (err: any) {
                    setError(err.message);
                } finally {
                    setLoading(false);
                }
            };

            fetchChatRooms();
        } else {
            setLoading(false);
        }
    }, [token, API_URL]);

    if (loading) {
        return <div className="max-w-screen-xl mx-auto p-4"><p>Loading chat rooms...</p></div>;
    }

    if (error) {
        return <div className="max-w-screen-xl mx-auto p-4"><p className="text-red-500">{error}</p></div>;
    }

    if (!token) {
        return (
            <div className="max-w-screen-xl mx-auto p-4">
                <p>Please log in to see your chat rooms.</p>
                <Link href="/user/login" className="text-blue-500 hover:underline">
                    Log In
                </Link>
            </div>
        );
    }

    return (
        <div className="max-w-screen-xl mx-auto p-4">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-3xl font-bold">Chat Rooms</h1>
                <Link href="/chat/new">
                    <div className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600">
                        New Chat
                    </div>
                </Link>
            </div>
            {chatRooms.length > 0 ? (
                <div className="space-y-2 max-w-lg mx-auto">
                    {chatRooms.map(room => (
                        <Link key={room.cid} href={`/chat/${room.cid}`}>
                           <div className="block p-4 border rounded-lg bg-gray hover:bg-gray-50 cursor-pointer">
                                <h3 className="font-semibold">{room.title}</h3>
                            </div>
                        </Link>
                    ))}
                </div>
            ) : (
                <p>You have no chat rooms.</p>
            )}
        </div>
    );
}
