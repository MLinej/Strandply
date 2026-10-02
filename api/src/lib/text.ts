/** Lower-cases and collapses whitespace: the "same name" rule for every case-insensitive check. */
export const normName = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();
