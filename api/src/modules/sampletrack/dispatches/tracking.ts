import {
  OFF_PATH_STATUSES,
  TIMELINE_STEPS,
  type DispatchHistoryView,
  type DispatchStatus,
  type OffPathEvent,
  type TimelineStep,
  type TrackingLink,
} from '../../../contracts/sampletrack';
import { normName } from '../../../lib/text';

/** Built-in tracking pages, used when the courier has no template of its own (legacy getTrackingUrl). */
export const BUILTIN_TRACKING_TEMPLATES: Record<string, string> = {
  'blue dart': 'https://www.bluedart.com/tracking?trackfor={tracking}',
  bluedart: 'https://www.bluedart.com/tracking?trackfor={tracking}',
  dtdc: 'https://www.dtdc.in/tracking.asp?REF_NO={tracking}',
  delhivery: 'https://www.delhivery.com/track/package/{tracking}',
};

/**
 * 1. The courier's own template ('{tracking}' is replaced, URL-encoded). A template without the
 *    placeholder is used as-is.
 * 2. A built-in for Blue Dart, DTDC or Delhivery, matched on the courier name (master or manual), ignoring case.
 * 3. Otherwise the text "Contact courier with tracking number: X".
 * Returns null when there's no tracking number.
 */
export function resolveTracking(
  trackingNo: string | null | undefined,
  courierName: string | null | undefined,
  template: string | null | undefined,
): TrackingLink | null {
  const no = trackingNo?.trim();
  if (!no) return null;
  const tpl = template?.trim() || (courierName ? BUILTIN_TRACKING_TEMPLATES[normName(courierName)] : undefined);
  if (tpl) return { kind: 'url', url: tpl.split('{tracking}').join(encodeURIComponent(no)) };
  return { kind: 'text', text: `Contact courier with tracking number: ${no}` };
}

const ON_PATH = TIMELINE_STEPS as readonly DispatchStatus[];
const OFF_PATH = OFF_PATH_STATUSES as readonly DispatchStatus[];

/**
 * The tracking timeline for the 6 normal-path steps. Each step's time is the latest history
 * entry for that status.
 * - Status on the path: earlier steps are done (with no time if they were skipped), the
 *   current step is current, and later ones are pending. Delivered counts as done.
 * - Status off the path (Delayed/Returned): progress is the furthest step reached in history.
 *   Those steps are done, and the off-path event is flagged current.
 */
export function buildTimeline(
  status: DispatchStatus,
  history: DispatchHistoryView[],
): { timeline: TimelineStep[]; offPath: OffPathEvent[] } {
  const latest = new Map<DispatchStatus, DispatchHistoryView>();
  for (const h of history) latest.set(h.status, h);

  const onPath = ON_PATH.indexOf(status);
  const reached = onPath >= 0 ? onPath : Math.max(-1, ...history.map((h) => ON_PATH.indexOf(h.status)));

  const timeline = TIMELINE_STEPS.map((step, i): TimelineStep => {
    const h = latest.get(step);
    const state: TimelineStep['state'] =
      onPath >= 0 ? (i < onPath || (i === onPath && step === 'Delivered') ? 'done' : i === onPath ? 'current' : 'pending') : i <= reached ? 'done' : 'pending';
    return { status: step, state, at: h?.changedAt ?? null, by: h?.changedByName ?? null };
  });

  const lastOff = [...history].reverse().find((h) => OFF_PATH.includes(h.status));
  const offPath = history
    .filter((h) => OFF_PATH.includes(h.status))
    .map(
      (h): OffPathEvent => ({
        status: h.status as OffPathEvent['status'],
        at: h.changedAt,
        by: h.changedByName,
        note: h.note,
        current: OFF_PATH.includes(status) && h === lastOff && h.status === status,
      }),
    );
  return { timeline, offPath };
}
