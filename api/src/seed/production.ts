import { DEFAULT_PLAN_SETTINGS, DEFAULT_SIZES, DEFAULT_THICKNESSES } from '../contracts/production';

/** Production settings (st_settings keys). Same as the seed rows in db/migrations/0009_production.sql. */
export const DEFAULT_PRODUCTION_SETTINGS: Record<string, unknown> = {
  'production.thicknesses': DEFAULT_THICKNESSES,
  'production.sizes': DEFAULT_SIZES,
  'production.boards_per_charge': DEFAULT_PLAN_SETTINGS.boardsPerCharge,
  'production.wet_wood_factor': DEFAULT_PLAN_SETTINGS.wetWoodFactor,
  'production.closed_fys': [],
};
