import type { Context } from 'hono';
import { policy, requireAuthContext } from '../../../auth/guards';
import { SecureRouter } from '../../../auth/secure-router';
import { actorOf } from '../actor';
import { idParam } from './params';

const actor = (c: Context) => actorOf(requireAuthContext(c as never).user);

/**
 * Print and share payloads. All need the `print` action. Dispatch outputs are reachable from the
 * Dispatch or Live Tracking page (the legacy tracking panel had Print Label / QR / WhatsApp).
 */
export function printRoutes(r: SecureRouter) {
  const dispatchPrint = policy.anyPage(['dispatch', 'tracking'], 'print');

  r.get('/dispatches/:id/label', dispatchPrint, async (c) => c.json(await c.var.services.print.courierLabel(actor(c), idParam(c))));
  r.get('/dispatches/:id/whatsapp', dispatchPrint, async (c) => c.json(await c.var.services.print.whatsapp(actor(c), idParam(c))));
  r.get('/dispatches/:id/qr', dispatchPrint, async (c) => c.json(await c.var.services.print.qr(actor(c), idParam(c))));
  r.get('/requests/:id/slip', policy.page('requests', 'print'), async (c) =>
    c.json(await c.var.services.print.requestSlip(actor(c), idParam(c))),
  );
}
