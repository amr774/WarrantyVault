import { usePreferences } from '../preferences';
import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Plus,
  Search,
  Package,
  ArrowUpRight,
  ArrowLeft,
  Upload,
  FileText,
  Trash2,
  Pencil,
  Download,
  Image,
} from 'lucide-react';
import { toast } from 'sonner';
import { api, json } from '../api';
import { Button } from '../components/ui/button';
import { Confirm } from '../components/ui/dialog';
import { Badge, date, Empty, Failure, Loading } from '../components/common';
export function Products() {
  const { t } = usePreferences();
  const [search, setSearch] = useSearchParams();
  const [page, setPage] = useState(1);
  const query = new URLSearchParams(search);
  query.set('page', String(page));
  query.set('limit', '12');
  const products = useQuery({
    queryKey: [t('products'), query.toString()],
    queryFn: () => api(`/products?${query}`),
  });
  const categories = useQuery({ queryKey: ['categories'], queryFn: () => api('/categories') });
  const filter = (key: string, value: string) => {
    setPage(1);
    setSearch((prev) => {
      if (value) prev.set(key, value);
      else prev.delete(key);
      return prev;
    });
  };
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">{t('EVERYTHING IN ITS PLACE')}</span>
          <h1>{t('My products')}</h1>
          <p>{t('A thoughtfully organized home for the things you own.')}</p>
        </div>
        <Button asChild>
          <Link to="/app/products/new">
            <Plus size={17} />
            {t('Add product')}
          </Link>
        </Button>
      </div>
      <div className="filters">
        <label className="search">
          <Search size={18} />
          <input
            aria-label={t('Search products')}
            placeholder={t('Search your vault…')}
            value={search.get('search') ?? ''}
            onChange={(e) => filter('search', e.target.value)}
          />
        </label>
        <select
          aria-label={t('Filter category')}
          value={search.get('categoryId') ?? ''}
          onChange={(e) => filter('categoryId', e.target.value)}
        >
          <option value="">{t('All categories')}</option>
          {categories.data?.map((c: any) => (
            <option key={c.id} value={c.id}>
              {t(c.name)}
            </option>
          ))}
        </select>
        <select
          aria-label={t('Filter status')}
          value={search.get('status') ?? ''}
          onChange={(e) => filter('status', e.target.value)}
        >
          <option value="">{t('All warranties')}</option>
          <option value="ACTIVE">{t('Protected')}</option>
          <option value="EXPIRING_SOON">{t('Expiring soon')}</option>
          <option value="EXPIRED">{t('Expired')}</option>
        </select>
        <select
          aria-label={t('Sort products')}
          value={`${search.get('sort') ?? 'createdAt'}:${search.get('order') ?? 'desc'}`}
          onChange={(e) => {
            const [sort, order] = e.target.value.split(':');
            setPage(1);
            setSearch((prev) => {
              prev.set('sort', sort);
              prev.set('order', order);
              return prev;
            });
          }}
        >
          <option value="createdAt:desc">{t('Recently added')}</option>
          <option value="expiresAt:asc">{t('Expiring first')}</option>
          <option value="name:asc">{t('Name A–Z')}</option>
          <option value="purchaseDate:desc">{t('Latest purchase')}</option>
        </select>
      </div>
      {products.isPending ? (
        <Loading />
      ) : products.error ? (
        <Failure error={products.error} />
      ) : products.data.total === 0 ? (
        <Empty
          title={search.size ? t('No products found') : t('Your vault starts here')}
          text={
            search.size
              ? t('Try a different search or filter.')
              : t('Add a product and give its important details a permanent home.')
          }
          action={!search.size}
        />
      ) : (
        <>
          <div className="product-grid">
            {products.data.data.map((p: any) => (
              <Link className="card product-card" to={`/app/products/${p.id}`} key={p.id}>
                <div className="product-visual">
                  <Package size={48} strokeWidth={1.2} />
                  <span>{t(p.category.name)}</span>
                </div>
                <div className="product-card-body">
                  <div className="between">
                    <Badge status={p.status} />
                    <ArrowUpRight size={17} />
                  </div>
                  <h2>{p.name}</h2>
                  <p>{[p.brand, p.model].filter(Boolean).join(' · ') || t(p.category.name)}</p>
                  <div className="progress">
                    <i style={{ width: `${p.progress}%` }} />
                  </div>
                  <div className="between">
                    <small>
                      {p.daysRemaining < 0
                        ? t('Coverage ended')
                        : t('{count} days left', { count: p.daysRemaining })}
                    </small>
                    <small>{date(p.expiresAt)}</small>
                  </div>
                  <div className="product-card-footer">
                    <FileText size={14} /> {p._count.receipts} {t('saved files')}
                  </div>
                </div>
              </Link>
            ))}
          </div>
          <div className="pagination">
            <span>
              {products.data.total} {t('products')}
            </span>
            <Button variant="outline" disabled={page === 1} onClick={() => setPage(page - 1)}>
              {t('Previous')}
            </Button>
            <span>
              {t('Page')} {page}
            </span>
            <Button
              variant="outline"
              disabled={page * 12 >= products.data.total}
              onClick={() => setPage(page + 1)}
            >
              {t('Next')}
            </Button>
          </div>
        </>
      )}
    </>
  );
}
const productSchema = z.object({
  name: z.string().trim().min(1, 'Enter a product name').max(150),
  brand: z.string().max(100),
  model: z.string().max(100),
  serialNumber: z.string().max(100),
  categoryId: z.string().uuid('Choose a category'),
  purchaseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose a purchase date'),
  purchasePrice: z.union([z.literal(''), z.coerce.number().min(0).max(9999999999)]),
  currency: z.string().regex(/^[A-Z]{3}$/, 'Use a 3-letter currency code'),
  storeName: z.string().max(150),
  warrantyMonths: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z.coerce
      .number({ error: 'Enter the warranty duration in months' })
      .int('Use a whole number of months')
      .min(0)
      .max(1200),
  ),
  warrantyStartDate: z.string(),
  expiresAt: z.string(),
  notes: z.string().max(5000),
});
export function ProductForm() {
  const { id } = useParams();
  const product = useQuery({
    queryKey: ['product', id],
    queryFn: () => api(`/products/${id}`),
    enabled: !!id,
  });
  if (id && product.isPending) return <Loading />;
  if (product.error) return <Failure error={product.error} />;
  return <ProductFields key={id ?? 'new'} product={product.data} />;
}
function ProductFields({ product: p }: { product?: any }) {
  const { t } = usePreferences();
  const navigate = useNavigate();
  const client = useQueryClient();
  const categories = useQuery({ queryKey: ['categories'], queryFn: () => api('/categories') });
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<any>({
    resolver: zodResolver(productSchema),
    defaultValues: {
      name: p?.name ?? '',
      brand: p?.brand ?? '',
      model: p?.model ?? '',
      serialNumber: p?.serialNumber ?? '',
      categoryId: p?.categoryId ?? '',
      purchaseDate: p?.purchaseDate.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
      purchasePrice: p?.purchasePrice ?? '',
      currency: p?.currency ?? 'USD',
      storeName: p?.storeName ?? '',
      warrantyMonths: p?.warrantyMonths ?? '',
      warrantyStartDate: p?.warrantyStartDate?.slice(0, 10) ?? '',
      expiresAt: p?.expirationOverride ? p.expiresAt.slice(0, 10) : '',
      notes: p?.notes ?? '',
    },
  });
  const submit = async (values: any) => {
    try {
      const { expiresAt, purchasePrice, warrantyStartDate, ...rest } = values;
      const result = await api(
        p ? `/products/${p.id}` : '/products',
        json(p ? 'PATCH' : 'POST', {
          ...rest,
          ...(expiresAt ? { expiresAt } : {}),
          warrantyStartDate: warrantyStartDate || null,
          purchasePrice: purchasePrice !== '' ? Number(purchasePrice) : null,
        }),
      );
      await client.invalidateQueries();
      toast.success(p ? t('Product updated') : t('Welcome to your vault'));
      navigate(`/app/products/${result.id}`);
    } catch (e) {
      toast.error(t((e as Error).message));
    }
  };
  const field = (name: string, label: string, type = 'text', extra: any = {}) => (
    <label>
      {label}
      <input type={type} {...register(name)} {...extra} />
      {errors[name] && <small className="error">{t(String(errors[name]?.message))}</small>}
    </label>
  );
  return (
    <>
      <Link className="back" to="/app/products">
        <ArrowLeft size={16} />
        {t('My products')}
      </Link>
      <div className="page-heading">
        <div>
          <span className="eyebrow">{t('MAKE ROOM FOR SOMETHING GOOD')}</span>
          <h1>{p ? t('Edit product') : t('Add a product')}</h1>
          <p>{t('The details today. Peace of mind tomorrow.')}</p>
        </div>
        {!p && (
          <Button variant="outline" asChild>
            <Link to="/app/scan">
              <FileText size={18} />
              {t('Scan Receipt')}
            </Link>
          </Button>
        )}
      </div>
      <form className="product-form" onSubmit={handleSubmit(submit)}>
        <section className="card">
          <h2>{t('The essentials')}</h2>
          <p>{t('Let’s give this purchase a place in your vault.')}</p>
          <div className="form-grid">
            {field('name', t('Product name *'))}
            <label>
              {t('Category *')}
              <select {...register('categoryId')}>
                <option value="">{t('Choose a category')}</option>
                {categories.data?.map((c: any) => (
                  <option key={c.id} value={c.id}>
                    {t(c.name)}
                  </option>
                ))}
              </select>
              <small className="error">{t(String(errors.categoryId?.message ?? ''))}</small>
            </label>
            {field('brand', t('Brand'))}
            {field('model', t('Model'))}
            {field('serialNumber', t('Serial number'))}
            {field('storeName', t('Store name'))}
          </div>
        </section>
        <section className="card">
          <h2>{t('Purchase & warranty')}</h2>
          <p>
            {t(
              'Enter the duration from your warranty terms. We calculate the expiration date for you.',
            )}
          </p>
          <div className="form-grid">
            {field('purchaseDate', t('Purchase date *'), 'date')}
            {field('warrantyStartDate', t('Warranty start date (optional)'), 'date')}
            {field('warrantyMonths', t('Warranty duration (months) *'), 'number', {
              min: 0,
              max: 1200,
              required: true,
            })}
            {field('purchasePrice', t('Purchase price'), 'number', { step: '0.01', min: 0 })}
            {field('currency', t('Currency *'), 'text', { maxLength: 3 })}
            {field('expiresAt', t('Override expiration date (optional)'), 'date')}
          </div>
        </section>
        <section className="card">
          <h2>{t('Anything else?')}</h2>
          <label>
            {t('Notes')}
            <textarea
              rows={4}
              {...register('notes')}
              placeholder={t('Care instructions, claim details, or anything worth remembering…')}
            />
          </label>
          <p className="muted">{t('You can add receipts and product images after saving.')}</p>
        </section>
        <div className="actions">
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? t('Saving…') : p ? t('Save changes') : t('Add to my vault')}
          </Button>
          <Button variant="outline" asChild>
            <Link to="/app/products">{t('Cancel')}</Link>
          </Button>
        </div>
      </form>
    </>
  );
}
export function ProductDetails() {
  const { t } = usePreferences();
  const { id } = useParams();
  const navigate = useNavigate();
  const client = useQueryClient();
  const [uploading, setUploading] = useState(false);
  const query = useQuery({ queryKey: ['product', id], queryFn: () => api(`/products/${id}`) });
  if (query.isPending) return <Loading />;
  if (query.error) return <Failure error={query.error} />;
  const p = query.data;
  const remove = async () => {
    try {
      await api(`/products/${id}`, json('DELETE'));
      await client.invalidateQueries();
      toast.success(t('Product removed'));
      navigate('/app/products');
    } catch (e) {
      toast.error(t((e as Error).message));
    }
  };
  const upload = async (files: FileList | null, kind: string) => {
    if (!files) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const body = new FormData();
        body.append('file', file);
        await api(`/products/${id}/receipts?kind=${kind}`, { method: 'POST', body });
      }
      toast.success(t('Files saved'));
      await client.invalidateQueries();
    } catch (e) {
      toast.error(t((e as Error).message));
    } finally {
      setUploading(false);
    }
  };
  const deleteFile = async (receiptId: string) => {
    try {
      await api(`/receipts/${receiptId}`, json('DELETE'));
      await client.invalidateQueries();
      toast.success(t('File removed'));
    } catch (e) {
      toast.error(t((e as Error).message));
    }
  };
  return (
    <>
      <Link className="back" to="/app/products">
        <ArrowLeft size={16} />
        {t('My products')}
      </Link>
      <div className="page-heading">
        <div>
          <span className="eyebrow">{t(p.category.name)}</span>
          <h1>{p.name}</h1>
          <p>
            {[p.brand, p.model].filter(Boolean).join(' · ') ||
              t('All the important details, together.')}
          </p>
        </div>
        <div className="actions">
          <Button variant="outline" asChild>
            <Link to={`/app/products/${id}/edit`}>
              <Pencil size={16} />
              {t('Edit')}
            </Link>
          </Button>
          <Confirm
            title={t('Delete this product?')}
            description={t('The product and all its receipts will be permanently removed.')}
            onConfirm={remove}
          >
            <Button variant="ghost" aria-label={t('Delete product')}>
              <Trash2 size={18} />
            </Button>
          </Confirm>
        </div>
      </div>
      <div className="detail-grid">
        <section className="card">
          <div className="between">
            <h2>{t('Warranty coverage')}</h2>
            <Badge status={p.status} />
          </div>
          <div className="warranty-number">
            {Math.max(0, p.daysRemaining)}
            <span>{t('days remaining')}</span>
          </div>
          <div className="progress">
            <i style={{ width: `${p.progress}%` }} />
          </div>
          <div className="between">
            <span>
              {t('Purchased')} {date(p.purchaseDate)}
            </span>
            <span>
              {t('Expires')} {date(p.expiresAt)}
            </span>
          </div>
          <dl>
            {[
              [t('Brand'), p.brand],
              [t('Model'), p.model],
              [t('Serial number'), p.serialNumber],
              [t('Store'), p.storeName],
              [t('Purchase price'), p.purchasePrice ? `${p.currency} ${p.purchasePrice}` : null],
              [t('Warranty duration'), t('{count} months', { count: p.warrantyMonths })],
              [t('Warranty start'), p.warrantyStartDate ? date(p.warrantyStartDate) : null],
              [
                t('Expiration'),
                p.expirationOverride
                  ? t('Manually set')
                  : p.warrantyStartDate
                    ? t('Calculated from warranty start')
                    : t('Calculated from purchase'),
              ],
              [t('Added'), date(p.createdAt)],
              [t('Last updated'), date(p.updatedAt)],
            ].map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value || '—'}</dd>
              </div>
            ))}
          </dl>
          {p.notes && (
            <>
              <h3>{t('Notes')}</h3>
              <p className="notes">{p.notes}</p>
            </>
          )}
        </section>
        <section className="card">
          <h2>{t('Receipts & files')}</h2>
          <p>{t('Originals, safely stored. JPG, PNG, WEBP or PDF. Up to 10 MB each.')}</p>
          <label className="upload">
            <Upload size={25} />
            <strong>{uploading ? t('Uploading…') : t('Add receipts')}</strong>
            <span>{t('Choose one or more files')}</span>
            <input
              aria-label={t('Upload receipts')}
              disabled={uploading}
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              multiple
              onChange={(e) => {
                void upload(e.target.files, 'RECEIPT');
                e.target.value = '';
              }}
            />
          </label>
          <label className="image-upload">
            <Image size={16} />
            {t('Add product image')}
            <input
              aria-label={t('Upload product image')}
              disabled={uploading}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => {
                void upload(e.target.files, 'IMAGE');
                e.target.value = '';
              }}
            />
          </label>
          <div className="files">
            {p.receipts.map((r: any) => (
              <div className="file-row" key={r.id}>
                <FileText size={22} />
                <Link to={`/app/receipts/${r.id}`}>
                  <strong>{r.name}</strong>
                  <small>
                    {r.kind === 'IMAGE' ? t('Product image') : t('Receipt')} ·{' '}
                    {(r.size / 1024).toFixed(0)} {t('KB')}
                  </small>
                </Link>
                <Confirm
                  title={t('Delete this file?')}
                  description={t('This file will be permanently removed from your vault.')}
                  onConfirm={() => deleteFile(r.id)}
                >
                  <Button variant="ghost" aria-label={t('Delete {name}', { name: r.name })}>
                    <Trash2 size={16} />
                  </Button>
                </Confirm>
              </div>
            ))}
            {!p.receipts.length && (
              <p className="muted">{t('No files yet. Give your paper receipts a digital home.')}</p>
            )}
          </div>
        </section>
      </div>
    </>
  );
}
export function ReceiptViewer() {
  const { t } = usePreferences();
  const { id } = useParams();
  const query = useQuery({
    queryKey: ['receipt', id],
    queryFn: () => api(`/receipts/${id}/download`),
    refetchInterval: 45000,
    staleTime: 0,
  });
  if (query.isPending) return <Loading />;
  if (query.error) return <Failure error={query.error} />;
  const r = query.data;
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">{t('PRIVATE FILE')}</span>
          <h1>{r.name}</h1>
          <p>{t('Secure access links refresh while this page is open.')}</p>
        </div>
        <Button asChild>
          <a href={r.url} download={r.name} target="_blank" rel="noreferrer">
            <Download size={16} />
            {t('Open / download')}
          </a>
        </Button>
      </div>
      <div className="card receipt-viewer">
        {r.mimeType === 'application/pdf' ? (
          <iframe title={r.name} src={r.url} />
        ) : (
          <img src={r.url} alt={r.name} />
        )}
      </div>
    </>
  );
}
