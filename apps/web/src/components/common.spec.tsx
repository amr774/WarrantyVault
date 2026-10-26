// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { MemoryRouter } from 'react-router-dom';
import { Badge, Empty, ProductRow } from './common';
afterEach(cleanup);
describe('warranty views', () => {
  it('shows text status, not color alone', () => {
    render(<Badge status="EXPIRING_SOON" />);
    expect(screen.getByText('Expiring soon')).toBeVisible();
  });
  it('offers a real first-product route in an empty vault', () => {
    render(
      <MemoryRouter>
        <Empty />
      </MemoryRouter>,
    );
    expect(screen.getByRole('link', { name: /Add your first product/ })).toHaveAttribute(
      'href',
      '/app/products/new',
    );
  });
  it('renders server-provided days and date', () => {
    render(
      <MemoryRouter>
        <ProductRow
          product={{
            id: '123',
            name: 'Camera',
            brand: 'Acme',
            category: { name: 'Electronics' },
            expiresAt: '2026-10-30',
            daysRemaining: 7,
            status: 'EXPIRING_SOON',
          }}
        />
      </MemoryRouter>,
    );
    expect(screen.getByText('7 days remaining')).toBeVisible();
    expect(screen.getByRole('link')).toHaveAttribute('href', '/app/products/123');
  });
});
