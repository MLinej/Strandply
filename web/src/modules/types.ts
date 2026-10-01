import type { ComponentType } from 'react';

/**
 * What each src/modules/<key>/index.tsx exports. Keys are page slugs from app/modules.ts
 * ("index" for Home and single-page modules). Missing keys render the "not built yet" page.
 * Each module file is its own lazy chunk: nothing in it loads until someone opens that module.
 */
export type ModulePages = Partial<Record<string, ComponentType>>;
