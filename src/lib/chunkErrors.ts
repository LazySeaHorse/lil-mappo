/**
 * Browsers word a failed dynamic import differently (Chrome, Firefox, Safari), and bundlers add
 * their own "Loading chunk" variant. After a deploy replaces the hashed files, an already-open tab
 * hits one of these the next time it asks for a chunk it had not loaded yet.
 */
const CHUNK_LOAD_ERROR =
  /dynamically imported module|Importing a module script failed|error loading dynamically imported module|Loading chunk [\w-]+ failed|Unable to preload CSS/i;

export function isChunkLoadError(err: unknown): boolean {
  return err instanceof Error && CHUNK_LOAD_ERROR.test(err.message);
}
