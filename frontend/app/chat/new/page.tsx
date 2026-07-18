"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface Follower {
    uid: string;
    nickname: string;
}

export default function NewChatPage() {
    const [title, setTitle] = useState('');
    const [selectedParticipants, setSelectedParticipants] = useState<string[]>([]);
    const [followers, setFollowers] = useState<Follower[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [token, setToken] = useState<string | null>(null);
    const router = useRouter();

    const API_URL = process.env.API_URL || "http://localhost:8000";

    useEffect(() => {
        const storedToken = localStorage.getItem("token");
        if (storedToken) {
            setToken(storedToken);
        } else {
            router.push('/user/login');
        }
    }, [router]);

    useEffect(() => {
        if (token) {
            const fetchFollowers = async () => {
                try {
                    const response = await fetch(`${API_URL}/user/following`, {
                        headers: {
                            'Authorization': `Bearer ${token}`,
                        },
                    });

                    if (!response.ok) {
                        throw new Error('Failed to fetch followers');
                    }

                    const data = await response.json();
                    if (data.result === 'success' && data.following) {
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
        setSelectedParticipants(prev =>
            prev.includes(uid) ? prev.filter(p => p !== uid) : [...prev, uid]
        );
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        if (!title || selectedParticipants.length === 0) {
            setError('Title and at least one participant are required.');
            return;
        }

        try {
            const response = await fetch(`${API_URL}/chat/new`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                },
                body: JSON.stringify({
                    title: title,
                    participants: selectedParticipants,
                }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.detail || 'Failed to create chat room');
            }

            const data = await response.json();

            if (data.result === 'success' && data.id) {
                router.push(`/chat/${data.id}`);
            } else {
                throw new Error('Failed to get chat room ID from response');
            }

        } catch (err: any) {
            setError(err.message);
        }
    };

    if (!token) {
        return null;
    }

    return (
        <div className="max-w-lg mx-auto p-4">
            <h1 className="text-3xl font-bold mb-6">Create New Chat Room</h1>
            <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                    <label htmlFor="title" className="block text-sm font-medium text-gray-300">
                        Chat Title
                    </label>
                    <input
                        type="text"
                        id="title"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        className="mt-1 block w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-md text-white focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                        required
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-300">
                        Participants
                    </label>
                    {loading ? (
                        <p>Loading followers...</p>
                    ) : (
                        <div className="mt-2 space-y-2 border border-gray-600 rounded-md p-4 max-h-60 overflow-y-auto">
                            {followers.length > 0 ? followers.map(follower => (
                                <div key={follower.uid} className="flex items-center">
                                    <input
                                        type="checkbox"
                                        id={`follower-${follower.uid}`}
                                        checked={selectedParticipants.includes(follower.uid)}
                                        onChange={() => handleParticipantChange(follower.uid)}
                                        className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                    />
                                    <label htmlFor={`follower-${follower.uid}`} className="ml-3 block text-sm font-medium text-gray-300">
                                        {follower.nickname}
                                    </label>
                                </div>
                            )) : <p>No followers found.</p>}
                        </div>
                    )}
                </div>
                {error && <p className="text-red-500 text-sm">{error}</p>}
                <button
                    type="submit"
                    className="w-full px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:bg-gray-500"
                    disabled={!title || selectedParticipants.length === 0}
                >
                    Create Chat
                </button>
            </form>
        </div>
    );
}
