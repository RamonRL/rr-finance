import { useState } from 'react';
import AnimatedBackground from '../AnimatedBackground';
import { API_URL } from '../constants';

export default function LoginPage({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      if (res.ok) {
        const { token } = await res.json();
        localStorage.setItem('authToken', token);
        onLogin(token);
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.detail || 'Invalid credentials');
      }
    } catch {
      setError('Could not connect to server');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <AnimatedBackground />
      <div className="min-h-screen flex items-center justify-center px-4 relative z-[1]">
        <div className="w-full max-w-sm">
          {/* Logo */}
          <div className="flex flex-col items-center mb-8">
            <img src="/newlogo.png" alt="RR Finance" className="h-16 w-auto object-contain mb-3" />
            <p className="text-xs text-secondary">Personal finance tracker</p>
          </div>

          {/* Card */}
          <form
            onSubmit={handleSubmit}
            className="bg-overlay backdrop-blur-lg border border-white/[0.06] rounded-2xl px-6 py-8 flex flex-col gap-5"
          >
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-secondary font-medium uppercase tracking-wider">
                Username
              </label>
              <input
                type="text"
                autoComplete="username"
                value={username}
                onChange={e => setUsername(e.target.value)}
                required
                className="bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2.5 text-sm text-white placeholder-white/20 outline-none focus:border-accent-green/50 focus:ring-1 focus:ring-accent-green/20 transition-colors"
                placeholder="Enter username"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-secondary font-medium uppercase tracking-wider">
                Password
              </label>
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                className="bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2.5 text-sm text-white placeholder-white/20 outline-none focus:border-accent-green/50 focus:ring-1 focus:ring-accent-green/20 transition-colors"
                placeholder="Enter password"
              />
            </div>

            {error && (
              <p className="text-xs text-accent-red text-center">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="mt-1 w-full py-2.5 rounded-lg text-sm font-semibold bg-accent-green/15 text-accent-green border border-accent-green/30 hover:bg-accent-green/25 hover:border-accent-green/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <p className="text-center text-muted text-[10px] uppercase tracking-[0.2em] font-bold mt-6">
            RR Finance &copy; 2026
          </p>
        </div>
      </div>
    </>
  );
}
