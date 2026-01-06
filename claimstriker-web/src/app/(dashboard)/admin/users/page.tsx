'use client';

import { useEffect, useState, useCallback } from 'react';
import { api, AdminUser } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Users,
  Search,
  ChevronLeft,
  ChevronRight,
  Crown,
  Shield,
  User,
  CheckCircle,
  Mail,
  MailX,
  Trash2,
  MoreVertical,
  Youtube,
} from 'lucide-react';

interface CurrentUser {
  id: string;
  role: 'USER' | 'ADMIN' | 'SUPER_ADMIN';
  permissions: string[];
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [actionMenuOpen, setActionMenuOpen] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await api.getAdminUsers({
        page,
        limit: 20,
        search: search || undefined,
      });

      if (response.success && response.data) {
        setUsers(response.data.users);
        setPagination(response.data.pagination);
      } else {
        throw new Error('Failed to load users');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load users');
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      api.setToken(token);
    }

    // Get current user permissions
    api.getMe().then((response) => {
      if (response.success && response.data) {
        setCurrentUser(response.data as CurrentUser);
      }
    });
  }, []);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    loadUsers();
  };

  const canManageRoles = currentUser?.role === 'SUPER_ADMIN';
  const canDeleteUsers = currentUser?.role === 'SUPER_ADMIN';
  const canEditUsers =
    currentUser?.role === 'ADMIN' || currentUser?.role === 'SUPER_ADMIN';

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'SUPER_ADMIN':
        return <Crown className="h-4 w-4 text-yellow-600" />;
      case 'ADMIN':
        return <Shield className="h-4 w-4 text-purple-600" />;
      default:
        return <User className="h-4 w-4 text-gray-600" />;
    }
  };

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'SUPER_ADMIN':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
            <Crown className="h-3 w-3" />
            Super Admin
          </span>
        );
      case 'ADMIN':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
            <Shield className="h-3 w-3" />
            Admin
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
            <User className="h-3 w-3" />
            User
          </span>
        );
    }
  };

  const handleChangeRole = async (
    userId: string,
    newRole: 'USER' | 'ADMIN' | 'SUPER_ADMIN'
  ) => {
    if (!canManageRoles) return;

    setActionLoading(userId);
    try {
      const response = await api.updateAdminUserRole(userId, newRole);
      if (response.success) {
        // Reload users to get updated data
        await loadUsers();
      } else {
        alert('Failed to change role');
      }
    } catch (err: any) {
      alert(err.message || 'Failed to change role');
    } finally {
      setActionLoading(null);
      setActionMenuOpen(null);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (!canDeleteUsers) return;

    if (
      !confirm(
        'Are you sure you want to delete this user? This action cannot be undone.'
      )
    ) {
      return;
    }

    setActionLoading(userId);
    try {
      const response = await api.deleteAdminUser(userId);
      if (response.success) {
        await loadUsers();
      } else {
        alert('Failed to delete user');
      }
    } catch (err: any) {
      alert(err.message || 'Failed to delete user');
    } finally {
      setActionLoading(null);
      setActionMenuOpen(null);
    }
  };

  const handleToggleEmailVerified = async (
    userId: string,
    currentVerified: boolean
  ) => {
    if (!canEditUsers) return;

    setActionLoading(userId);
    try {
      const response = await api.updateAdminUser(userId, {
        emailVerified: !currentVerified,
      });
      if (response.success) {
        await loadUsers();
      } else {
        alert('Failed to update user');
      }
    } catch (err: any) {
      alert(err.message || 'Failed to update user');
    } finally {
      setActionLoading(null);
      setActionMenuOpen(null);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <CardTitle className="text-lg flex items-center gap-2">
              <Users className="h-5 w-5" />
              User Management
            </CardTitle>

            <form onSubmit={handleSearch} className="flex gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  type="text"
                  placeholder="Search by email or name..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-10 w-64"
                />
              </div>
              <Button type="submit" variant="outline">
                Search
              </Button>
            </form>
          </div>
        </CardHeader>
        <CardContent>
          {loading && users.length === 0 ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : error ? (
            <div className="text-center py-8">
              <p className="text-red-500">{error}</p>
              <Button onClick={loadUsers} variant="outline" className="mt-4">
                Retry
              </Button>
            </div>
          ) : users.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-500">No users found</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-3 px-4 font-medium text-gray-500">
                        User
                      </th>
                      <th className="text-left py-3 px-4 font-medium text-gray-500">
                        Role
                      </th>
                      <th className="text-left py-3 px-4 font-medium text-gray-500">
                        Status
                      </th>
                      <th className="text-left py-3 px-4 font-medium text-gray-500">
                        Channels
                      </th>
                      <th className="text-left py-3 px-4 font-medium text-gray-500">
                        Joined
                      </th>
                      <th className="text-right py-3 px-4 font-medium text-gray-500">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((user) => (
                      <tr
                        key={user.id}
                        className="border-b last:border-0 hover:bg-gray-50"
                      >
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                              <span className="text-sm font-medium text-primary">
                                {user.name?.[0] || user.email[0].toUpperCase()}
                              </span>
                            </div>
                            <div>
                              <p className="font-medium">
                                {user.name || 'Unnamed'}
                              </p>
                              <p className="text-sm text-gray-500">
                                {user.email}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-4">{getRoleBadge(user.role)}</td>
                        <td className="py-3 px-4">
                          <div className="flex flex-col gap-1">
                            {user.emailVerified ? (
                              <span className="inline-flex items-center gap-1 text-xs text-green-600">
                                <Mail className="h-3 w-3" />
                                Verified
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-xs text-orange-600">
                                <MailX className="h-3 w-3" />
                                Unverified
                              </span>
                            )}
                            {user.hasPartnerAccess && (
                              <span className="inline-flex items-center gap-1 text-xs text-green-600">
                                <CheckCircle className="h-3 w-3" />
                                Partner
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-1">
                            <Youtube className="h-4 w-4 text-red-600" />
                            <span>{user.channelCount}</span>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-sm text-gray-500">
                          {new Date(user.createdAt).toLocaleDateString()}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="relative inline-block">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() =>
                                setActionMenuOpen(
                                  actionMenuOpen === user.id ? null : user.id
                                )
                              }
                              disabled={
                                actionLoading === user.id ||
                                user.id === currentUser?.id
                              }
                            >
                              {actionLoading === user.id ? (
                                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
                              ) : (
                                <MoreVertical className="h-4 w-4" />
                              )}
                            </Button>

                            {actionMenuOpen === user.id && (
                              <>
                                <div
                                  className="fixed inset-0 z-10"
                                  onClick={() => setActionMenuOpen(null)}
                                />
                                <div className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg border z-20">
                                  <div className="py-1">
                                    {canEditUsers && (
                                      <button
                                        className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100 flex items-center gap-2"
                                        onClick={() =>
                                          handleToggleEmailVerified(
                                            user.id,
                                            user.emailVerified
                                          )
                                        }
                                      >
                                        {user.emailVerified ? (
                                          <>
                                            <MailX className="h-4 w-4" />
                                            Mark Unverified
                                          </>
                                        ) : (
                                          <>
                                            <Mail className="h-4 w-4" />
                                            Mark Verified
                                          </>
                                        )}
                                      </button>
                                    )}

                                    {canManageRoles && (
                                      <>
                                        <div className="border-t my-1" />
                                        <div className="px-4 py-1 text-xs text-gray-500 font-medium">
                                          Change Role
                                        </div>
                                        {user.role !== 'USER' && (
                                          <button
                                            className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100 flex items-center gap-2"
                                            onClick={() =>
                                              handleChangeRole(user.id, 'USER')
                                            }
                                          >
                                            <User className="h-4 w-4" />
                                            Set as User
                                          </button>
                                        )}
                                        {user.role !== 'ADMIN' && (
                                          <button
                                            className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100 flex items-center gap-2"
                                            onClick={() =>
                                              handleChangeRole(user.id, 'ADMIN')
                                            }
                                          >
                                            <Shield className="h-4 w-4" />
                                            Set as Admin
                                          </button>
                                        )}
                                        {user.role !== 'SUPER_ADMIN' && (
                                          <button
                                            className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100 flex items-center gap-2"
                                            onClick={() =>
                                              handleChangeRole(
                                                user.id,
                                                'SUPER_ADMIN'
                                              )
                                            }
                                          >
                                            <Crown className="h-4 w-4" />
                                            Set as Super Admin
                                          </button>
                                        )}
                                      </>
                                    )}

                                    {canDeleteUsers && (
                                      <>
                                        <div className="border-t my-1" />
                                        <button
                                          className="w-full text-left px-4 py-2 text-sm hover:bg-red-50 text-red-600 flex items-center gap-2"
                                          onClick={() =>
                                            handleDeleteUser(user.id)
                                          }
                                        >
                                          <Trash2 className="h-4 w-4" />
                                          Delete User
                                        </button>
                                      </>
                                    )}
                                  </div>
                                </div>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {pagination && pagination.totalPages > 1 && (
                <div className="flex items-center justify-between pt-4 border-t mt-4">
                  <p className="text-sm text-gray-500">
                    Showing {(pagination.page - 1) * pagination.limit + 1} to{' '}
                    {Math.min(
                      pagination.page * pagination.limit,
                      pagination.total
                    )}{' '}
                    of {pagination.total} users
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(page - 1)}
                      disabled={page <= 1}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="text-sm">
                      Page {pagination.page} of {pagination.totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(page + 1)}
                      disabled={page >= pagination.totalPages}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
