import { FormEvent, useEffect, useState } from 'react';
import { api } from './api';
import { Alert } from './components/common/Alert';
import Workspace from './Workspace';

type Mode = 'login' | 'register' | 'forgot' | 'reset';
type Session = { user: { name: string }; gym: { name: string; logoUrl?: string } };

export default function App() {
  const [mode, setMode] = useState<Mode>('login');
  const [busy, setBusy] = useState(false);
  const [booting, setBooting] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [resetEmail, setResetEmail] = useState('');
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data } = await api.get('/auth/me');
        if (alive) setSession({ user: data.user, gym: data.gym });
      } catch {
        if (alive) setSession(null);
      } finally {
        if (alive) setBooting(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  function switchMode(next: Mode) {
    setMode(next);
    setError('');
    setNotice('');
    setShowPassword(false);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setNotice('');
    setBusy(true);
    const form = new FormData(event.currentTarget);

    try {
      if (mode === 'login' || mode === 'register') {
        const body =
          mode === 'login'
            ? { email: form.get('email'), password: form.get('password') }
            : {
                name: form.get('name'),
                email: form.get('email'),
                password: form.get('password'),
                gymName: form.get('gymName'),
              };
        const { data } = await api.post(`/auth/${mode}`, body);
        setSession({ user: data.user, gym: data.gym });
        return;
      }

      if (mode === 'forgot') {
        const email = String(form.get('email') || '');
        const { data } = await api.post('/auth/forgot-password', { email });
        setResetEmail(email);
        setNotice(data.message || 'If an account exists for that email, a reset code has been sent.');
        setMode('reset');
        return;
      }

      const email = String(form.get('email') || resetEmail);
      const { data } = await api.post('/auth/reset-password', {
        email,
        otp: form.get('otp'),
        password: form.get('password'),
      });
      setNotice(data.message || 'Password updated. You can sign in now.');
      setResetEmail(email);
      setMode('login');
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Could not connect to GymFlow. Check that the API is running.');
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    try {
      await api.post('/auth/logout');
    } finally {
      setSession(null);
      switchMode('login');
      setResetEmail('');
    }
  }

  if (booting) {
    return (
      <main className="boot-shell">
        <div className="boot-card">
          <span className="mark">G</span>
          <p>Loading your workspace…</p>
        </div>
      </main>
    );
  }

  if (session) {
    return <Workspace user={session.user} gym={session.gym} onLogout={logout} />;
  }

  const heading =
    mode === 'login'
      ? { eyebrow: 'WELCOME BACK', title: 'Sign in to GymFlow', detail: 'Your gym is right where you left it.' }
      : mode === 'register'
        ? { eyebrow: 'GET STARTED', title: 'Create your workspace', detail: 'A better rhythm for your gym starts here.' }
        : mode === 'forgot'
          ? { eyebrow: 'RESET ACCESS', title: 'Forgot your password?', detail: 'We’ll email a one-time code so you can set a new password.' }
          : { eyebrow: 'ENTER CODE', title: 'Reset with OTP', detail: 'Enter the 6-digit code from your email and choose a new password.' };

  return (
    <main className="shell">
      <aside className="story">
        <div className="brand">
          <span className="mark">G</span> gymflow
        </div>
        <div className="story-copy">
          <p className="eyebrow">YOUR GYM, IN SYNC</p>
          <h1>
            Build a stronger
            <br />
            <em>community.</em>
          </h1>
          <p className="muted">Memberships, renewals, and payments in one calm, clear workspace.</p>
        </div>
        <div className="story-bottom">
          <div className="pulse" /> Made for the people who keep us moving
        </div>
      </aside>

      <section className="panel">
        <div className="mobile-brand">
          <span className="mark">G</span> gymflow
        </div>
        <div className="form-wrap">
          <div className="heading">
            <p className="eyebrow">{heading.eyebrow}</p>
            <h2>{heading.title}</h2>
            <p className="muted">{heading.detail}</p>
          </div>

          {(mode === 'forgot' || mode === 'reset') && (
            <ol className="auth-steps" aria-label="Password reset steps">
              <li className={mode === 'forgot' ? 'active' : 'done'}>1. Email</li>
              <li className={mode === 'reset' ? 'active' : ''}>2. OTP &amp; password</li>
            </ol>
          )}

          <form onSubmit={submit}>
            {mode === 'register' && (
              <>
                <label>
                  Your name
                  <input name="name" autoComplete="name" placeholder="e.g. Alex Morgan" required maxLength={100} />
                </label>
                <label>
                  Gym name
                  <input name="gymName" placeholder="e.g. Northside Fitness" required maxLength={120} />
                </label>
              </>
            )}

            {(mode === 'login' || mode === 'register' || mode === 'forgot' || mode === 'reset') && (
              <label>
                Email address
                <input
                  name="email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@yourgym.com"
                  required
                  maxLength={254}
                  defaultValue={resetEmail}
                  key={`${mode}-${resetEmail}`}
                />
              </label>
            )}

            {mode === 'reset' && (
              <label>
                OTP code
                <input name="otp" inputMode="numeric" pattern="\d{6}" placeholder="6-digit code" required maxLength={6} autoComplete="one-time-code" />
              </label>
            )}

            {(mode === 'login' || mode === 'register' || mode === 'reset') && (
              <label>
                {mode === 'reset' ? 'New password' : 'Password'}
                <span className="password-control">
                  <input
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                    placeholder={mode === 'login' ? 'Enter your password' : 'At least 10 characters'}
                    minLength={mode === 'login' ? 1 : 10}
                    maxLength={128}
                    required
                  />
                  <button
                    type="button"
                    className="password-toggle"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    aria-pressed={showPassword}
                    onClick={() => setShowPassword((value) => !value)}
                  >
                    {showPassword ? 'Hide' : 'Show'}
                  </button>
                </span>
              </label>
            )}

            {mode === 'login' && (
              <div className="auth-links">
                <button type="button" className="link-btn" onClick={() => switchMode('forgot')}>
                  Forgot password?
                </button>
              </div>
            )}

            {error && <Alert>{error}</Alert>}
            {notice && <Alert tone="success">{notice}</Alert>}

            <button className="primary" disabled={busy}>
              {busy
                ? 'Please wait…'
                : mode === 'login'
                  ? 'Sign in'
                  : mode === 'register'
                    ? 'Create account'
                    : mode === 'forgot'
                      ? 'Send reset code'
                      : 'Update password'}{' '}
              <span>→</span>
            </button>
          </form>

          <p className="switch">
            {mode === 'login' && (
              <>
                New to GymFlow?{' '}
                <button type="button" onClick={() => switchMode('register')}>
                  Create an account
                </button>
              </>
            )}
            {mode === 'register' && (
              <>
                Already have an account?{' '}
                <button type="button" onClick={() => switchMode('login')}>
                  Sign in
                </button>
              </>
            )}
            {(mode === 'forgot' || mode === 'reset') && (
              <>
                Remembered your password?{' '}
                <button type="button" onClick={() => switchMode('login')}>
                  Back to sign in
                </button>
              </>
            )}
          </p>

          {mode === 'reset' && (
            <p className="switch">
              Didn’t get a code?{' '}
              <button type="button" onClick={() => switchMode('forgot')}>
                Resend OTP
              </button>
            </p>
          )}
        </div>
        <footer>
          © 2026 GymFlow <span>Secure by design</span>
        </footer>
      </section>
    </main>
  );
}
