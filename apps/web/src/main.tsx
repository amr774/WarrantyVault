import { usePreferences, PreferencesProvider, PreferenceControls } from './preferences';
import React, { useState } from 'react';
import ReactDOM from 'react-dom/client';
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  Outlet,
  NavLink,
  Link,
  useLocation,
  useNavigate,
} from 'react-router-dom';
import { QueryClient, QueryClientProvider, useQueryClient, useQuery } from '@tanstack/react-query';
import {
  LayoutDashboard,
  Package,
  Bell,
  Settings,
  UserRound,
  CreditCard,
  LogOut,
  Menu,
  ShieldCheck,
  ArrowUpRight,
  X,
} from 'lucide-react';
import { Toaster, toast } from 'sonner';
import { AuthProvider, useAuth } from './auth-context';
import { api, json } from './api';
import { Logo, PublicPage, AuthPage } from './pages/public';
import { Dashboard } from './pages/dashboard';
import { Scanner } from './pages/scanner';
import { OwnerDashboard } from './pages/owner';
import { Products, ProductForm, ProductDetails, ReceiptViewer } from './pages/products';
import { Notifications, Profile, Settings as SettingsPage, Billing } from './pages/account';
import { Button } from './components/ui/button';
import { Loading } from './components/common';
import './styles.css';

const client = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});
function LocalizedToaster() {
  const { theme, language } = usePreferences();
  return (
    <Toaster
      richColors
      theme={theme}
      dir={language === 'ar' ? 'rtl' : 'ltr'}
      position={language === 'ar' ? 'bottom-left' : 'bottom-right'}
    />
  );
}
function Shell() {
  const { t } = usePreferences();
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const cache = useQueryClient();
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const notices = useQuery({
    queryKey: ['notifications', 'count'],
    queryFn: () => api('/notifications?limit=1'),
    enabled: !!user,
    refetchInterval: 60000,
  });
  if (loading) return <Loading />;
  if (!user) return <Navigate to="/login" replace />;
  const logout = async () => {
    try {
      await api('/auth/logout', json('POST'));
      await cache.cancelQueries();
      cache.removeQueries({ predicate: (query) => query.queryKey[0] !== 'me' });
      cache.setQueryData(['me'], null);
      navigate('/login');
    } catch (e) {
      toast.error(t((e as Error).message));
    }
  };
  const nav = [
    ['/app', LayoutDashboard, t('Overview')],
    ['/app/products', Package, t('My products')],
    ['/app/notifications', Bell, t('Notifications')],
  ] as const;
  return (
    <div className="app-shell">
      {open && (
        <button
          className="mobile-overlay"
          aria-label={t('Close navigation')}
          onClick={() => setOpen(false)}
        />
      )}
      <aside className={open ? 'sidebar open' : 'sidebar'}>
        <Logo />
        <button
          className="mobile-close"
          aria-label={t('Close menu')}
          onClick={() => setOpen(false)}
        >
          <X />
        </button>
        <span className="nav-heading">{t('YOUR WORKSPACE')}</span>
        <nav>
          {nav.map(([to, Icon, label]) => (
            <NavLink end={to === '/app'} key={to} to={to} onClick={() => setOpen(false)}>
              <Icon size={19} />
              {label}
              {label === t('Notifications') && notices.data?.unread > 0 && (
                <span className="count">{notices.data.unread}</span>
              )}
            </NavLink>
          ))}
        </nav>
        <span className="nav-heading">{t('PERSONAL')}</span>
        {user.role === 'OWNER' && (
          <nav>
            <NavLink to="/app/owner" onClick={() => setOpen(false)}>
              <ShieldCheck size={19} />
              {t('Owner dashboard')}
            </NavLink>
          </nav>
        )}
        <nav>
          {[
            ['/app/profile', UserRound, t('Profile')],
            ['/app/settings', Settings, t('Settings')],
            ['/app/billing', CreditCard, t('Plan & billing')],
          ].map(([to, Icon, label]: any) => (
            <NavLink key={to} to={to} onClick={() => setOpen(false)}>
              <Icon size={19} />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <ShieldCheck size={24} />
            <strong>{t('Your things. Safely kept.')}</strong>
            <p>{t('A little organization goes a long way.')}</p>
            <Link to="/app/billing">
              {t('Explore your plan')}
              <ArrowUpRight size={14} />
            </Link>
          </div>
          <button className="user-card" onClick={() => navigate('/app/profile')}>
            <span className="avatar">{user.name.charAt(0).toUpperCase()}</span>
            <span>
              <strong>{user.name}</strong>
              <small>{user.role === 'OWNER' ? t('Owner account') : t('Personal workspace')}</small>
            </span>
          </button>
          <button className="logout" onClick={logout}>
            <LogOut size={16} />
            {t('Sign out')}
          </button>
        </div>
      </aside>
      <div className="app-body">
        <header className="topbar">
          <div>
            <button
              aria-label={t('Open navigation')}
              className="mobile-toggle"
              onClick={() => setOpen(true)}
            >
              <Menu />
            </button>
            <span className="breadcrumb">
              {t('Workspace')}
              <span>/</span>{' '}
              {location.pathname === '/app'
                ? t('Overview')
                : t(
                    (
                      {
                        products: 'My products',
                        scan: 'Scan Receipt',
                        owner: 'Owner dashboard',
                        notifications: 'Notifications',
                        profile: 'Profile',
                        settings: 'Settings',
                        billing: 'Plan & billing',
                      } as Record<string, string>
                    )[location.pathname.split('/')[2]] ?? 'Overview',
                  )}
            </span>
          </div>
          <div>
            <PreferenceControls />
            <span className="private-label">
              <ShieldCheck size={14} />
              {t('Your private vault')}
            </span>
            <Link
              className="notification-bell"
              aria-label={t('Notifications')}
              to="/app/notifications"
            >
              <Bell size={19} />
              {notices.data?.unread > 0 && <i />}
            </Link>
            <Link to="/app/profile" className="avatar small">
              {user.name.charAt(0).toUpperCase()}
            </Link>
          </div>
        </header>
        <main className="workspace" key={location.pathname}>
          <Outlet />
        </main>
        <footer className="app-footer">
          <span>
            <ShieldCheck size={13} />
            {t('A little order. A little peace of mind.')}
          </span>
          <span>WarrantyVault</span>
        </footer>
      </div>
    </div>
  );
}
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? <SystemPage error /> : this.props.children;
  }
}
function SystemPage({ error = false }: { error?: boolean }) {
  const { t } = usePreferences();
  return (
    <main className="system-page">
      <ShieldCheck size={52} />
      <span className="eyebrow">
        {error ? t('SOMETHING WENT WRONG') : t('404 · A LITTLE LOST?')}
      </span>
      <h1>{error ? t('Let’s try that again.') : t('This page isn’t in your vault.')}</h1>
      <p>
        {error
          ? t('Refresh the page to start again. Your saved data is still in your vault.')
          : t('The link may have moved. Your products are right where you left them.')}
      </p>
      <Button asChild>
        <a href="/app">{t('Back to your vault')}</a>
      </Button>
    </main>
  );
}
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <PreferencesProvider>
      <ErrorBoundary>
        <QueryClientProvider client={client}>
          <BrowserRouter>
            <AuthProvider>
              <Routes>
                {['/', '/features', '/pricing'].map((path) => (
                  <Route key={path} path={path} element={<PublicPage />} />
                ))}
                {[
                  '/login',
                  '/register',
                  '/forgot-password',
                  '/reset-password',
                  '/verify-email',
                ].map((path) => (
                  <Route key={path} path={path} element={<AuthPage key={path} />} />
                ))}
                <Route path="/app" element={<Shell />}>
                  <Route index element={<Dashboard />} />
                  <Route path="products" element={<Products />} />
                  <Route path="products/new" element={<ProductForm />} />
                  <Route path="scan" element={<Scanner />} />
                  <Route path="owner" element={<OwnerDashboard />} />
                  <Route path="products/:id" element={<ProductDetails />} />
                  <Route path="products/:id/edit" element={<ProductForm />} />
                  <Route path="receipts/:id" element={<ReceiptViewer />} />
                  <Route path="notifications" element={<Notifications />} />
                  <Route path="profile" element={<Profile />} />
                  <Route path="settings" element={<SettingsPage />} />
                  <Route path="billing" element={<Billing />} />
                </Route>
                <Route path="/error" element={<SystemPage error />} />
                <Route path="*" element={<SystemPage />} />
              </Routes>
              <LocalizedToaster />
            </AuthProvider>
          </BrowserRouter>
        </QueryClientProvider>
      </ErrorBoundary>
    </PreferencesProvider>
  </React.StrictMode>,
);
