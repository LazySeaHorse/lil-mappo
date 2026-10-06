/**
 * The complete, typed vocabulary of analytics events. Adding an event means
 * adding it here first: `track()` rejects unknown names at compile time.
 *
 * Privacy rule: properties are enums, booleans, ids or coarse buckets. NEVER add
 * coordinates, route geometry, project names, search queries, addresses, file
 * names or any free text.
 */

export type RouteSource =
  | 'car'
  | 'flight'
  | 'walk'
  | 'import_gpx'
  | 'import_kml'
  | 'import_geojson'
  | 'ai'
  | 'deep_link';

export type ProjectSource = 'blank' | 'import_file' | 'deep_link';

/** Where the upgrade modal was opened from. */
export type UpgradeWhere =
  | 'map_load_gate'
  | 'vehicle_lock'
  | 'project_settings'
  | 'export_limits'
  | 'cloud_slots'
  | 'ai'
  | 'account_settings'
  | 'account_menu';

export type ExportErrorClass = 'unsupported' | 'encoder' | 'capture' | 'oom' | 'other';

export type ImportErrorClass = 'parse' | 'empty' | 'other';
export type ImportFormat = 'gpx' | 'kml' | 'geojson' | 'unknown';

export type StorageKind = 'local' | 'cloud';

// ── Buckets (keep cardinality low and values non-identifying) ───────────────

export type PointBucket = '2-10' | '11-100' | '101-1k' | '1k-10k' | '10k+';
export type DurationBucket = '<10s' | '10-30s' | '30-60s' | '1-3m' | '3m+';
export type CountBucket = '0' | '1' | '2-5' | '6-20' | '21+';

export function bucketPointCount(n: number): PointBucket {
  if (n <= 10) return '2-10';
  if (n <= 100) return '11-100';
  if (n <= 1000) return '101-1k';
  if (n <= 10000) return '1k-10k';
  return '10k+';
}

export function bucketDuration(seconds: number): DurationBucket {
  if (seconds < 10) return '<10s';
  if (seconds < 30) return '10-30s';
  if (seconds < 60) return '30-60s';
  if (seconds < 180) return '1-3m';
  return '3m+';
}

export function bucketCount(n: number): CountBucket {
  if (n <= 0) return '0';
  if (n === 1) return '1';
  if (n <= 5) return '2-5';
  if (n <= 20) return '6-20';
  return '21+';
}

// ── Event map ───────────────────────────────────────────────────────────────

/** Whitelisted, sanitized attribution values (see privacy.ts). */
export interface AttributionProps {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
  ref?: string;
}

export interface ExportEventProps {
  resolution: string;
  fps: number;
  duration_bucket: DurationBucket;
}

type NoProps = Record<string, never>;

/** Events sent by the signed-in client through the SDK. */
export interface AnalyticsEventMap {
  signed_up: AttributionProps;
  project_created: { source: ProjectSource };
  route_added: { source: RouteSource; point_bucket: PointBucket };
  keyframe_added: { source: 'toolbar' | 'ai' };
  autocam_enabled: NoProps;
  preview_played: NoProps;
  export_started: ExportEventProps;
  export_succeeded: ExportEventProps;
  export_failed: ExportEventProps & { error_class: ExportErrorClass };
  export_cancelled: ExportEventProps;
  upgrade_prompt_shown: { where: UpgradeWhere };
  checkout_started: { plan: string; resumed: boolean };
  map_style_load_failed: { style: string };
  route_import_failed: { format: ImportFormat; error_class: ImportErrorClass };
  project_opened: { storage: StorageKind };
  project_saved: { storage: StorageKind };
  walkthrough_started: NoProps;
  feature_preview_opened: { feature_id: string };
  feature_voted: { feature_id: string };
  feature_unvoted: { feature_id: string };
}

export type AnalyticsEventName = keyof AnalyticsEventMap;

/** Events sent from the Vercel webhook (posthog-node), not the browser. */
export interface ServerEventMap {
  subscription_started: { tier: string };
  subscription_cancelled: { tier?: string };
  subscription_ended: { tier?: string };
}

/**
 * Anonymous aggregate counters. Sent with a throwaway distinct id and no
 * person profile; the only events that can fire for signed-out visitors.
 */
export interface AnonymousEventMap {
  signup_submitted: { outcome: 'confirm_email' | 'error' | 'blocked_domain'; error_class?: string };
  signin_failed: { error_class: 'invalid_credentials' | 'email_not_confirmed' | 'rate_limited' | 'other' };
  guest_route_added: { source: RouteSource };
  guest_gate_hit: { where: UpgradeWhere | 'sign_in' | 'map_load' };
}

export type AnonymousEventName = keyof AnonymousEventMap;

/** Rest-argument helper: events with no properties may omit the argument. */
export type EventArgs<P> = Record<string, never> extends P ? [props?: P] : [props: P];

export interface PersonProps {
  plan?: string;
  /** Date only (YYYY-MM-DD). */
  signed_up_at?: string;
  project_count_bucket?: CountBucket;
  has_exported?: boolean;
  initial_utm_source?: string;
  initial_utm_medium?: string;
  initial_utm_campaign?: string;
  initial_utm_content?: string;
  initial_utm_term?: string;
  initial_ref?: string;
}
