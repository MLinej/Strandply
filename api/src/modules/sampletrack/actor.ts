import type { Role } from '../../domain/access';
import type { User } from '../../repos';

/** The signed-in user performing an action. */
export interface Actor {
  id: string;
  name: string;
  role: Role;
}

export const actorOf = (user: User): Actor => ({ id: user.id, name: user.name, role: user.role });
