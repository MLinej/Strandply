// Shared with the web app (import type only).

/** A role's SampleTrack pages, actions and dashboard widgets, as /api/me returns them. */
export interface PermissionSetView {
  pages: string[];
  actions: string[];
  widgets: string[];
}
