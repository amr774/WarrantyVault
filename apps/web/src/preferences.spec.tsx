// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import {
  AppearanceSettings,
  PreferenceControls,
  PreferencesProvider,
  translate,
  usePreferences,
} from './preferences';

beforeEach(() => {
  localStorage.clear();
  document.documentElement.lang = 'en';
  document.documentElement.dir = 'ltr';
  document.documentElement.classList.remove('dark');
});
afterEach(cleanup);
function Draft() {
  const { t } = usePreferences();
  return (
    <label>
      {t('Product name')}
      <input defaultValue="My original product" />
    </label>
  );
}
function mount() {
  return render(
    <PreferencesProvider>
      <AppearanceSettings />
      <PreferenceControls />
      <Draft />
    </PreferencesProvider>,
  );
}
describe('Display preferences', () => {
  it('switches Arabic direction and labels while preserving draft values', () => {
    mount();
    fireEvent.change(screen.getByLabelText('Product name'), { target: { value: 'A user draft' } });
    fireEvent.click(screen.getByRole('button', { name: 'العربية' }));
    expect(document.documentElement.lang).toBe('ar');
    expect(document.documentElement.dir).toBe('rtl');
    expect(screen.getByRole('heading', { name: 'المظهر واللغة' })).toBeVisible();
    expect(screen.getByLabelText('اسم المنتج')).toHaveValue('A user draft');
    fireEvent.click(screen.getByRole('button', { name: 'English' }));
    expect(document.documentElement.dir).toBe('ltr');
    expect(screen.getByLabelText('Product name')).toHaveValue('A user draft');
  });
  it('persists both choices when the provider mounts again', () => {
    const view = mount();
    fireEvent.click(screen.getByRole('button', { name: 'Dark' }));
    fireEvent.click(screen.getByRole('button', { name: 'العربية' }));
    expect(localStorage.getItem('theme')).toBe('dark');
    expect(localStorage.getItem('language')).toBe('ar');
    view.unmount();
    mount();
    expect(document.documentElement).toHaveClass('dark');
    expect(screen.getByRole('button', { name: 'داكن' })).toHaveAttribute('aria-pressed', 'true');
    expect(document.documentElement.lang).toBe('ar');
    fireEvent.click(screen.getByRole('button', { name: 'فاتح' }));
    expect(document.documentElement).not.toHaveClass('dark');
  });
  it('syncs display choices changed in another tab', () => {
    mount();
    fireEvent(window, new StorageEvent('storage', { key: 'language', newValue: 'ar' }));
    fireEvent(window, new StorageEvent('storage', { key: 'theme', newValue: 'dark' }));
    expect(document.documentElement.dir).toBe('rtl');
    expect(document.documentElement).toHaveClass('dark');
  });
  it('interpolates translated labels and preserves original document content', () => {
    expect(translate('Page {page} of {pages}', 'ar', { page: 2, pages: 4 })).toBe('صفحة 2 من 4');
    expect(translate('Warranty reminder: Camera A1', 'ar')).toBe('تذكير بالضمان: Camera A1');
    expect(translate('Original receipt item 123', 'ar')).toBe('Original receipt item 123');
    expect(translate('Brand', 'en')).toBe('Brand');
  });
});
