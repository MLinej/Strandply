// Purchase module reference data: the type masters (legacy NILGIRI_TYPES / FACE_VENEER_TYPES defaults).
// Same as the INSERTs in db/migrations/0006_purchase.sql.
import type { PurchaseType, TypeKind } from '../contracts/purchase';

type Ref<T> = Omit<T, 'createdBy' | 'createdAt' | 'updatedAt' | 'deletedAt'>;
const type = (kind: TypeKind, name: string, sortOrder: number): Ref<PurchaseType> => ({
  id: `ptype-${kind === 'nilgiri_species' ? 'nilgiri' : 'veneer'}-${name.toLowerCase()}`,
  kind,
  name,
  sortOrder,
});

export const REF_PURCHASE_TYPES: Ref<PurchaseType>[] = [
  type('nilgiri_species', 'Eucalyptus', 1),
  type('nilgiri_species', 'Subabul', 2),
  type('nilgiri_species', 'Other', 3),
  type('face_veneer', 'Teak', 1),
  type('face_veneer', 'Walnut', 2),
  type('face_veneer', 'Oak', 3),
  type('face_veneer', 'Other', 4),
];
