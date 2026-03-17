import { useState } from 'react';
import { Link, useLocation } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import {
  Home,
  Users,
  LogOut,
  Languages,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import logotype from '@/logotype.svg';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/use-auth';
import { ROUTES } from '@/lib/constants/routes';
import { Button } from '@/components/ui/button';

const menuItems = [
  { titleKey: 'nav.dashboard', url: ROUTES.dashboard, icon: Home },
  { titleKey: 'nav.users', url: ROUTES.users, icon: Users },
];

export function SimpleSidebar() {
  const location = useLocation();
  const { logout, isLoggingOut } = useAuth();
  const { t, i18n } = useTranslation();
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem('sidebar-collapsed') === 'true'
  );

  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem('sidebar-collapsed', String(next));
  };

  const toggleLanguage = () => {
    const next = i18n.language === 'ru' ? 'en' : 'ru';
    i18n.changeLanguage(next);
    localStorage.setItem('language', next);
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
          const title = t(item.titleKey);

          return (
            <Link
              key={item.titleKey}
              to={item.url}
              title={collapsed ? title : undefined}
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
              {!collapsed && <span>{title}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Divider */}
      <div className="mx-2 border-t border-zinc-900" />

      {/* Language Switcher */}
      <div className="p-2">
        <button
          onClick={toggleLanguage}
          title={collapsed ? t(`language.${i18n.language === 'ru' ? 'en' : 'ru'}`) : undefined}
          className={cn(
            'w-full flex items-center gap-3 rounded-md text-sm text-zinc-400 hover:bg-zinc-900/50 hover:text-zinc-200 transition-all duration-200',
            collapsed ? 'justify-center px-2 py-2.5' : 'px-3 py-2'
          )}
        >
          <Languages className="h-4 w-4 text-zinc-500 flex-shrink-0" />
          {!collapsed && (
            <span>{i18n.language === 'ru' ? 'English' : 'Русский'}</span>
          )}
        </button>
      </div>

      {/* Divider */}
      <div className="mx-2 border-t border-zinc-900" />

      {/* Footer */}
      <div className="p-2">
        <Button
          variant="ghost"
          onClick={() => logout()}
          disabled={isLoggingOut}
          title={collapsed ? t('nav.logout') : undefined}
          className={cn(
            'w-full gap-3 text-zinc-400 hover:text-red-400',
            collapsed ? 'justify-center px-2' : 'justify-start px-3'
          )}
        >
          <LogOut className="h-4 w-4 flex-shrink-0" />
          {!collapsed && (isLoggingOut ? t('nav.loggingOut') : t('nav.logout'))}
        </Button>
      </div>
    </aside>
  );
}
