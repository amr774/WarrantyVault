import { usePreferences } from '../preferences';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Camera, ScanLine, Upload } from 'lucide-react';
import { api } from '../api';
import { Button } from '../components/ui/button';

const definitions = [
  ['name', 'Product name', 'text', true],
  ['brand', 'Brand', 'text'],
  ['model', 'Model', 'text'],
  ['serialNumber', 'Serial number', 'text'],
  ['storeName', 'Merchant / store', 'text'],
  ['purchaseDate', 'Purchase date', 'date', true],
  ['purchasePrice', 'Purchase price', 'number'],
  ['currency', 'Currency (3-letter code)', 'text', true],
  ['warrantyMonths', 'Warranty duration (months)', 'number', true],
  ['warrantyStartDate', 'Warranty start date', 'date'],
  ['expiresAt', 'Warranty expiration date', 'date'],
] as const;
type Field = {
  value: string | number;
  confidence: number;
  uncertain: boolean;
  evidence: string;
  derived?: boolean;
};
type Scan = {
  previews?: { page: number; dataUrl: string }[];
  fields: Record<string, Field>;
  warnings: string[];
  lines: { text: string; confidence: number; page: number }[];
  pages: number;
  unresolvedFields?: string[];
};

export function Scanner() {
  const { t } = usePreferences();
  const [file, setFile] = useState<File>();
  const [preview, setPreview] = useState('');
  const [result, setResult] = useState<Scan>();
  const [values, setValues] = useState<Record<string, string>>({});
  const [changed, setChanged] = useState<Record<string, boolean>>({});
  const [confirmed, setConfirmed] = useState(false);
  const [phase, setPhase] = useState<'idle' | 'scanning' | 'review' | 'saving'>('idle');
  const [error, setError] = useState('');
  const categories = useQuery({ queryKey: ['categories'], queryFn: () => api('/categories') });
  const navigate = useNavigate();
  const cache = useQueryClient();
  const busy = phase === 'scanning' || phase === 'saving';
  const unresolved = (result?.unresolvedFields ?? []).filter((key) => !changed[key]);
  useEffect(() => {
    if (!file) {
      setPreview('');
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  const choose = (next?: File) => {
    if (!next) return;
    setError('');
    setResult(undefined);
    setValues({});
    setChanged({});
    setConfirmed(false);
    setPhase('idle');
    if (
      !['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(next.type) ||
      next.size > 10 * 1024 * 1024
    ) {
      setFile(undefined);
      setError(t('Choose a JPG, PNG, WebP or PDF up to 10 MB.'));
      return;
    }
    setFile(next);
  };
  const scan = async () => {
    if (!file) return;
    setPhase('scanning');
    setError('');
    setConfirmed(false);
    try {
      const body = new FormData();
      body.append('file', file);
      const data = await api<Scan>('/scanner/analyze', { method: 'POST', body });
      setResult(data);
      setValues(
        Object.fromEntries(
          Object.entries(data.fields).map(([key, field]) => [key, String(field.value)]),
        ),
      );
      setChanged({});
      setPhase('review');
    } catch (e) {
      setError((e as Error).message);
      setPhase('idle');
    }
  };
  const update = (key: string, value: string) => {
    setConfirmed(false);
    setValues((old) => {
      const next = { ...old, [key]: value };
      // Recompute only a derived expiration; explicit dates remain editable overrides.
      if (
        ['purchaseDate', 'warrantyStartDate', 'warrantyMonths'].includes(key) &&
        !changed.expiresAt &&
        !unresolved.some(
          (field) => field !== key && ['warrantyStartDate', 'expiresAt'].includes(field),
        ) &&
        (!result?.fields.expiresAt || result.fields.expiresAt.derived)
      ) {
        const start = next.warrantyStartDate || next.purchaseDate;
        const months = Number(next.warrantyMonths);
        next.expiresAt = '';
        if (
          start &&
          next.warrantyMonths !== '' &&
          next.warrantyMonths !== undefined &&
          Number.isInteger(months) &&
          months >= 0 &&
          months <= 1200
        ) {
          const d = new Date(`${start}T00:00:00Z`);
          if (Number.isFinite(d.getTime())) {
            const day = d.getUTCDate();
            d.setUTCDate(1);
            d.setUTCMonth(d.getUTCMonth() + months);
            d.setUTCDate(
              Math.min(
                day,
                new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate(),
              ),
            );
            next.expiresAt = d.toISOString().slice(0, 10);
          }
        }
      }
      return next;
    });
    setChanged((old) => ({ ...old, [key]: true }));
  };
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!file || !result || busy || !confirmed || unresolved.length) return;
    setPhase('saving');
    setError('');
    try {
      const product: Record<string, unknown> = {
        ...values,
        warrantyMonths: Number(values.warrantyMonths),
        purchasePrice: values.purchasePrice ? Number(values.purchasePrice) : null,
      };
      for (const key of ['expiresAt', 'warrantyStartDate']) if (!product[key]) delete product[key];
      // A calculated date must stay calculated when warranty details are edited later.
      if (!changed.expiresAt && (!result.fields.expiresAt || result.fields.expiresAt.derived))
        delete product.expiresAt;
      const body = new FormData();
      body.append('file', file);
      body.append('product', JSON.stringify(product));
      const saved = await api<{ id: string }>('/scanner/confirm', { method: 'POST', body });
      await cache.invalidateQueries();
      navigate(`/app/products/${saved.id}`);
    } catch (e) {
      setError((e as Error).message);
      setPhase('review');
    }
  };
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">{t('LESS PAPER. MORE PEACE OF MIND.')}</span>
          <h1>{t('Scan Receipt')}</h1>
          <p>{t('Arabic & English recognition, processed privately on this computer.')}</p>
        </div>
        <Button variant="outline" asChild>
          <Link to="/app/products/new">{t('Enter manually')}</Link>
        </Button>
      </div>
      <section className="card scan-upload">
        <h2>{t('Choose a receipt or warranty')}</h2>
        <p>{t('JPG, PNG, WebP or PDF · up to 10 MB · 5 PDF pages · 12 megapixels per image')}</p>
        <div className="actions">
          <label className="scan-file">
            <Upload size={18} />
            {t('Upload document')}
            <input
              aria-label={t('Upload scan document')}
              disabled={busy}
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              onChange={(e) => {
                choose(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
          </label>
          <label className="scan-file">
            <Camera size={18} />
            {t('Take photo')}
            <input
              aria-label={t('Take receipt photo')}
              disabled={busy}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              capture="environment"
              onChange={(e) => {
                choose(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
          </label>
          <Button disabled={!file || busy} onClick={scan}>
            <ScanLine size={18} />
            {phase === 'scanning' ? t('Reading document…') : t('Start OCR')}
          </Button>
        </div>
        {phase === 'scanning' && (
          <p role="status">
            {t(
              'Processing locally. Multi-page documents may take a few minutes. Nothing has been saved.',
            )}
            <progress aria-label={t('OCR processing')} />
          </p>
        )}
        {error && (
          <p role="alert" className="error">
            {t(error)}
          </p>
        )}
      </section>
      {file && preview && (
        <div className="scan-grid">
          <section className="card scan-original">
            <h2>{t('Original document')}</h2>
            <p>{file.name}</p>
            {file.type === 'application/pdf' ? (
              <>
                {result?.previews?.length ? (
                  result.previews.map((page) => (
                    <figure key={page.page}>
                      <img
                        src={page.dataUrl}
                        alt={t('Original PDF page {page}', { page: page.page })}
                      />
                      <figcaption>
                        {t('Page')} {page.page}
                      </figcaption>
                    </figure>
                  ))
                ) : (
                  <p>
                    {t(
                      'PDF selected. Open the original below, or start OCR to preview its pages here.',
                    )}
                  </p>
                )}
                <a href={preview} target="_blank" rel="noreferrer">
                  {t('Open original PDF')}
                </a>
              </>
            ) : (
              <>
                <img src={preview} alt={t('Original receipt')} />
                <a href={preview} target="_blank" rel="noreferrer">
                  {t('Open full-size original')}
                </a>
              </>
            )}
          </section>
          {result && (
            <form className="card scan-review" onSubmit={save}>
              <h2>{t('Review before saving')}</h2>
              <p role="status">
                {t(
                  'Scan complete. Verify every value against the original. Highlighted fields need attention. Missing fields are left empty.',
                )}
              </p>
              <p>
                {t(
                  'Enter the required product, purchase date, currency, category and warranty duration manually if missing. No warranty duration is assumed.',
                )}
              </p>
              {result.warnings.map((warning) => (
                <p className="scan-warning" key={t(warning)}>
                  {t(warning)}
                </p>
              ))}
              {unresolved.length > 0 && (
                <p className="scan-warning" role="alert">
                  {t(
                    'Conflicting document values need your review. Enter the correct value, or clear it if it should not be used, for:',
                  )}{' '}
                  {unresolved
                    .map((key) => t(definitions.find(([field]) => field === key)?.[1] ?? key))
                    .join(', ')}
                  .
                </p>
              )}
              {!result.lines.length && (
                <p className="scan-warning">
                  {t('No readable text found. Try a clearer photo or enter the details below.')}
                </p>
              )}
              <fieldset disabled={busy}>
                <div className="form-grid">
                  {definitions.map(([key, label, type, required]) => {
                    const field = result.fields[key];
                    const uncertain = !changed[key] && (!field || field.uncertain);
                    return (
                      <label key={key} className={uncertain ? 'scan-uncertain' : ''}>
                        {t(label)}
                        {required ? ' *' : ''}
                        <input
                          aria-label={t(label)}
                          dir="auto"
                          type={type}
                          required={!!required}
                          value={values[key] ?? ''}
                          onChange={(e) =>
                            update(
                              key,
                              key === 'currency' ? e.target.value.toUpperCase() : e.target.value,
                            )
                          }
                          min={type === 'number' ? 0 : undefined}
                          max={
                            key === 'warrantyMonths'
                              ? 1200
                              : key === 'purchasePrice'
                                ? 9999999999
                                : undefined
                          }
                          step={key === 'purchasePrice' ? '.01' : type === 'number' ? 1 : undefined}
                          maxLength={
                            key === 'currency'
                              ? 3
                              : key === 'name' || key === 'storeName'
                                ? 150
                                : 100
                          }
                          pattern={key === 'currency' ? '[A-Z]{3}' : undefined}
                        />
                        <small>
                          {changed[key]
                            ? t('Edited by you')
                            : !field
                              ? t('Not identified — enter if known')
                              : field.derived
                                ? t(field.evidence)
                                : t('{prefix}{confidence}% OCR confidence', {
                                    prefix: field.uncertain
                                      ? t('Check carefully · ')
                                      : t('Verify · '),
                                    confidence: Math.round(field.confidence * 100),
                                  })}
                        </small>
                        {field && <small dir="auto">{!field.derived && field.evidence}</small>}
                        {unresolved.includes(key) && !required && (
                          <Button type="button" variant="outline" onClick={() => update(key, '')}>
                            {t('Leave empty after review')}
                          </Button>
                        )}
                      </label>
                    );
                  })}
                  <label>
                    {t('Category *')}
                    <select
                      required
                      value={values.categoryId ?? ''}
                      onChange={(e) => update('categoryId', e.target.value)}
                    >
                      <option value="">{t('Choose a category')}</option>
                      {categories.data?.map((c: any) => (
                        <option key={c.id} value={c.id}>
                          {t(c.name)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    {t('Notes')}
                    <textarea
                      value={values.notes ?? ''}
                      maxLength={5000}
                      onChange={(e) => update('notes', e.target.value)}
                    />
                  </label>
                </div>
                <label className="scan-confirm">
                  <input
                    type="checkbox"
                    required
                    checked={confirmed}
                    onChange={(e) => setConfirmed(e.target.checked)}
                  />{' '}
                  {t('I checked these details against my document.')}
                </label>
                <Button
                  type="submit"
                  disabled={busy || !!categories.error || unresolved.length > 0}
                >
                  {phase === 'saving' ? t('Saving product & document…') : t('Confirm & Save')}
                </Button>
              </fieldset>
              {categories.error && (
                <p className="error">
                  {t('Categories could not be loaded. Refresh the page to try again.')}
                </p>
              )}
              <details>
                <summary>{t('Recognized text ({count} pages)', { count: result.pages })}</summary>
                <pre dir="auto">{result.lines.map((line) => line.text).join('\n')}</pre>
              </details>
            </form>
          )}
        </div>
      )}
    </>
  );
}
