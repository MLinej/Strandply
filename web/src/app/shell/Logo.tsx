/**
 * Stand-in lockup, drawn after the mark in the current app. The mockup uses an uploaded image
 * that isn't in design-reference. Drop the real file in web/public/ and swap this out.
 */
export function LogoMark({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden>
      <path d="M16 4 28 10.5 16 17 4 10.5z" stroke="rgb(var(--primary))" strokeWidth="2" strokeLinejoin="round" />
      <path d="M4 15.5 16 22l12-6.5" stroke="rgb(var(--muted))" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      <path d="M4 20.5 16 27l12-6.5" stroke="rgb(var(--ink))" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export function Logo() {
  return (
    <span className="flex items-center gap-2" aria-label="Strandply">
      <LogoMark />
      <span className="text-xl font-bold tracking-tight text-ink">Strandply</span>
    </span>
  );
}
