import { FormEvent, useState } from 'react';
import { api } from './api';
import Workspace from './Workspace';

type Mode = 'login' | 'register';
export default function App() {
  const [mode, setMode] = useState<Mode>('login');
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ user: { name: string }; gym: { name: string } } | null>(null);
  const [dashboard, setDashboard] = useState<any>(null);
  const [dashError, setDashError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setBusy(true);
    const form = new FormData(event.currentTarget);
    try {
      const body = mode === 'login'
        ? { email: form.get('email'), password: form.get('password') }
        : { name: form.get('name'), email: form.get('email'), password: form.get('password'), gymName: form.get('gymName') };
      const { data } = await api.post(`/auth/${mode}`, body); setResult(data);
    } catch (e: any) { setError(e?.response?.data?.error || 'Could not connect to GymFlow. Check that the API is running.'); }
    finally { setBusy(false); }
  }
  async function openWorkspace() {
    setBusy(true); setDashError('');
    try { const { data } = await api.get('/dashboard'); setDashboard(data); }
    catch (e: any) { setDashError(e?.response?.data?.error || 'Could not load the dashboard. Check the API and database connection.'); }
    finally { setBusy(false); }
  }
  if (result && dashboard) return <Workspace user={result.user} gym={result.gym} onLogout={async()=>{await api.post('/auth/logout');setDashboard(null);setResult(null);setMode('login');}}/>;
  return <main className="shell"><aside className="story"><div className="brand"><span className="mark">G</span> gymflow</div><div className="story-copy"><p className="eyebrow">YOUR GYM, IN SYNC</p><h1>Build a stronger<br/><em>community.</em></h1><p className="muted">Memberships, renewals, and payments in one calm, clear workspace.</p></div><div className="story-bottom"><div className="pulse"/> Made for the people who keep us moving</div></aside><section className="panel"><div className="mobile-brand"><span className="mark">G</span> gymflow</div><div className="form-wrap">{result ? <div className="success"><div className="success-icon">✓</div><p className="eyebrow">YOU’RE ALL SET</p><h2>Welcome, {result.user.name}.</h2><p className="muted"><b>{result.gym.name}</b> is ready for its first members. Your secure session is active.</p>{dashError && <p className="error" role="alert">{dashError}</p>}<button className="primary" disabled={busy} onClick={openWorkspace}>{busy ? "Loading workspace…" : "Continue to workspace"} <span>→</span></button></div> : <><div className="heading"><p className="eyebrow">{mode === 'login' ? 'WELCOME BACK' : 'GET STARTED'}</p><h2>{mode === 'login' ? 'Sign in to GymFlow' : 'Create your workspace'}</h2><p className="muted">{mode === 'login' ? 'Your gym is right where you left it.' : 'A better rhythm for your gym starts here.'}</p></div><form onSubmit={submit}>{mode === 'register' && <><label>Your name<input name="name" autoComplete="name" placeholder="e.g. Alex Morgan" required maxLength={100}/></label><label>Gym name<input name="gymName" placeholder="e.g. Northside Fitness" required maxLength={120}/></label></>}<label>Email address<input name="email" type="email" autoComplete="email" placeholder="you@yourgym.com" required maxLength={254}/></label><label>Password<span className="password-control"><input name="password" type={showPassword ? 'text' : 'password'} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} placeholder={mode === 'login' ? 'Enter your password' : 'At least 10 characters'} minLength={mode === 'login' ? 1 : 10} maxLength={128} required/><button type="button" className="password-toggle" aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword} onClick={() => setShowPassword(value => !value)}>{showPassword ? 'Hide' : 'Show'}</button></span></label>{error && <p className="error" role="alert">{error}</p>}<button className="primary" disabled={busy}>{busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'} <span>→</span></button></form><p className="switch">{mode === 'login' ? 'New to GymFlow?' : 'Already have an account?'} <button onClick={() => { setError(''); setShowPassword(false); setMode(mode === 'login' ? 'register' : 'login'); }}>{mode === 'login' ? 'Create an account' : 'Sign in'}</button></p></>}</div><footer>© 2026 GymFlow <span>Secure by design</span></footer></section></main>;
}
