'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  Youtube,
  Video,
  AlertTriangle,
  LogOut,
  Shield,
  Menu,
  X,
  ChevronLeft,
  ChevronRight,
  Users,
  CheckCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION || '1.0.0';

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Channels', href: '/channels', icon: Youtube },
  { name: 'Videos', href: '/videos', icon: Video },
  { name: 'Events', href: '/events', icon: AlertTriangle },
];

const adminNavigation = [
  { name: 'Admin', href: '/admin', icon: Users },
];

interface User {
  id: string;
  email: string;
  name: string | null;
  role: 'USER' | 'ADMIN' | 'SUPER_ADMIN';
  permissions: string[];
  hasPartnerAccess: boolean;
  channelCount: number;
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  // Load collapsed state from localStorage
  useEffect(() => {
    const savedCollapsed = localStorage.getItem('sidebar-collapsed');
    if (savedCollapsed !== null) {
      setCollapsed(savedCollapsed === 'true');
    }
  }, []);

  // Save collapsed state to localStorage
  const toggleCollapsed = () => {
    const newCollapsed = !collapsed;
    setCollapsed(newCollapsed);
    localStorage.setItem('sidebar-collapsed', String(newCollapsed));
  };

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
          setUser(response.data as User);
        } else {
          throw new Error('Failed to get user');
        }
      })
      .catch(() => {
        localStorage.removeItem('token');
        router.push('/login');
      })
      .finally(() => {
        setLoading(false);
      });
  }, [router]);

  const handleLogout = () => {
    localStorage.removeItem('token');
    api.setToken(null);
    router.push('/login');
  };

  const isAdmin = user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN';

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  const NavLink = ({
    item,
    isActive,
  }: {
    item: { name: string; href: string; icon: any };
    isActive: boolean;
  }) => {
    const content = (
      <Link
        href={item.href}
        className={cn(
          'flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors',
          isActive
            ? 'bg-primary/10 text-primary'
            : 'text-gray-600 hover:bg-gray-100',
          collapsed && 'justify-center px-2'
        )}
        onClick={() => setSidebarOpen(false)}
      >
        <item.icon className="h-5 w-5 flex-shrink-0" />
        {!collapsed && <span>{item.name}</span>}
      </Link>
    );

    if (collapsed) {
      return (
        <Tooltip delayDuration={0}>
          <TooltipTrigger asChild>{content}</TooltipTrigger>
          <TooltipContent side="right">{item.name}</TooltipContent>
        </Tooltip>
      );
    }

    return content;
  };

  return (
    <TooltipProvider>
      <div className="min-h-screen bg-gray-50">
        {/* Mobile sidebar overlay */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 bg-black/50 z-40 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Sidebar */}
        <aside
          className={cn(
            'fixed inset-y-0 left-0 z-50 bg-white border-r transform transition-all duration-300 lg:translate-x-0',
            sidebarOpen ? 'translate-x-0' : '-translate-x-full',
            collapsed ? 'w-16' : 'w-64'
          )}
        >
          <div className="flex flex-col h-full">
            {/* Logo */}
            <div
              className={cn(
                'flex items-center gap-2 px-4 py-4 border-b',
                collapsed ? 'justify-center' : 'px-6'
              )}
            >
              <Shield className="h-8 w-8 text-primary flex-shrink-0" />
              {!collapsed && (
                <>
                  <span className="text-xl font-bold">ClaimStriker</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="ml-auto lg:hidden"
                    onClick={() => setSidebarOpen(false)}
                  >
                    <X className="h-5 w-5" />
                  </Button>
                </>
              )}
            </div>

            {/* Navigation */}
            <nav className="flex-1 px-2 py-4 space-y-1">
              {navigation.map((item) => {
                const isActive = pathname === item.href;
                return <NavLink key={item.name} item={item} isActive={isActive} />;
              })}

              {/* Admin section */}
              {isAdmin && (
                <>
                  <div
                    className={cn(
                      'my-4 border-t',
                      collapsed ? 'mx-2' : 'mx-3'
                    )}
                  />
                  {adminNavigation.map((item) => {
                    const isActive = pathname.startsWith(item.href);
                    return (
                      <NavLink key={item.name} item={item} isActive={isActive} />
                    );
                  })}
                </>
              )}
            </nav>

            {/* User section */}
            <div className={cn('border-t p-3', collapsed && 'px-2')}>
              {/* User info */}
              {!collapsed ? (
                <div className="mb-3">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <span className="text-sm font-medium text-primary">
                        {user?.name?.[0] || user?.email?.[0] || 'U'}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {user?.name || 'User'}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {user?.email}
                      </p>
                    </div>
                  </div>

                  {/* Partner status badge */}
                  {user?.hasPartnerAccess && (
                    <div className="flex items-center gap-1.5 mb-2 px-2 py-1 bg-green-50 rounded-md">
                      <CheckCircle className="h-3.5 w-3.5 text-green-600" />
                      <span className="text-xs font-medium text-green-700">
                        YouTube Partner
                      </span>
                    </div>
                  )}

                  {/* Role badge for admins */}
                  {isAdmin && (
                    <div className="flex items-center gap-1.5 mb-2 px-2 py-1 bg-purple-50 rounded-md">
                      <Shield className="h-3.5 w-3.5 text-purple-600" />
                      <span className="text-xs font-medium text-purple-700">
                        {user?.role === 'SUPER_ADMIN' ? 'Super Admin' : 'Admin'}
                      </span>
                    </div>
                  )}

                  {/* App version */}
                  <p className="text-xs text-muted-foreground px-2">
                    v{APP_VERSION}
                  </p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2 mb-2">
                  <Tooltip delayDuration={0}>
                    <TooltipTrigger asChild>
                      <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center cursor-default">
                        <span className="text-sm font-medium text-primary">
                          {user?.name?.[0] || user?.email?.[0] || 'U'}
                        </span>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="right">
                      <div>
                        <p className="font-medium">{user?.name || 'User'}</p>
                        <p className="text-xs opacity-75">{user?.email}</p>
                        {user?.hasPartnerAccess && (
                          <p className="text-xs text-green-400 mt-1">
                            YouTube Partner
                          </p>
                        )}
                        {isAdmin && (
                          <p className="text-xs text-purple-400">
                            {user?.role === 'SUPER_ADMIN' ? 'Super Admin' : 'Admin'}
                          </p>
                        )}
                      </div>
                    </TooltipContent>
                  </Tooltip>
                </div>
              )}

              {/* Logout button */}
              {collapsed ? (
                <Tooltip delayDuration={0}>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="w-full text-gray-600"
                      onClick={handleLogout}
                    >
                      <LogOut className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="right">Sign out</TooltipContent>
                </Tooltip>
              ) : (
                <Button
                  variant="ghost"
                  className="w-full justify-start text-gray-600"
                  onClick={handleLogout}
                >
                  <LogOut className="h-4 w-4 mr-2" />
                  Sign out
                </Button>
              )}

              {/* Collapse toggle (desktop only) */}
              <div className="hidden lg:block mt-2">
                <Tooltip delayDuration={0}>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className={cn('w-full', !collapsed && 'justify-end')}
                      onClick={toggleCollapsed}
                    >
                      {collapsed ? (
                        <ChevronRight className="h-4 w-4" />
                      ) : (
                        <ChevronLeft className="h-4 w-4" />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="right">
                    {collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                  </TooltipContent>
                </Tooltip>
              </div>
            </div>
          </div>
        </aside>

        {/* Main content */}
        <div
          className={cn(
            'transition-all duration-300',
            collapsed ? 'lg:pl-16' : 'lg:pl-64'
          )}
        >
          {/* Mobile header */}
          <header className="sticky top-0 z-30 bg-white border-b lg:hidden">
            <div className="flex items-center gap-4 px-4 py-3">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setSidebarOpen(true)}
              >
                <Menu className="h-5 w-5" />
              </Button>
              <Shield className="h-6 w-6 text-primary" />
              <span className="font-bold">ClaimStriker</span>
            </div>
          </header>

          {/* Page content */}
          <main className="p-4 lg:p-8">{children}</main>
        </div>
      </div>
    </TooltipProvider>
  );
}
