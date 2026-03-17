import { useState } from 'react';
import { Link, useLocation } from '@tanstack/react-router';
import {
  Home,
  Users,
  FileText,
  LogOut,
  Settings,
  ExternalLink,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import logotype from '@/logotype.svg';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/use-auth';
import { ROUTES } from '@/lib/constants/routes';
import { Button } from '@/components/ui/button';

const menuItems = [
  {
    title: 'Dashboard',
    url: ROUTES.dashboard,
    icon: Home,
  },
  {
    title: 'Users',
    url: ROUTES.users,
    icon: Users,
  },
];

export function SimpleSidebar() {
  const location = useLocation();
  const { logout, isLoggingOut } = useAuth();
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem('sidebar-collapsed') === 'true'
  );

  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem('sidebar-collapsed', String(next));
  };

  return (
    <aside
      className={cn(
        'relative bg-black flex flex-col border-r border-zinc-900 transition-all duration-200',
        collapsed ? 'w-16' : 'w-64'
      )}
    >
      {/* Header */}
      <div className={cn('border-b border-zinc-900 flex items-center', collapsed ? 'p-3 justify-center' : 'p-4')}>
        {collapsed ? (
          <img src={logotype} alt="OW" className="h-6 w-6 object-contain" />
        ) : (
          <img src={logotype} alt="Open Wearables" className="h-auto" />
        )}
      </div>

      {/* Collapse Toggle */}
      <button
        onClick={toggle}
        className="absolute -right-3 top-16 z-10 w-6 h-6 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-700 transition-colors"
      >
        {collapsed ? (
          <PanelLeftOpen className="h-3 w-3" />
        ) : (
          <PanelLeftClose className="h-3 w-3" />
        )}
      </button>

      {/* Navigation */}
      <nav className="flex-1 p-2 space-y-1">
        {menuItems.map((item) => {
          const isActive = location.pathname.startsWith(item.url);

          if (item.external) {
            return (
              <a
                key={item.title}
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                title={collapsed ? item.title : undefined}
                className={cn(
                  'flex items-center gap-3 rounded-md text-sm text-zinc-400 hover:bg-zinc-900/50 hover:text-zinc-200 transition-all duration-200',
                  collapsed ? 'justify-center px-2 py-2.5' : 'px-3 py-2'
                )}
              >
                <item.icon className="h-4 w-4 text-zinc-500 flex-shrink-0" />
                {!collapsed && <span>{item.title}</span>}
                {!collapsed && <ExternalLink className="ml-auto h-3 w-3 text-zinc-600" />}
              </a>
            );
          }

          return (
            <Link
              key={item.title}
              to={item.url}
              title={collapsed ? item.title : undefined}
              className={cn(
                'flex items-center gap-3 rounded-md text-sm transition-all duration-200',
                collapsed ? 'justify-center px-2 py-2.5' : 'px-3 py-2',
                isActive
                  ? collapsed
                    ? 'bg-zinc-900 text-white'
                    : 'bg-zinc-900 text-white border-l-2 border-white -ml-[2px] pl-[calc(0.75rem+2px)]'
                  : 'text-zinc-400 hover:bg-zinc-900/50 hover:text-zinc-200'
              )}
            >
              <item.icon
                className={cn(
                  'h-4 w-4 transition-colors flex-shrink-0',
                  isActive ? 'text-white' : 'text-zinc-500'
                )}
              />
              {!collapsed && <span>{item.title}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Divider */}
      <div className="mx-2 border-t border-zinc-900" />

      {/* Footer */}
      <div className="p-2">
        <Button
          variant="ghost"
          onClick={() => logout()}
          disabled={isLoggingOut}
          title={collapsed ? 'Logout' : undefined}
          className={cn(
            'w-full gap-3 text-zinc-400 hover:text-red-400',
            collapsed ? 'justify-center px-2' : 'justify-start px-3'
          )}
        >
          <LogOut className="h-4 w-4 flex-shrink-0" />
          {!collapsed && (isLoggingOut ? 'Logging out...' : 'Logout')}
        </Button>
      </div>
    </aside>
  );
}
