import { usePreferences, getLocale } from '../preferences';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Users, Package, ReceiptText, HardDrive, RefreshCw } from 'lucide-react';
import { api } from '../api';
import { useAuth, type User } from '../auth-context';
import { Button } from '../components/ui/button';
import { Failure, Loading, date } from '../components/common';

type Summary = {
  users: number;
  products: number;
  receipts: number;
  storageBytes: number;
  newUsers: number;
  expiringSoonDays: number;
  warranties: { active: number; expiring: number; expired: number };
  plans: { name: string; code: string; count: number }[];
  categories: { name: string; count: number }[];
  generatedAt: string;
};
type Member = User & {
  createdAt: string;
  _count: { products: number };
  subscription: { plan: { name: string; code: string } } | null;
};
type Members = { data: Member[]; total: number; page: number; pageSize: number };

export function OwnerDashboard() {
  const { t } = usePreferences();
  const { user } = useAuth();
  const allowed = user?.role === 'OWNER';
  const [input, setInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const summary = useQuery({
    queryKey: ['owner', 'summary'],
    queryFn: () => api<Summary>('/owner/summary'),
    enabled: allowed,
  });
  const members = useQuery({
    queryKey: ['owner', 'users', search, page],
    queryFn: () =>
      api<Members>(`/owner/users?${new URLSearchParams({ search, page: String(page) })}`),
    enabled: allowed,
  });
  if (!allowed)
    return (
      <section className="card empty">
        <h1>{t('Owner access required')}</h1>
        <p>{t('This dashboard is available to the site owner.')}</p>
        <Link to="/app">{t('Back to your vault')}</Link>
      </section>
    );
  if (summary.isPending) return <Loading />;
  if (summary.error) return <Failure error={summary.error} retry={() => summary.refetch()} />;
  const data = summary.data;
  const stats = [
    {
      label: t('Registered users'),
      value: data.users,
      note: t('{count} joined in the last 30 days', { count: data.newUsers }),
      Icon: Users,
    },
    {
      label: t('Total products'),
      value: data.products,
      note: t('Across all accounts'),
      Icon: Package,
    },
    {
      label: t('Documents stored'),
      value: data.receipts,
      note: t('Private receipts and images'),
      Icon: ReceiptText,
    },
    {
      label: t('Storage used'),
      value: `${(data.storageBytes / 1048576).toFixed(1)} MB`,
      note: t('Uploaded document bytes'),
      Icon: HardDrive,
    },
  ];
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">{t('WARRANTYVAULT ADMINISTRATION')}</span>
          <h1>{t('Owner dashboard')}</h1>
          <p>
            {t('Your platform, at a glance. Welcome,')}
            {user.name.split(' ')[0]}.
          </p>
        </div>
        <Button
          variant="outline"
          disabled={summary.isFetching || members.isFetching}
          onClick={() => {
            void summary.refetch();
            void members.refetch();
          }}
        >
          <RefreshCw size={16} />
          {t('Refresh')}
        </Button>
      </div>
      <section className="stats-grid">
        {stats.map(({ label, value, note, Icon }) => (
          <article className="stat card" key={label}>
            <div>
              <span>{label}</span>
              <span className="stat-icon purple">
                <Icon size={21} />
              </span>
            </div>
            <strong>{value}</strong>
            <small>{note}</small>
          </article>
        ))}
      </section>
      <section className="dashboard-grid owner-overview">
        <article className="card">
          <div className="card-heading">
            <div>
              <span className="eyebrow">{t('COVERAGE ACROSS YOUR PLATFORM')}</span>
              <h2>{t('Warranty overview')}</h2>
            </div>
          </div>
          <div className="owner-metrics">
            {[
              [
                t('Protected beyond {days} days', { days: data.expiringSoonDays }),
                data.warranties.active,
              ],
              [
                t('Expiring within {days} days', { days: data.expiringSoonDays }),
                data.warranties.expiring,
              ],
              [t('Expired'), data.warranties.expired],
            ].map(([label, count]) => (
              <div key={label}>
                <span>{label}</span>
                <strong>{count}</strong>
              </div>
            ))}
          </div>
        </article>
        <article className="card">
          <div className="card-heading">
            <div>
              <span className="eyebrow">{t('ACCOUNT OVERVIEW')}</span>
              <h2>{t('Subscription plans')}</h2>
            </div>
          </div>
          <div className="owner-metrics">
            {data.plans.map((plan) => (
              <div key={plan.code}>
                <span>{t(plan.name)}</span>
                <strong>{plan.count}</strong>
              </div>
            ))}
          </div>
        </article>
      </section>
      <section className="card owner-users">
        <div className="card-heading">
          <div>
            <span className="eyebrow">{t('YOUR COMMUNITY')}</span>
            <h2>{t('Users')}</h2>
            <p>{t('Account details and product counts. Personal documents stay private.')}</p>
          </div>
        </div>
        <form
          className="owner-search"
          onSubmit={(event) => {
            event.preventDefault();
            setSearch(input.trim());
            setPage(1);
          }}
        >
          <label>
            {t('Search users')}
            <input
              type="search"
              placeholder={t('Name or email address')}
              maxLength={100}
              value={input}
              onChange={(event) => setInput(event.target.value)}
            />
          </label>
          <Button type="submit">{t('Search')}</Button>
          {search && (
            <Button
              variant="outline"
              type="button"
              onClick={() => {
                setInput('');
                setSearch('');
                setPage(1);
              }}
            >
              {t('Clear')}
            </Button>
          )}
        </form>
        {members.isPending ? (
          <Loading />
        ) : members.error ? (
          <Failure error={members.error} retry={() => members.refetch()} />
        ) : (
          <>
            <p role="status">
              {t(
                members.data.total === 1
                  ? search
                    ? '{count} user matching “{search}”'
                    : '{count} user registered'
                  : search
                    ? '{count} users matching “{search}”'
                    : '{count} users registered',
                { count: members.data.total, search },
              )}
            </p>
            {members.data.data.length ? (
              <div
                className="owner-table-wrap"
                tabIndex={0}
                role="region"
                aria-label={t('User accounts')}
              >
                <table className="owner-table">
                  <thead>
                    <tr>
                      <th scope="col">{t('User')}</th>
                      <th scope="col">{t('Role')}</th>
                      <th scope="col">{t('Plan')}</th>
                      <th scope="col">{t('Products')}</th>
                      <th scope="col">{t('Email')}</th>
                      <th scope="col">{t('Joined')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {members.data.data.map((member) => (
                      <tr key={member.id}>
                        <td>
                          <strong>{member.name}</strong>
                          <small>{member.email}</small>
                        </td>
                        <td>
                          <span
                            className={`owner-role ${member.role === 'OWNER' ? 'is-owner' : ''}`}
                          >
                            {member.role === 'OWNER' ? t('Owner') : t('Member')}
                          </span>
                        </td>
                        <td>{t(member.subscription?.plan.name ?? 'No plan')}</td>
                        <td>{member._count.products}</td>
                        <td>{member.emailVerifiedAt ? t('Verified') : t('Unverified')}</td>
                        <td>{date(member.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="empty">{t('No users found. Try a different name or email.')}</p>
            )}
            <div className="pagination">
              <span>
                {t('Page {page} of {pages}', {
                  page,
                  pages: Math.max(1, Math.ceil(members.data.total / members.data.pageSize)),
                })}
              </span>
              <Button
                variant="outline"
                disabled={page === 1}
                onClick={() => setPage((value) => value - 1)}
              >
                {t('Previous')}
              </Button>
              <Button
                variant="outline"
                disabled={page * members.data.pageSize >= members.data.total}
                onClick={() => setPage((value) => value + 1)}
              >
                {t('Next')}
              </Button>
            </div>
          </>
        )}
      </section>
      <section className="card owner-categories">
        <div className="card-heading">
          <div>
            <span className="eyebrow">{t('PRODUCT DISTRIBUTION')}</span>
            <h2>{t('Categories')}</h2>
          </div>
        </div>
        <div className="owner-metrics">
          {data.categories.map((category) => (
            <div key={t(category.name)}>
              <span>{t(category.name)}</span>
              <strong>{category.count}</strong>
            </div>
          ))}
        </div>
      </section>
      <p className="muted">
        {t('Last refreshed:')}
        {new Date(data.generatedAt).toLocaleString(getLocale())}
      </p>
    </>
  );
}
