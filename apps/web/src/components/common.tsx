import { usePreferences, getLocale } from '../preferences';
import { Package, ArrowUpRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from './ui/button';
export function Loading() {
  const { t } = usePreferences();
  return (
    <div role="status" aria-label={t('Loading')} className="skeletons">
      <div />
      <div />
      <div />
    </div>
  );
}
export function Failure({ error, retry }: { error: Error | null; retry?: () => void }) {
  const { t } = usePreferences();
  return (
    <div className="empty" role="alert">
      <h2>{t('We couldn’t load this')}</h2>
      <p>{t(error?.message ?? 'Please try again.')}</p>
      {retry && <Button onClick={retry}>{t('Try again')}</Button>}
    </div>
  );
}
export function Empty({
  title = 'A home for your purchases',
  text = 'Add your first product. We’ll keep the warranty dates and receipts together.',
  action = true,
}: {
  title?: string;
  text?: string;
  action?: boolean;
}) {
  const { t } = usePreferences();
  return (
    <div className="empty">
      <span className="empty-icon">
        <Package size={32} />
      </span>
      <h2>{t(title)}</h2>
      <p>{t(text)}</p>
      {action && (
        <Button asChild>
          <Link to="/app/products/new">
            {t('Add your first product')}
            <ArrowUpRight size={16} />
          </Link>
        </Button>
      )}
    </div>
  );
}
export function Badge({ status }: { status: string }) {
  const { t } = usePreferences();
  return (
    <span className={`badge ${status.toLowerCase()}`}>
      <i />
      {status === 'ACTIVE'
        ? t('Protected')
        : status === 'EXPIRING_SOON'
          ? t('Expiring soon')
          : t('Expired')}
    </span>
  );
}
export function date(value: string) {
  return new Intl.DateTimeFormat(getLocale(), { dateStyle: 'medium', timeZone: 'UTC' }).format(
    new Date(value),
  );
}
export function ProductRow({ product: p }: { product: any }) {
  const { t } = usePreferences();
  return (
    <Link className="product-row" to={`/app/products/${p.id}`}>
      <span className="product-icon">
        <Package size={22} />
      </span>
      <div className="grow">
        <strong>{p.name}</strong>
        <small>
          {p.brand || t(p.category.name)} · {t(p.category.name)}
        </small>
      </div>
      <div className="row-date">
        <strong>{date(p.expiresAt)}</strong>
        <small>
          {p.daysRemaining < 0
            ? t('Warranty ended')
            : t('{count} days remaining', { count: p.daysRemaining })}
        </small>
      </div>
      <Badge status={p.status} />
      <ArrowUpRight size={17} />
    </Link>
  );
}
