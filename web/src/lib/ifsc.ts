export interface IfscMatch {
  bank: string;
  branch: string;
  city: string | null;
}

const IFSC = /^[A-Z]{4}0[A-Z0-9]{6}$/;

/**
 * Bank and branch for an IFSC from Razorpay's public IFSC directory (what the legacy Transport form used).
 * Resolves null when the code is malformed, unknown or the lookup can't be reached, so the form falls back to typing.
 */
export async function lookupIfsc(code: string, signal?: AbortSignal): Promise<IfscMatch | null> {
  const ifsc = code.trim().toUpperCase();
  if (!IFSC.test(ifsc)) return null;
  try {
    const res = await fetch(`https://ifsc.razorpay.com/${ifsc}`, { signal });
    if (!res.ok) return null;
    const d = (await res.json()) as { BANK?: string; BRANCH?: string; CITY?: string };
    return d.BANK ? { bank: d.BANK, branch: d.BRANCH ?? '', city: d.CITY ?? null } : null;
  } catch {
    return null;
  }
}
