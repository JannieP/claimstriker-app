'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { Shield, AlertTriangle } from 'lucide-react';

interface User {
  id: string;
  email: string;
  name: string | null;
  role: 'USER' | 'ADMIN' | 'SUPER_ADMIN';
  permissions: string[];
}

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      router.push('/login');
      return;
    }

    api.setToken(token);

    api
      .getMe()
      .then((response) => {
        if (response.success && response.data) {
          const userData = response.data as User;
          if (userData.role !== 'ADMIN' && userData.role !== 'SUPER_ADMIN') {
            setError('Access denied. Admin privileges required.');
          } else {
            setUser(userData);
          }
        } else {
          throw new Error('Failed to get user');
        }
      })
      .catch(() => {
        setError('Failed to verify permissions');
      })
      .finally(() => {
        setLoading(false);
      });
  }, [router]);

  if (loading) {
    return (
      <div className="min-h-[400px] flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-[400px] flex items-center justify-center">
        <div className="text-center">
          <div className="mx-auto h-12 w-12 rounded-full bg-red-100 flex items-center justify-center mb-4">
            <AlertTriangle className="h-6 w-6 text-red-600" />
          </div>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">
            Access Denied
          </h2>
          <p className="text-gray-500 mb-4">{error}</p>
          <button
            onClick={() => router.push('/dashboard')}
            className="text-primary hover:text-primary/80 font-medium"
          >
            Return to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-2">
          <Shield className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold">Admin Panel</h1>
        </div>
        <p className="text-gray-500">
          Manage users, channels, and system settings
        </p>
      </div>
      {children}
    </div>
  );
}
