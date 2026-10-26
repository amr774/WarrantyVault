import { usePreferences, AppearanceSettings } from '../preferences';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { Bell, CheckCheck, Mail, ShieldCheck, Check } from 'lucide-react';
import { toast } from 'sonner';
import { api, json } from '../api';
import { useAuth } from '../auth-context';
import { Button } from '../components/ui/button';
import { Confirm } from '../components/ui/dialog';
import { date, Empty, Failure, Loading } from '../components/common';
export function Notifications() {
  const { t } = usePreferences();
  const client = useQueryClient();
  const [page, setPage] = useState(1);
  const [history, setHistory] = useState(false);
  const query = useQuery({
    queryKey: ['notifications', page, history],
    queryFn: () => api(`/notifications${history ? '/history' : ''}?page=${page}&limit=20`),
  });
  const read = async (id?: string) => {
    try {
      await api(id ? `/notifications/${id}/read` : '/notifications/read-all', json('PATCH'));
      await client.invalidateQueries({ queryKey: ['notifications'] });
    } catch (e) {
      toast.error(t((e as Error).message));
    }
  };
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">{t('A FRIENDLY HEADS-UP')}</span>
          <h1>{t('Notification center')}</h1>
          <p>{t('Your reminders, without the noise.')}</p>
        </div>
        <Button variant="outline" onClick={() => read()}>
          <CheckCheck size={17} />
          {t('Mark all read')}
        </Button>
      </div>
      <div className="actions tabs">
        <Button
          variant={history ? 'outline' : 'default'}
          onClick={() => {
            setHistory(false);
            setPage(1);
          }}
        >
          {t('Inbox')}
        </Button>
        <Button
          variant={history ? 'default' : 'outline'}
          onClick={() => {
            setHistory(true);
            setPage(1);
          }}
        >
          {t('Delivery history')}
        </Button>
      </div>
      <section className="card">
        {query.isPending ? (
          <Loading />
        ) : query.error ? (
          <Failure error={query.error} />
        ) : query.data.data.length ? (
          query.data.data.map((n: any) => (
            <article className={`notification ${!n.readAt && !history ? 'unread' : ''}`} key={n.id}>
              <span className="product-icon">
                <Bell size={20} />
              </span>
              <div className="grow">
                <h3>{history ? n.product.name : t(n.title)}</h3>
                <p>
                  {history
                    ? t('{days}-day reminder · {status} · {attempts} delivery attempt(s)', {
                        days: n.daysBefore,
                        status: t(n.status.toLowerCase()),
                        attempts: n.attempts,
                      })
                    : t(n.message)}
                </p>
                <small>{date(n.createdAt)}</small>
                {n.productId && (
                  <Link to={`/app/products/${n.productId}`}>{t('View product →')}</Link>
                )}
              </div>
              {!history && !n.readAt && (
                <Button variant="ghost" aria-label={t('Mark read')} onClick={() => read(n.id)}>
                  <Check size={18} />
                </Button>
              )}
            </article>
          ))
        ) : (
          <Empty
            title={t('You’re all caught up.')}
            text={t('Your warranty reminders will find a home here.')}
            action={false}
          />
        )}
      </section>
      {query.data && (
        <div className="pagination">
          <Button variant="outline" disabled={page === 1} onClick={() => setPage(page - 1)}>
            {t('Previous')}
          </Button>
          <span>
            {t('Page')} {page}
          </span>
          <Button
            variant="outline"
            disabled={page * 20 >= query.data.total}
            onClick={() => setPage(page + 1)}
          >
            {t('Next')}
          </Button>
        </div>
      )}
    </>
  );
}
export function Profile() {
  const { t } = usePreferences();
  const { user } = useAuth();
  const client = useQueryClient();
  const navigate = useNavigate();
  const [name, setName] = useState(user?.name ?? '');
  const [currentPassword, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [deletePassword, setDelete] = useState('');
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      toast.error(t((e as Error).message));
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">{t('YOUR PERSONAL SPACE')}</span>
          <h1>{t('Profile & security')}</h1>
          <p>{t('A few details that make your vault yours.')}</p>
        </div>
      </div>
      <div className="account-stack">
        <form
          className="card"
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              await api('/users/me', json('PATCH', { name }));
              await client.invalidateQueries({ queryKey: ['me'] });
              toast.success(t('Profile saved'));
            });
          }}
        >
          <h2>{t('Personal details')}</h2>
          <label>
            {t('Name')}
            <input required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label>
            {t('Email address')}
            <input value={user?.email ?? ''} disabled />
          </label>
          <p className="muted">
            {user?.emailVerifiedAt
              ? t('Email verified')
              : t('Verify your email to receive reminders.')}
          </p>
          {!user?.emailVerifiedAt && (
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() =>
                run(async () => {
                  await api('/auth/resend-verification', json('POST'));
                  toast.success(t('Verification email sent'));
                })
              }
            >
              <Mail size={16} />
              {t('Resend verification')}
            </Button>
          )}
          <Button disabled={busy} type="submit">
            {t('Save profile')}
          </Button>
        </form>
        <form
          className="card"
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              await api('/users/change-password', json('POST', { currentPassword, password }));
              await client.cancelQueries();
              client.removeQueries({ predicate: (query) => query.queryKey[0] !== 'me' });
              client.setQueryData(['me'], null);
              navigate('/login');
              toast.success(t('Password changed. Please sign in again.'));
            });
          }}
        >
          <h2>{t('Change password')}</h2>
          <p>{t('Changing your password signs you out on every device.')}</p>
          <label>
            {t('Current password')}
            <input
              required
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrent(e.target.value)}
            />
          </label>
          <label>
            {t('New password')}
            <input
              required
              minLength={12}
              maxLength={72}
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <Button disabled={busy}>{t('Update password')}</Button>
        </form>
        <section className="card danger-zone">
          <h2>{t('Delete account')}</h2>
          <p>{t('This permanently removes your products, receipts, and account.')}</p>
          <label>
            {t('Confirm your password')}
            <input
              type="password"
              autoComplete="current-password"
              value={deletePassword}
              onChange={(e) => setDelete(e.target.value)}
            />
          </label>
          <Confirm
            title={t('Permanently delete your vault?')}
            description={t(
              'This cannot be undone. All your receipts and products will be deleted.',
            )}
            onConfirm={() =>
              run(async () => {
                await api('/users/me', json('DELETE', { password: deletePassword }));
                await client.cancelQueries();
                client.removeQueries({ predicate: (query) => query.queryKey[0] !== 'me' });
                client.setQueryData(['me'], null);
                // End the deleted account's browser session without racing Shell's login redirect.
                window.location.assign('/');
                toast.success(t('Account deleted'));
              })
            }
          >
            <Button disabled={busy || !deletePassword} variant="destructive">
              {t('Delete my account')}
            </Button>
          </Confirm>
        </section>
      </div>
    </>
  );
}
export function Settings() {
  const query = useQuery({ queryKey: ['preferences'], queryFn: () => api('/users/preferences') });
  if (query.isPending) return <Loading />;
  if (query.error) return <Failure error={query.error} />;
  return <SettingsFields preferences={query.data} />;
}
function SettingsFields({ preferences: p }: { preferences: any }) {
  const { t } = usePreferences();
  const client = useQueryClient();
  const [emailEnabled, setEmail] = useState(p.emailEnabled);
  const [inAppEnabled, setInApp] = useState(p.inAppEnabled);
  const [days, setDays] = useState(p.days.join(', '));
  const [busy, setBusy] = useState(false);
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">{t('JUST THE WAY YOU LIKE IT')}</span>
          <h1>{t('Settings')}</h1>
          <p>{t('A quieter inbox. Timely reminders. Your choice.')}</p>
        </div>
      </div>
      <form
        className="card account-stack"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await api(
              '/users/preferences',
              json('PATCH', {
                emailEnabled,
                inAppEnabled,
                days: days.split(',').map((x: string) => Number(x.trim())),
              }),
            );
            await client.invalidateQueries({ queryKey: ['preferences'] });
            toast.success(t('Preferences saved'));
          } catch (error) {
            toast.error(t((error as Error).message));
          } finally {
            setBusy(false);
          }
        }}
      >
        <h2>{t('Warranty reminders')}</h2>
        <label className="toggle">
          <div>
            <strong>{t('Email reminders')}</strong>
            <p>{t('A heads-up delivered to your verified email.')}</p>
          </div>
          <input
            type="checkbox"
            checked={emailEnabled}
            onChange={(e) => setEmail(e.target.checked)}
          />
        </label>
        <label className="toggle">
          <div>
            <strong>{t('In-app notifications')}</strong>
            <p>{t('Keep reminders in your notification center.')}</p>
          </div>
          <input
            type="checkbox"
            checked={inAppEnabled}
            onChange={(e) => setInApp(e.target.checked)}
          />
        </label>
        <label>
          {t('Days before expiration')}
          <input value={days} onChange={(e) => setDays(e.target.value)} />
        </label>
        <p>{t('Free includes reminders at 30, 7 and 1 day. Custom schedules require Premium.')}</p>
        <Button disabled={busy}>{busy ? t('Saving…') : t('Save preferences')}</Button>
      </form>
      <AppearanceSettings />
    </>
  );
}
export function Billing() {
  const { t } = usePreferences();
  const query = useQuery({ queryKey: ['subscription'], queryFn: () => api('/users/subscription') });
  if (query.isPending) return <Loading />;
  if (query.error) return <Failure error={query.error} />;
  const d = query.data;
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">{t('ROOM FOR THE THINGS YOU LOVE')}</span>
          <h1>{t('Plan & billing')}</h1>
          <p>{t('Simple essentials, with space to grow.')}</p>
        </div>
      </div>
      <div className="detail-grid">
        <article className="card">
          <ShieldCheck size={32} className="accent" />
          <h2>WarrantyVault {t(d.plan.name)}</h2>
          <span className="badge">{t('Current plan')}</span>
          <h3>{t('Your vault’s usage')}</h3>
          <p>
            {d.usage.products} {t('of')} {d.plan.productLimit.toLocaleString()} {t('products')}
          </p>
          <div className="progress">
            <i style={{ width: `${(d.usage.products / d.plan.productLimit) * 100}%` }} />
          </div>
          <p>
            {(d.usage.storageBytes / 1048576).toFixed(1)} {t('of')}{' '}
            {(d.plan.storageBytes / 1048576).toFixed(0)} {t('MB used')}
          </p>
          <div className="progress">
            <i style={{ width: `${(d.usage.storageBytes / d.plan.storageBytes) * 100}%` }} />
          </div>
          <p className="muted">{t('Your plan limits are enforced securely by the server.')}</p>
        </article>
        <article className="tip-card">
          <span className="eyebrow">{t('ON THE HORIZON')}</span>
          <h2>{t('A little more room.')}</h2>
          <p>
            {t(
              'Premium will offer more products, more receipt storage, and custom reminder schedules.',
            )}
          </p>
          <p>{t('Family sharing and advanced analytics are planned for the future.')}</p>
          <Button disabled>{t('Upgrades aren’t available yet')}</Button>
          <small>{t('No payment method is collected. No charges are made.')}</small>
        </article>
      </div>
    </>
  );
}
