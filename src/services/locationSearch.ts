import type {
  SearchBoxFeatureSuggestion,
  SearchBoxRetrieveResponse,
  SearchBoxSuggestion,
  SearchBoxSuggestionResponse,
} from '@mapbox/search-js-core';

type LngLat = [number, number];
/** [west, south, east, north] */
export type SearchBBox = [number, number, number, number];

/** What the search bias needs from the live map; a Mapbox `Map` satisfies it. */
interface MapViewSource {
  getCenter(): { lng: number; lat: number };
  getBounds(): { getWest(): number; getSouth(): number; getEast(): number; getNorth(): number } | null;
}

export interface SearchView {
  center?: LngLat;
  bbox?: SearchBBox | null;
}

interface SuggestSession {
  suggest(
    text: string,
    options: { proximity?: LngLat; bbox?: SearchBBox },
  ): Promise<Pick<SearchBoxSuggestionResponse, 'suggestions'>>;
}

/**
 * The live center and visible bounds of the map. The bounds are null when a box
 * cannot describe them (world view, or a view across the antimeridian), so
 * callers search without a box instead.
 */
export function readMapView(map: MapViewSource | null | undefined): (SearchView & { center: LngLat }) | null {
  if (!map) return null;
  const { lng, lat } = map.getCenter();
  const b = map.getBounds();
  let bbox: SearchBBox | null = null;
  if (b) {
    const west = b.getWest();
    const east = b.getEast();
    if (east - west < 360 && west >= -180 && east <= 180 && west < east) {
      bbox = [west, Math.max(-90, b.getSouth()), east, Math.min(90, b.getNorth())];
    }
  }
  return { center: [lng, lat], bbox };
}

/**
 * Searches inside the visible bounds first. Only when that finds nothing does it
 * search once more without a box. Both queries lean towards the map center.
 * At most two calls, and a failed first call is not retried.
 */
export async function suggestForView(
  session: SuggestSession,
  term: string,
  { center, bbox }: SearchView,
): Promise<Pick<SearchBoxSuggestionResponse, 'suggestions'>> {
  if (bbox) {
    const inView = await session.suggest(term, { proximity: center, bbox });
    if (inView.suggestions?.length) return inView;
  }
  return session.suggest(term, { proximity: center });
}

interface RetrieveSession extends SuggestSession {
  retrieve(suggestion: SearchBoxSuggestion): Promise<Pick<SearchBoxRetrieveResponse, 'features'>>;
}

/**
 * The place a suggestion stands for, or null when there is none. A brand
 * ("Starbucks") is suggested inside the visible bounds even with no store there,
 * and Mapbox then retrieves nothing. So when a search with bounds retrieves
 * nothing, this searches the suggestion's name once more without them and takes
 * the store nearest the center. The brand's id changes between searches, so the
 * match is by type and name.
 */
export async function retrieveForView(
  session: RetrieveSession,
  suggestion: SearchBoxSuggestion,
  { center, bbox }: SearchView,
): Promise<SearchBoxFeatureSuggestion | null> {
  const { features } = await session.retrieve(suggestion);
  if (features[0] || !bbox) return features[0] ?? null;
  const again = await session.suggest(suggestion.name, { proximity: center });
  const same = again.suggestions?.find(
    (s) => s.feature_type === suggestion.feature_type && s.name === suggestion.name,
  );
  if (!same) return null;
  return (await session.retrieve(same)).features[0] ?? null;
}

/** Nominatim `viewbox` value (left,top,right,bottom) for a search box. */
export function toViewbox([west, south, east, north]: SearchBBox): string {
  return `${west},${north},${east},${south}`;
}
