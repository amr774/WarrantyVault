// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { api } from '../api';
import { AuthProvider, useAuth } from '../auth-context';
import { Scanner } from './scanner';
import { ProductForm } from './products';
import { AuthPage } from './public';

vi.mock('../api', async (original) => ({
  ...(await original<typeof import('../api')>()),
  api: vi.fn(),
}));

const category = { id: 'cc3537f4-8bd7-4382-90a7-22c45a7c76de', name: 'Electronics' };
const field = (value: string | number, derived = false) => ({
  value,
  derived,
  confidence: 0.99,
  uncertain: derived,
  evidence: 'Document text',
});
const sample = () => ({
  pages: 1,
  warnings: [],
  lines: [{ text: 'Warranty: 12 months', confidence: 0.99, page: 1 }],
  fields: {
    name: field('Camera'),
    purchaseDate: field('2026-01-31'),
    currency: field('USD'),
    warrantyMonths: field(12),
    expiresAt: field('2027-01-31', true),
  },
});
const clients: QueryClient[] = [];
const apiMock = vi.mocked(api);

beforeEach(() => {
  apiMock.mockReset();
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: () => 'blob:sample' });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: () => {} });
});
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
});

function mount(component: React.ReactNode, path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>{component}</MemoryRouter>
    </QueryClientProvider>,
  );
  return client;
}

async function startScan(result = sample()) {
  apiMock.mockImplementation(async (path) => {
    if (path === '/categories') return [category];
    if (path === '/scanner/analyze') return result;
    if (path === '/scanner/confirm') return { id: 'saved' };
    throw new Error(`Unexpected request: ${path}`);
  });
  mount(<Scanner />, '/app/scan');
  fireEvent.change(screen.getByLabelText('Upload scan document'), {
    target: { files: [new File(['test'], 'receipt.png', { type: 'image/png' })] },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Start OCR' }));
  await screen.findByText('Review before saving');
  fireEvent.change(screen.getByLabelText('Category *'), { target: { value: category.id } });
}

async function saveScan() {
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(screen.getByRole('button', { name: 'Confirm & Save' }));
  await waitFor(() => expect(apiMock).toHaveBeenCalledWith('/scanner/confirm', expect.anything()));
  const options = apiMock.mock.calls.find(([path]) => path === '/scanner/confirm')![1]!;
  return JSON.parse((options.body as FormData).get('product') as string);
}

describe('scanner warranty review', () => {
  it('keeps calculated expiration calculated when saving', async () => {
    await startScan();
    const product = await saveScan();
    expect(product.warrantyMonths).toBe(12);
    expect(product).not.toHaveProperty('expiresAt');
  });
  it('saves an explicit expiration from the document', async () => {
    const result = sample();
    result.fields.expiresAt = field('2028-05-31');
    await startScan(result);
    expect((await saveScan()).expiresAt).toBe('2028-05-31');
  });
  it('keeps a user-entered expiration override', async () => {
    await startScan();
    fireEvent.change(screen.getByLabelText('Warranty expiration date'), {
      target: { value: '2028-06-01' },
    });
    expect((await saveScan()).expiresAt).toBe('2028-06-01');
  });
  it('requires renewed confirmation after edits and re-scanning', async () => {
    await startScan();
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.change(screen.getByLabelText('Warranty duration (months)'), {
      target: { value: '24' },
    });
    expect(screen.getByRole('checkbox')).not.toBeChecked();
    expect(screen.getByLabelText('Warranty expiration date')).toHaveValue('2028-01-31');
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Start OCR' }));
    await waitFor(() =>
      expect(screen.getByLabelText('Warranty duration (months)')).toHaveValue(12),
    );
    expect(screen.getByRole('checkbox')).not.toBeChecked();
    expect(apiMock.mock.calls.some(([path]) => path === '/scanner/confirm')).toBe(false);
  });
  it('does not silently calculate across unresolved conflicting dates', async () => {
    const result = {
      ...sample(),
      unresolvedFields: ['warrantyStartDate'],
      fields: { ...sample().fields, expiresAt: undefined },
    };
    delete result.fields.expiresAt;
    await startScan(result as unknown as ReturnType<typeof sample>);
    fireEvent.change(screen.getByLabelText('Warranty duration (months)'), {
      target: { value: '24' },
    });
    expect(screen.getByLabelText('Warranty expiration date')).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Confirm & Save' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Warranty start date'), {
      target: { value: '2026-02-01' },
    });
    expect(screen.getByLabelText('Warranty expiration date')).toHaveValue('2028-02-01');
    expect((await saveScan()).expiresAt).toBeUndefined();
  });
});

describe('manual warranty entry', () => {
  it('requires a duration rather than assuming twelve months or turning blank into zero', async () => {
    apiMock.mockImplementation(async (path) =>
      path === '/categories' ? [category] : { id: 'saved' },
    );
    mount(<ProductForm />, '/app/products/new');
    await screen.findByRole('option', { name: category.name });
    const duration = screen.getByLabelText('Warranty duration (months) *');
    expect(duration).toHaveValue(null);
    fireEvent.change(screen.getByLabelText('Product name *'), { target: { value: 'Camera' } });
    fireEvent.change(screen.getByLabelText('Category *'), { target: { value: category.id } });
    fireEvent.submit(duration.closest('form')!);
    await screen.findByText('Enter the warranty duration in months');
    expect(apiMock.mock.calls.some(([path]) => path === '/products')).toBe(false);
    fireEvent.change(duration, { target: { value: '0' } });
    fireEvent.submit(duration.closest('form')!);
    await waitFor(() => expect(apiMock).toHaveBeenCalledWith('/products', expect.anything()));
    const options = apiMock.mock.calls.find(([path]) => path === '/products')![1]!;
    expect(JSON.parse(options.body as string).warrantyMonths).toBe(0);
  });
});

describe('account switching', () => {
  it('removes previous account queries before entering the new account', async () => {
    const oldUser = {
      id: 'old',
      name: 'Old account',
      role: 'USER',
      email: 'old@example.test',
      emailVerifiedAt: null,
    };
    const nextUser = { ...oldUser, id: 'new', name: 'New account', email: 'new@example.test' };
    apiMock.mockImplementation(async (path) => {
      if (path === '/auth/login' || path === '/users/me') return nextUser;
      throw new Error(`Unexpected request: ${path}`);
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    clients.push(client);
    client.setQueryData(['me'], oldUser);
    client.setQueryData(['dashboard'], { recent: [{ name: 'Private old product' }] });
    client.setQueryData(['owner', 'summary'], { users: 10 });
    function SignedIn() {
      return <h1>{useAuth().user?.name}</h1>;
    }
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/login']}>
          <AuthProvider>
            <Routes>
              <Route path="/login" element={<AuthPage />} />
              <Route path="/app" element={<SignedIn />} />
            </Routes>
          </AuthProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: nextUser.email } });
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'Test password 123!' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Sign in/ }));
    await screen.findByRole('heading', { name: 'New account' });
    expect(client.getQueryData(['dashboard'])).toBeUndefined();
    expect(client.getQueryData(['owner', 'summary'])).toBeUndefined();
    expect(client.getQueryData(['me'])).toEqual(nextUser);
  });
});
