import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTransientState, useProjectStore } from '@/store/useProjectStore';
import { createProject } from '@/store/projectDocument';
import { MAX_MODEL_BYTES, ModelFileError } from './glb';
import { clearModelRegistry, isModelReady } from './modelRegistry';
import { MAX_MODEL_URLS, addModelFromUrl, fetchModelFile, parseModelUrls, relinkModelFromUrl } from './modelUrl';
import { makeGlb } from './testGlb';

const glb = () => makeGlb({ nodes: [{ mesh: 0 }], min: [0, 0, 0], max: [1, 2, 3] });
const reply = (body: BodyInit | null, init: ResponseInit = {}) => new Response(body, init);
const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:m'), revokeObjectURL: vi.fn() }));
  fetchMock.mockReset();
  clearModelRegistry();
  useProjectStore.setState({ ...createProject(), ...createTransientState() });
});

afterEach(() => vi.unstubAllGlobals());

const failure = async (url: string) => {
  const error = await fetchModelFile(url).then(() => null, (e: unknown) => e);
  expect(error).toBeInstanceOf(ModelFileError);
  return error as ModelFileError;
};

describe('parseModelUrls', () => {
  it('takes one URL per line or separated by commas, trimmed and without repeats', () => {
    const text = ' https://a.test/x.glb \nhttps://b.test/y.glb, https://c.test/z.glb\n\nhttps://a.test/x.glb';
    expect(parseModelUrls(text)).toEqual({
      urls: ['https://a.test/x.glb', 'https://b.test/y.glb', 'https://c.test/z.glb'],
      skipped: 0,
    });
  });

  it('keeps only the first few and says how many it left out', () => {
    const text = Array.from({ length: MAX_MODEL_URLS + 3 }, (_, i) => `https://a.test/${i}.glb`).join('\n');
    const { urls, skipped } = parseModelUrls(text);
    expect(urls).toHaveLength(MAX_MODEL_URLS);
    expect(skipped).toBe(3);
  });
});

describe('fetchModelFile', () => {
  it('downloads a .glb and names it after the end of the address', async () => {
    fetchMock.mockResolvedValue(reply(glb(), { headers: { 'content-type': 'model/gltf-binary' } }));
    const file = await fetchModelFile('https://cdn.test/models/Old%20Bus.glb?v=2');
    expect(file.name).toBe('Old Bus.glb');
    expect(file.size).toBe(glb().byteLength);
  });

  it('names a model after its host when the address has no file name', async () => {
    fetchMock.mockResolvedValue(reply(glb(), { headers: { 'content-type': 'application/octet-stream' } }));
    expect((await fetchModelFile('https://cdn.test/')).name).toBe('cdn.test.glb');
  });

  it('only loads web addresses', async () => {
    expect((await failure('file:///etc/passwd')).code).toBe('url');
    expect((await failure('not a url')).code).toBe('url');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("says when the host doesn't allow other sites, by seeing it answers a request that skips CORS", async () => {
    fetchMock.mockImplementation((_url: string, init?: RequestInit) =>
      init?.mode === 'no-cors' ? Promise.resolve(reply(null)) : Promise.reject(new TypeError('Failed to fetch')));
    const error = await failure('https://nocors.test/a.glb');
    expect(error.code).toBe('cors');
    expect(error.message).toContain("That host doesn't allow loading from other sites");
  });

  it('says when the address cannot be reached at all', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    expect((await failure('https://nowhere.test/a.glb')).code).toBe('unreachable');
  });

  it("blames the page's own security policy, not the host, when the browser reports a policy violation", async () => {
    fetchMock.mockImplementation(() => {
      document.dispatchEvent(new Event('securitypolicyviolation'));
      return Promise.reject(new TypeError('Failed to fetch'));
    });
    const error = await failure('https://blocked.test/a.glb');
    expect(error.code).toBe('blocked');
    expect(error.message).not.toContain('Check the link');
  });

  it('reports an error answer from the host', async () => {
    fetchMock.mockResolvedValue(reply('nope', { status: 404 }));
    const error = await failure('https://cdn.test/a.glb');
    expect(error.code).toBe('http');
    expect(error.message).toContain('404');
  });

  it('refuses a page that is not a .glb', async () => {
    fetchMock.mockResolvedValue(reply('<html></html>', { headers: { 'content-type': 'text/html' } }));
    expect((await failure('https://cdn.test/page')).code).toBe('notglb');
    fetchMock.mockResolvedValue(reply('plain bytes that are no model', { headers: { 'content-type': 'application/octet-stream' } }));
    expect((await failure('https://cdn.test/a.glb')).code).toBe('notglb');
  });

  it('refuses a model over the size limit without downloading it, when the host says how big it is', async () => {
    fetchMock.mockResolvedValue(reply(glb(), { headers: { 'content-length': String(MAX_MODEL_BYTES + 1) } }));
    const error = await failure('https://cdn.test/big.glb');
    expect(error.code).toBe('size');
    expect(error.message).toContain('50 MB');
  });

  it('stops reading a model that turns out to be over the size limit', async () => {
    const chunk = new Uint8Array(MAX_MODEL_BYTES / 2 + 1);
    let sent = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (sent++ < 4) controller.enqueue(chunk);
        else controller.close();
      },
    });
    fetchMock.mockResolvedValue(reply(body));
    expect((await failure('https://cdn.test/big.glb')).code).toBe('size');
    expect(sent).toBeLessThan(4);
  });
});

describe('addModelFromUrl', () => {
  it('adds the downloaded model to the project with its bytes in memory', async () => {
    fetchMock.mockResolvedValue(reply(glb()));
    const asset = await addModelFromUrl('https://cdn.test/bus.glb');
    expect(useProjectStore.getState().models[asset.id]).toEqual(asset);
    expect(asset.fileName).toBe('bus.glb');
    expect(isModelReady(asset)).toBe(true);
  });

  it('remembers the link on the model', async () => {
    fetchMock.mockResolvedValue(reply(glb()));
    const asset = await addModelFromUrl('https://cdn.test/bus.glb');
    expect(asset.sourceUrl).toBe('https://cdn.test/bus.glb');
    expect(useProjectStore.getState().models[asset.id].sourceUrl).toBe('https://cdn.test/bus.glb');
  });

  it('adds nothing for a download that is not a usable model', async () => {
    fetchMock.mockResolvedValue(reply(makeGlb({ nodes: [], min: [0, 0, 0], max: [1, 1, 1] })));
    await expect(addModelFromUrl('https://cdn.test/empty.glb')).rejects.toBeInstanceOf(ModelFileError);
    expect(useProjectStore.getState().models).toEqual({});
  });
});

describe('relinkModelFromUrl', () => {
  const linked = async () => {
    fetchMock.mockResolvedValue(reply(glb()));
    const asset = await addModelFromUrl('https://cdn.test/bus.glb');
    clearModelRegistry();
    return asset;
  };

  it('loads the model again from its link when the file is the one the project was made with', async () => {
    const asset = await linked();
    expect(isModelReady(asset)).toBe(false);
    fetchMock.mockResolvedValue(reply(glb()));
    expect(await relinkModelFromUrl(asset)).toEqual({ status: 'linked' });
    expect(isModelReady(asset)).toBe(true);
  });

  it('does not use a file that changed since, and hands it over for the user to decide', async () => {
    const asset = await linked();
    fetchMock.mockResolvedValue(reply(makeGlb({ nodes: [{ mesh: 0 }], min: [0, 0, 0], max: [9, 9, 9] })));
    const result = await relinkModelFromUrl(asset);
    expect(result.status).toBe('mismatch');
    expect(isModelReady(asset)).toBe(false);
  });

  it('fails like any download when the link no longer works', async () => {
    const asset = await linked();
    fetchMock.mockResolvedValue(reply('gone', { status: 404 }));
    await expect(relinkModelFromUrl(asset)).rejects.toMatchObject({ code: 'http' });
    expect(isModelReady(asset)).toBe(false);
  });

  it('has nothing to load for a model that came from a file', async () => {
    await expect(relinkModelFromUrl({ id: 'a', fileName: 'a.glb', byteSize: 1, sha256: '1'.repeat(64), bounds: { min: [0, 0, 0], max: [1, 1, 1] } }))
      .rejects.toBeInstanceOf(ModelFileError);
  });
});
