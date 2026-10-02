import { clsx } from 'clsx';
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router';
import { isApiError } from '@/api/client';
import { Button, Input } from '@/components/ui';
import { FIRMS, useAuth, type FirmCode } from '../session';
import { Logo } from '../shell/Logo';

const MODULE_CHIPS = ['Purchase', 'Stores', 'Production', 'Sales', 'Samples', 'Transport', 'Accounts'];
const LAST_FIRM_KEY = 'strandply.lastFirm';

function lastFirm(): FirmCode {
  try {
    const v = localStorage.getItem(LAST_FIRM_KEY);
    return v === 'osb' ? 'osb' : 'llp';
  } catch {
    return 'llp';
  }
}

/** Only same-origin app paths, so ?next= can't send the user to another site after sign-in. */
export function safeNext(next: string | null): string {
  return next && next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/sign-in') ? next : '/';
}

/** The two large firm boxes from the Sign-in mockup (a radio group). */
function FirmChoice({ value, onChange }: { value: FirmCode; onChange: (f: FirmCode) => void }) {
  const options = Object.values(FIRMS);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  function onKeyDown(e: KeyboardEvent) {
    const delta = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!delta) return;
    e.preventDefault();
    const next = (options.findIndex((o) => o.code === value) + delta + options.length) % options.length;
    onChange(options[next]!.code);
    refs.current[next]?.focus();
  }
  return (
    <div className="flex flex-col gap-1.5">
      <span id="firm-label" className="text-sm font-semibold text-ink">
        Firm
      </span>
      <div role="radiogroup" aria-labelledby="firm-label" onKeyDown={onKeyDown} className="grid grid-cols-2 gap-2">
        {options.map((f, i) => {
          const active = f.code === value;
          return (
            <button
              key={f.code}
              ref={(el) => {
                refs.current[i] = el;
              }}
              type="button"
              role="radio"
              aria-checked={active}
              tabIndex={active ? 0 : -1}
              onClick={() => onChange(f.code)}
              className={clsx(
                'h-ctl-lg rounded border text-md transition-colors',
                active ? 'border-primary bg-primary-light font-semibold text-primary' : 'border-border bg-card font-medium text-muted hover:text-ink',
              )}
            >
              {f.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** 01 · Sign in (design-reference PDF p.1): flat grey page, white split card, one red action. */
export function SignInPage() {
  const { state, login } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));

  const [firm, setFirm] = useState<FirmCode>(lastFirm);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const userRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    document.title = 'Sign in · Strandply ERP';
    userRef.current?.focus();
  }, []);

  if (state.status === 'authenticated') return <Navigate to={next} replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!username.trim() || !password) {
      setError('Enter your user code and password.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await login(username.trim(), password, firm);
      try {
        localStorage.setItem(LAST_FIRM_KEY, firm);
      } catch {
        /* ignore */
      }
      navigate(next, { replace: true });
    } catch (err) {
      setPassword('');
      setError(
        isApiError(err, 'invalid_credentials')
          ? 'That user code and password don’t match.'
          : isApiError(err, 'account_inactive')
            ? 'This account is inactive. Ask the administrator to re-activate it.'
            : 'Can’t sign in right now. Check your connection and try again.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-subtle px-4 py-10">
      <div className="w-full max-w-[960px]">
        <div className="grid overflow-hidden rounded-lg border border-border bg-card md:grid-cols-2">
          <section className="flex flex-col gap-10 border-b border-border p-8 md:border-b-0 md:border-r md:p-11">
            <Logo height={40} />
            <div className="flex flex-1 flex-col justify-center gap-3">
              <span className="text-label font-semibold uppercase tracking-label text-faint">Factory ERP</span>
              <h1 className="text-[26px] font-bold leading-tight tracking-tight text-ink">One system for Strandply LLP and the OSB Unit</h1>
              <p className="max-w-sm text-lg text-muted">
                Purchase, stores, production, sales, transport and accounts. Each person sees the work their role owns.
              </p>
            </div>
            <ul className="flex flex-wrap gap-2" aria-label="Modules">
              {MODULE_CHIPS.map((m) => (
                <li key={m} className="rounded-full bg-subtle px-2.5 py-1 text-sm text-muted">
                  {m}
                </li>
              ))}
              <li className="rounded-full bg-subtle px-2.5 py-1 text-sm text-muted">+ 7 more</li>
            </ul>
          </section>

          <section className="flex flex-col justify-center p-8 md:p-14">
            <h2 className="text-h1 font-bold tracking-tight text-ink">Sign in</h2>
            <p className="mt-1 text-lg text-muted">Use the user code and password issued to you.</p>

            <form className="mt-6 flex flex-col gap-4" onSubmit={onSubmit} noValidate>
              <FirmChoice value={firm} onChange={setFirm} />
              <Input
                ref={userRef}
                label="User code"
                size="lg"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                placeholder="e.g. admin"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
              <Input
                label="Password"
                size="lg"
                type="password"
                autoComplete="current-password"
                placeholder="Your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              {error && (
                <p role="alert" className="rounded border border-primary-border bg-primary-tint px-3 py-2 text-base text-primary">
                  {error}
                </p>
              )}
              <Button type="submit" variant="primary" size="lg" fullWidth loading={busy}>
                Sign in
              </Button>
            </form>

            <p className="mt-6 border-t border-divider pt-4 text-base text-muted">
              Forgotten your password? Ask the administrator to reset it.
            </p>
          </section>
        </div>

        <footer className="mt-4 flex flex-wrap justify-between gap-2 text-sm text-faint">
          <span>
            Website{' '}
            <a href="https://strandplyosb.com" className="font-semibold text-ink hover:underline" target="_blank" rel="noreferrer">
              strandplyosb.com
            </a>
          </span>
          <span>© {new Date().getFullYear()} Strandply LLP. All rights reserved.</span>
        </footer>
      </div>
    </div>
  );
}

export default SignInPage;
