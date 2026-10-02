/** Injected everywhere "now" matters, so tests can control time. */
export type Clock = () => Date;

export const systemClock: Clock = () => new Date();

export const isoNow = (clock: Clock): string => clock().toISOString();
