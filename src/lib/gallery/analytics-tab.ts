// The analytics route's allowlist for which aggregation a caller may ask
// for. Mirrors image-variant.ts's pattern: a fixed set of string literals,
// checked with `includes` rather than trusted as a dynamic lookup key, so a
// caller can never reach a query function this list doesn't name.
const ANALYTICS_TABS = ['overview', 'favorites', 'consensus', 'visitors', 'downloads', 'emails'] as const;

export type AnalyticsTab = (typeof ANALYTICS_TABS)[number];

export function isAnalyticsTab(value: string | null | undefined): value is AnalyticsTab {
  return (ANALYTICS_TABS as readonly string[]).includes(value ?? '');
}
