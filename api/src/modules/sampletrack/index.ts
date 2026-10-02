import { SecureRouter } from '../../auth/secure-router';
import { activityRoutes } from './routes/activity';
import { dispatchRoutes } from './routes/dispatches';
import { notificationRoutes, settingsRoutes } from './routes/notifications';
import { printRoutes } from './routes/print';
import { reportRoutes } from './routes/reports';
import { cityRoutes, courierRoutes, partyRoutes, productRoutes } from './routes/masters';
import { requestRoutes } from './routes/requests';
import { rolePermissionRoutes } from './routes/role-permissions';
import { userRoutes } from './routes/users';

/** SampleTrack endpoints, mounted at /api/sampletrack. */
export function sampletrackRoutes(): SecureRouter {
  const r = new SecureRouter();
  userRoutes(r);
  rolePermissionRoutes(r);
  activityRoutes(r);
  partyRoutes(r);
  courierRoutes(r);
  productRoutes(r);
  cityRoutes(r);
  requestRoutes(r);
  dispatchRoutes(r);
  printRoutes(r);
  reportRoutes(r);
  notificationRoutes(r);
  settingsRoutes(r);
  return r;
}
