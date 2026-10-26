import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Moon, Sun, Languages } from 'lucide-react';
import { ar } from './translations/ar';

export type Language = 'en' | 'ar';
type Theme = 'light' | 'dark';
type Parameters = Record<string, string | number>;
export function translate(key: string, language: Language, parameters: Parameters = {}) {
  let message = language === 'ar' ? (ar[key] ?? key) : key;
  if (language === 'ar' && !ar[key]) {
    message = key
      .replace(/^Check the date in: (.+)$/, 'راجع التاريخ في: $1')
      .replace(/^Warranty reminder: (.+)$/, 'تذكير بالضمان: $1')
      .replace(
        /^(.+)'s warranty expires on (\d{4}-\d{2}-\d{2})\. Keep your receipts ready\.$/,
        'ينتهي ضمان $1 في $2. احتفظ بإيصالاتك جاهزة.',
      )
      .replace(
        /^Multiple (\w+) values found; enter the correct value manually\.$/,
        'توجد قيم متعارضة للحقل $1؛ أدخل القيمة الصحيحة يدويًا.',
      );
  }
  return message.replace(/\{(\w+)\}/g, (match, name: string) =>
    parameters[name] === undefined ? match : String(parameters[name]),
  );
}
function saved(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function persist(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* Preferences still work in memory. */
  }
}
const defaults = {
  language: 'en' as Language,
  theme: 'light' as Theme,
  setLanguage: (_language: Language) => {},
  setTheme: (_theme: Theme) => {},
  t: (key: string, parameters?: Parameters) => translate(key, 'en', parameters),
};
const Preferences = createContext(defaults);
export const usePreferences = () => useContext(Preferences);
export const getLocale = () => (document.documentElement.lang === 'ar' ? 'ar-EG' : 'en');

export function PreferencesProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguage] = useState<Language>(() =>
    saved('language') === 'ar' ? 'ar' : 'en',
  );
  const [theme, setTheme] = useState<Theme>(() => (saved('theme') === 'dark' ? 'dark' : 'light'));
  const changeLanguage = useCallback((next: Language) => {
    document.documentElement.lang = next;
    document.documentElement.dir = next === 'ar' ? 'rtl' : 'ltr';
    persist('language', next);
    setLanguage(next);
  }, []);
  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
    document.title =
      language === 'ar'
        ? 'WarrantyVault — منتجاتك وضماناتك'
        : 'WarrantyVault — A little peace of mind';
    persist('language', language);
  }, [language]);
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', theme === 'dark' ? '#171720' : '#f7f8fc');
    persist('theme', theme);
  }, [theme]);
  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.key === 'language') changeLanguage(event.newValue === 'ar' ? 'ar' : 'en');
      if (event.key === 'theme') setTheme(event.newValue === 'dark' ? 'dark' : 'light');
    };
    addEventListener('storage', sync);
    return () => removeEventListener('storage', sync);
  }, [changeLanguage]);
  const value = useMemo(
    () => ({
      language,
      theme,
      setLanguage: changeLanguage,
      setTheme,
      t: (key: string, parameters?: Parameters) => translate(key, language, parameters),
    }),
    [language, theme, changeLanguage],
  );
  return <Preferences.Provider value={value}>{children}</Preferences.Provider>;
}

export function PreferenceControls() {
  const { language, setLanguage, theme, setTheme, t } = usePreferences();
  return (
    <div className="preference-controls">
      <button
        type="button"
        className="preference-button"
        aria-label={t(theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode')}
        title={t(theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode')}
        onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
      >
        {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
      </button>
      <button
        type="button"
        className="preference-button language-button"
        aria-label={language === 'en' ? 'Switch to Arabic' : 'التبديل إلى الإنجليزية'}
        onClick={() => setLanguage(language === 'en' ? 'ar' : 'en')}
      >
        <Languages size={17} />
        <span lang={language === 'en' ? 'ar' : 'en'}>
          {language === 'en' ? 'العربية' : 'English'}
        </span>
      </button>
    </div>
  );
}

export function AppearanceSettings() {
  const { language, setLanguage, theme, setTheme, t } = usePreferences();
  return (
    <section className="card account-stack appearance-settings">
      <h2>{t('Appearance & language')}</h2>
      <p>{t('Your choices are saved on this device.')}</p>
      <fieldset>
        <legend>{t('Color theme')}</legend>
        <div className="preference-options">
          <button type="button" aria-pressed={theme === 'light'} onClick={() => setTheme('light')}>
            <Sun size={19} />
            {t('Light')}
          </button>
          <button type="button" aria-pressed={theme === 'dark'} onClick={() => setTheme('dark')}>
            <Moon size={19} />
            {t('Dark')}
          </button>
        </div>
      </fieldset>
      <fieldset>
        <legend>{t('Language')}</legend>
        <div className="preference-options">
          <button
            type="button"
            lang="en"
            aria-pressed={language === 'en'}
            onClick={() => setLanguage('en')}
          >
            English
          </button>
          <button
            type="button"
            lang="ar"
            aria-pressed={language === 'ar'}
            onClick={() => setLanguage('ar')}
          >
            العربية
          </button>
        </div>
      </fieldset>
    </section>
  );
}
