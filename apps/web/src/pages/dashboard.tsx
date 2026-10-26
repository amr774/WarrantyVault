import { usePreferences } from '../preferences';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Package,
  ShieldCheck,
  Clock3,
  ShieldAlert,
  ArrowUpRight,
  Plus,
  ReceiptText,
} from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { api } from '../api';
import { useAuth } from '../auth-context';
import { Button } from '../components/ui/button';
import { Empty, Failure, Loading, ProductRow } from '../components/common';
const colors = ['#7955ed', '#a18af4', '#c0b1f8', '#d5ccfa', '#e8e2fb', '#504078'];
export function Dashboard() {
  const { t } = usePreferences();
  const { user } = useAuth();
  const summary = useQuery({ queryKey: ['dashboard'], queryFn: () => api('/dashboard/summary') });
  const upcoming = useQuery({
    queryKey: ['upcoming'],
    queryFn: () => api('/dashboard/upcoming-expirations'),
  });
  if (summary.isPending) return <Loading />;
  if (summary.error) return <Failure error={summary.error} retry={() => summary.refetch()} />;
  const d = summary.data;
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">{t('YOUR VAULT, AT A GLANCE')}</span>
          <h1>{t('A little peace of mind, {name}.', { name: user?.name.split(' ')[0] ?? '' })}</h1>
          <p>{t('Everything you own. All the important details. One place.')}</p>
        </div>
        <Button variant="outline" asChild>
          <Link to="/app/scan">
            <ReceiptText size={18} />
            {t('Scan Receipt')}
          </Link>
        </Button>
        <Button asChild>
          <Link to="/app/products/new">
            <Plus size={18} />
            {t('Add product')}
          </Link>
        </Button>
      </div>
      <section className="stats-grid">
        {[
          [Package, t('Total products'), d.total, t('Everything in your vault'), 'purple'],
          [ShieldCheck, t('Active warranties'), d.active, t('Covered and cared for'), 'green'],
          [Clock3, t('Expiring soon'), d.expiring, t('A little attention needed'), 'orange'],
          [ShieldAlert, t('Expired warranties'), d.expired, t('Keep your records handy'), 'gray'],
        ].map(([Icon, label, value, note, color]: any) => (
          <article className="stat card" key={label}>
            <div>
              <span>{label}</span>
              <span className={`stat-icon ${color}`}>
                <Icon size={21} />
              </span>
            </div>
            <strong>{value.toString().padStart(2, '0')}</strong>
            <small>{note}</small>
          </article>
        ))}
      </section>
      <section className="dashboard-grid">
        <article className="card">
          <div className="card-heading">
            <div>
              <span className="eyebrow">{t('STAY A STEP AHEAD')}</span>
              <h2>{t('Coming up for renewal')}</h2>
            </div>
            <Link to="/app/products?status=EXPIRING_SOON">
              {t('View all')}
              <ArrowUpRight size={15} />
            </Link>
          </div>
          {upcoming.isPending ? (
            <Loading />
          ) : upcoming.error ? (
            <Failure error={upcoming.error} />
          ) : upcoming.data?.data.length ? (
            upcoming.data.data.map((p: any) => <ProductRow key={p.id} product={p} />)
          ) : (
            <Empty
              title={t('Nothing to worry about here.')}
              text={t('Warranties approaching their end date will appear here.')}
              action={false}
            />
          )}
        </article>
        <article className="card category-card">
          <div className="card-heading">
            <div>
              <span className="eyebrow">{t('A PLACE FOR EVERYTHING')}</span>
              <h2>{t('Your collection')}</h2>
            </div>
          </div>
          {d.total ? (
            <>
              <div style={{ height: 190 }}>
                <ResponsiveContainer>
                  <PieChart>
                    <Pie
                      data={d.categories.map((category: any) => ({
                        ...category,
                        name: t(category.name),
                      }))}
                      dataKey="value"
                      innerRadius={57}
                      outerRadius={78}
                      paddingAngle={5}
                      stroke="none"
                    >
                      {d.categories.map((c: any, i: number) => (
                        <Cell key={t(c.name)} fill={colors[i % colors.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="legend">
                {d.categories.map((c: any, i: number) => (
                  <div key={t(c.name)}>
                    <i style={{ background: colors[i % colors.length] }} />
                    {t(c.name)}
                    <strong>{c.value}</strong>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <Empty
              title={t('Make yourself at home')}
              text={t('Your categories will take shape as you add products.')}
              action={false}
            />
          )}
        </article>
      </section>
      <section className="dashboard-grid">
        <article className="card">
          <div className="card-heading">
            <div>
              <span className="eyebrow">{t('THE LATEST ADDITIONS')}</span>
              <h2>{t('Recently added')}</h2>
            </div>
            <Link to="/app/products">
              {t('All products')}
              <ArrowUpRight size={15} />
            </Link>
          </div>
          {d.recent.length ? (
            d.recent.map((p: any) => <ProductRow key={p.id} product={p} />)
          ) : (
            <Empty />
          )}
        </article>
        <article className="tip-card">
          <span className="tip-icon">
            <ReceiptText size={26} />
          </span>
          <span className="eyebrow">{t('A SMALL TIP FOR FUTURE YOU')}</span>
          <h2>
            {t('Receipts fade.')}
            <br />
            {t('Your vault doesn’t.')}
          </h2>
          <p>
            {t(
              'Upload a photo of your receipt while it’s still fresh. You’ll thank yourself if you ever need to make a claim.',
            )}
          </p>
          <Link to="/app/products">
            {t('Organize your receipts')}
            <ArrowUpRight size={17} />
          </Link>
          <div className="tip-decoration">
            <ReceiptText size={110} strokeWidth={1} />
          </div>
        </article>
      </section>
    </>
  );
}
