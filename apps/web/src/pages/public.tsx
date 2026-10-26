import { usePreferences, PreferenceControls } from '../preferences';
import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  ShieldCheck,
  ArrowUpRight,
  Check,
  ReceiptText,
  BellRing,
  LockKeyhole,
  Package,
} from 'lucide-react';
import { api, json } from '../api';
import { Button } from '../components/ui/button';
export function Logo() {
  return (
    <Link to="/" className="logo">
      <span>
        <ShieldCheck size={24} />
      </span>
      Warranty<span className="logo-light">Vault</span>
    </Link>
  );
}
export function PublicPage() {
  const { t } = usePreferences();
  const path = useLocation().pathname;
  return (
    <div className="public">
      <header>
        <Logo />
        <nav>
          <PreferenceControls />
          <Link to="/features">{t('Features')}</Link>
          <Link to="/pricing">{t('Pricing')}</Link>
          <Link to="/login">{t('Sign in')}</Link>
          <Button asChild>
            <Link to="/register">
              {t('Get started')}
              <ArrowUpRight size={16} />
            </Link>
          </Button>
        </nav>
      </header>
      {path === '/pricing' ? (
        <section className="public-content">
          <span className="eyebrow">{t('SIMPLE BY DESIGN')}</span>
          <h1>
            {t('Peace of mind.')}
            <br />
            {t('Without the price tag.')}
          </h1>
          <p>{t('Start with the essentials. Grow when you’re ready.')}</p>
          <div className="pricing-grid">
            <article className="card">
              <h2>{t('Free')}</h2>
              <h1>
                $0<span>{t('/ forever')}</span>
              </h1>
              <p>{t('For the things that matter.')}</p>
              {[
                t('5 products'),
                t('50 MB private receipt storage'),
                t('Warranty tracking'),
                t('30, 7 and 1-day reminders'),
              ].map((s) => (
                <p key={s}>
                  <Check size={16} /> {s}
                </p>
              ))}
              <Button asChild>
                <Link to="/register">{t('Create free account')}</Link>
              </Button>
            </article>
            <article className="card">
              <span className="badge">{t('Coming later')}</span>
              <h2>{t('Premium')}</h2>
              <p>{t('More room for everything you own.')}</p>
              {[
                t('More products and storage'),
                t('Custom reminder schedules'),
                t('Family sharing — planned'),
                t('Advanced analytics — planned'),
              ].map((s) => (
                <p key={s}>
                  <Check size={16} /> {s}
                </p>
              ))}
              <Button disabled>{t('Not available for purchase')}</Button>
            </article>
          </div>
        </section>
      ) : (
        <>
          <section className="hero">
            <div>
              <span className="eyebrow">
                <span className="dot" />
                {t('YOUR PURCHASES, PROTECTED')}
              </span>
              <h1>
                {t('Keep the receipt.')}
                <br />
                <em>{t('Lose the worry.')}</em>
              </h1>
              <p>
                {t(
                  'A thoughtful home for your products, receipts, and warranties. Know what’s covered, find what you need, and never miss an expiration.',
                )}
              </p>
              <div className="actions">
                <Button asChild>
                  <Link to="/register">
                    {t('Start your free vault')}
                    <ArrowUpRight size={18} />
                  </Link>
                </Button>
                <Link to="/features">{t('Explore the features →')}</Link>
              </div>
              <small>{t('Free to start. No credit card needed.')}</small>
            </div>
            <div className="hero-art">
              <div className="art-orbit" />
              <div className="floating-note">
                <ShieldCheck size={20} />
                {t('A little peace of mind.')}
              </div>
              <div className="vault-card">
                <span className="eyebrow">{t('YOUR PERSONAL VAULT')}</span>
                <div className="vault-symbol">
                  <ShieldCheck size={64} />
                </div>
                <h2>
                  {t('Good things.')}
                  <br />
                  {t('Well protected.')}
                </h2>
                <div className="vault-line">
                  <Package size={20} />
                  {t('Everything in its place')}
                  <Check size={18} />
                </div>
                <div className="vault-line">
                  <ReceiptText size={20} />
                  {t('Receipts, ready when you are')}
                  <Check size={18} />
                </div>
                <div className="vault-line">
                  <BellRing size={20} />
                  {t('A reminder before it’s too late')}
                  <Check size={18} />
                </div>
              </div>
              <span className="art-label">{t('ORGANIZED LIFE. CLEARER MIND.')}</span>
            </div>
          </section>
          <section className="feature-section">
            <span className="eyebrow">{t('LESS SEARCHING. MORE LIVING.')}</span>
            <h2>{t('One small habit. A lot less hassle.')}</h2>
            <div className="feature-grid">
              {[
                [
                  ReceiptText,
                  t('Every receipt, right here'),
                  t('Save original receipts privately alongside the products they belong to.'),
                ],
                [
                  BellRing,
                  t('A heads-up that helps'),
                  t('Get notified before coverage ends, even when you’re away from the app.'),
                ],
                [
                  LockKeyhole,
                  t('Yours stays yours'),
                  t('Private files, secure sessions, and access that belongs to you.'),
                ],
              ].map(([Icon, title, text]: any) => (
                <article className="card" key={title}>
                  <Icon className="accent" size={28} />
                  <h3>{title}</h3>
                  <p>{text}</p>
                </article>
              ))}
            </div>
          </section>
        </>
      )}
      <footer>
        <Logo />
        <span>{t('A little order. A little peace of mind.')}</span>
        <span>© {new Date().getFullYear()} WarrantyVault</span>
      </footer>
    </div>
  );
}
const authSchema = z.object({
  email: z.email('Enter a valid email'),
  password: z.string().min(12, 'Use at least 12 characters').max(72),
  name: z.string().optional(),
});
export function AuthPage() {
  const { t } = usePreferences();
  const path = useLocation().pathname;
  const register = path === '/register';
  const forgot = path === '/forgot-password';
  const reset = path === '/reset-password';
  const verify = path === '/verify-email';
  const navigate = useNavigate();
  const client = useQueryClient();
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const schema = forgot
    ? authSchema.pick({ email: true })
    : reset
      ? authSchema.pick({ password: true })
      : verify
        ? z.object({})
        : register
          ? authSchema.extend({ name: z.string().trim().min(1, t('Enter your name')) })
          : authSchema;
  const {
    register: field,
    handleSubmit,
    formState: { errors },
  } = useForm<any>({ resolver: zodResolver(schema) });
  const submit = async (values: any) => {
    setBusy(true);
    setError('');
    try {
      const token = new URLSearchParams(location.hash.slice(1)).get('token');
      if (verify) {
        await api('/auth/verify-email', json('POST', { token }));
        setMessage(t('Your email is verified. You’re all set.'));
        await client.invalidateQueries({ queryKey: ['me'] });
      } else if (forgot) {
        const result = await api('/auth/forgot-password', json('POST', values));
        setMessage(result.message);
      } else if (reset) {
        await api('/auth/reset-password', json('POST', { ...values, token }));
        history.replaceState(null, '', path);
        setMessage(t('Password updated. Sign in with your new password.'));
      } else {
        const account = await api(`/auth/${register ? 'register' : 'login'}`, json('POST', values));
        await client.cancelQueries();
        // Preserve the observed auth query so AuthProvider receives the new identity.
        client.removeQueries({ predicate: (query) => query.queryKey[0] !== 'me' });
        client.getMutationCache().clear();
        client.setQueryData(['me'], account);
        navigate(account.role === 'OWNER' ? '/app/owner' : '/app');
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const title = register
    ? t('A home for what you own.')
    : forgot
      ? t('Forgot your password?')
      : reset
        ? t('A fresh start.')
        : verify
          ? t('Make it official.')
          : t('Welcome back.');
  return (
    <div className="auth-page">
      <div className="auth-story">
        <Logo />
        <div>
          <span className="eyebrow">{t('LESS TO REMEMBER.')}</span>
          <h1>
            {t('More room')}
            <br />
            {t('for peace')}
            <br />
            {t('of mind.')}
          </h1>
          <p>
            {t('Your products, receipts and warranties.')}
            <br />
            {t('Together, at last.')}
          </p>
          <ShieldCheck size={90} strokeWidth={1} />
        </div>
        <small>{t('YOUR PURCHASES, PROTECTED.')}</small>
      </div>
      <main className="auth-form">
        <div className="auth-preferences">
          <PreferenceControls />
        </div>
        <Link className="back" to="/">
          {t('← Back to home')}
        </Link>
        <h1>{title}</h1>
        <p>
          {register
            ? t('Start your free vault. No credit card needed.')
            : forgot
              ? t('We’ll send a link to get you back into your vault.')
              : reset
                ? t('Choose a strong password with at least 12 characters.')
                : verify
                  ? t('Confirm your email to receive warranty reminders.')
                  : t('Your vault is right where you left it.')}
        </p>
        {message ? (
          <div className="notice">
            {t(message)}
            <p>
              <Link to="/login">{t('Continue to sign in →')}</Link>
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit(submit)}>
            {register && (
              <label>
                {t('Your name')}
                <input autoComplete="name" {...field('name')} />
                <small className="error">{t(String(errors.name?.message ?? ''))}</small>
              </label>
            )}
            {!reset && !verify && (
              <label>
                {t('Email address')}
                <input
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  {...field('email')}
                />
                <small className="error">{t(String(errors.email?.message ?? ''))}</small>
              </label>
            )}
            {!forgot && !verify && (
              <label>
                {t('Password')}
                <input
                  type="password"
                  autoComplete={register || reset ? 'new-password' : 'current-password'}
                  {...field('password')}
                />
                <small className="error">{t(String(errors.password?.message ?? ''))}</small>
              </label>
            )}
            {error && (
              <p role="alert" className="error">
                {t(error)}
              </p>
            )}
            <Button disabled={busy} type="submit">
              {busy
                ? t('One moment…')
                : register
                  ? t('Create your vault')
                  : forgot
                    ? t('Send reset link')
                    : reset
                      ? t('Update password')
                      : verify
                        ? t('Verify my email')
                        : t('Sign in')}{' '}
              <ArrowUpRight size={17} />
            </Button>
          </form>
        )}
        {path === '/login' && <Link to="/forgot-password">{t('Forgot password?')}</Link>}
        {!forgot && !reset && !verify && (
          <p>
            {register ? t('Already have an account?') : t('New around here?')}{' '}
            <Link to={register ? '/login' : '/register'}>
              {register ? t('Sign in') : t('Create a free account')}
            </Link>
          </p>
        )}
        <small className="muted">
          <LockKeyhole size={13} />
          {t('Secure, private, and always yours.')}
        </small>
      </main>
    </div>
  );
}
