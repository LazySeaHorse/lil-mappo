import { useProjectStore } from '@/store/useProjectStore';
import type { ModelAsset } from '@/store/types';
import { MAX_MODEL_BYTES, MAX_MODEL_URLS, MODEL_FILE_MESSAGES, ModelFileError, type ModelFileErrorCode } from './glb';
import { readModelAsset, relinkModel, type RelinkResult } from './modelImport';

export { MAX_MODEL_URLS };

const GLB_MAGIC = [0x67, 0x6c, 0x54, 0x46]; // 'glTF'

/** The links in pasted text: one per line or separated by commas, trimmed, without repeats. */
export function parseModelUrls(text: string): { urls: string[]; skipped: number } {
  const all = [...new Set(text.split(/[\n,]+/).map((part) => part.trim()).filter(Boolean))];
  return { urls: all.slice(0, MAX_MODEL_URLS), skipped: Math.max(0, all.length - MAX_MODEL_URLS) };
}

const fail = (code: ModelFileErrorCode) => new ModelFileError(code, MODEL_FILE_MESSAGES[code]);

const tooBig = () => new ModelFileError('size', `That model is over ${MAX_MODEL_BYTES / (1024 * 1024)} MB.`);

/** Only web addresses; plain http cannot load into an https page. */
function parseWebAddress(address: string): URL {
  let url: URL;
  try {
    url = new URL(address);
  } catch {
    throw fail('url');
  }
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && globalThis.location?.protocol !== 'https:')) {
    throw fail('url');
  }
  return url;
}

/** A name for the model: the end of the address, or its host when there is none. */
function fileNameFrom(url: URL): string {
  const last = url.pathname.split('/').filter(Boolean).pop() ?? '';
  let name = last;
  try {
    name = decodeURIComponent(last);
  } catch {
    // Keep the raw segment.
  }
  name = name || url.hostname;
  return /\.glb$/i.test(name) ? name : `${name}.glb`;
}

/**
 * Why a download failed before any answer. The browser hides whether CORS or the network was to
 * blame, so it asks again in a way CORS does not block: a host that answers that one is there, and
 * only refuses to share its files with other sites.
 */
async function explainFailedFetch(address: string): Promise<ModelFileError> {
  const controller = new AbortController();
  try {
    await fetch(address, { mode: 'no-cors', signal: controller.signal });
    return fail('cors');
  } catch {
    return fail('unreachable');
  } finally {
    controller.abort();
  }
}

/** Reads a download, giving up as soon as it passes the size limit. */
async function readLimited(response: Response): Promise<ArrayBuffer> {
  const reader = response.body?.getReader();
  if (!reader) {
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength > MAX_MODEL_BYTES) throw tooBig();
    return bytes;
  }
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_MODEL_BYTES) {
      void reader.cancel();
      throw tooBig();
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes.buffer;
}

/** Downloads a .glb from a link as a File. Throws ModelFileError, with a message safe to show, when it cannot. */
export async function fetchModelFile(address: string): Promise<File> {
  const url = parseWebAddress(address);
  let response: Response;
  try {
    response = await fetch(url.href);
  } catch {
    throw await explainFailedFetch(url.href);
  }
  if (!response.ok) {
    void response.body?.cancel();
    throw new ModelFileError('http', `That address answered with an error (${response.status}).`);
  }
  const type = response.headers.get('content-type') ?? '';
  if (/^text\/|json|html/i.test(type)) {
    void response.body?.cancel();
    throw fail('notglb');
  }
  if (Number(response.headers.get('content-length')) > MAX_MODEL_BYTES) {
    void response.body?.cancel();
    throw tooBig();
  }
  const bytes = await readLimited(response);
  const head = new Uint8Array(bytes, 0, Math.min(4, bytes.byteLength));
  if (head.length < 4 || GLB_MAGIC.some((byte, i) => head[i] !== byte)) {
    throw fail('notglb');
  }
  return new File([bytes], fileNameFrom(url), { type: 'model/gltf-binary' });
}

/** Downloads a .glb from a link, checks it like an upload and adds it to the project's models. */
export async function addModelFromUrl(address: string): Promise<ModelAsset> {
  const asset = await readModelAsset(await fetchModelFile(address), address);
  useProjectStore.getState().addModel(asset);
  return asset;
}

/** Loads a model's file again from the link it came from; like a relink, a changed file is not used until the user agrees. */
export async function relinkModelFromUrl(asset: ModelAsset): Promise<RelinkResult> {
  if (!asset.sourceUrl) throw fail('url');
  return relinkModel(asset, await fetchModelFile(asset.sourceUrl));
}
