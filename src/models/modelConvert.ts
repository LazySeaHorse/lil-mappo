import { VertexLayout, WebIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dequantize } from '@gltf-transform/functions';
import { MeshoptDecoder } from 'meshoptimizer';
import { webpToPng } from './modelImage';

/**
 * Rewrites a .glb as a plain one the map draws right: meshopt decoded, quantized positions, normals
 * and texture coordinates turned back into floats (mapbox copies them without un-normalizing, so a
 * quantized model comes out thousands of times too big), and WebP textures re-encoded as PNG
 * (mapbox ignores EXT_texture_webp), and a list of indices for a mesh without one. Attributes are written one per buffer view, as mapbox copies
 * positions without honouring a stride. Loaded only when a file needs it, as it pulls in glTF-Transform.
 */
export async function convertGlb(bytes: ArrayBuffer): Promise<ArrayBuffer> {
  await MeshoptDecoder.ready;
  const io = new WebIO()
    .setVertexLayout(VertexLayout.SEPARATE)
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
  const document = await io.readBinary(new Uint8Array(bytes));
  await document.transform(dequantize());
  for (const mesh of document.getRoot().listMeshes()) {
    for (const primitive of mesh.listPrimitives()) {
      const count = primitive.getAttribute('POSITION')?.getCount() ?? 0;
      if (primitive.getIndices() || count === 0) continue;
      const array = count > 65535 ? new Uint32Array(count) : new Uint16Array(count);
      for (let i = 0; i < count; i++) array[i] = i;
      primitive.setIndices(document.createAccessor().setType('SCALAR').setArray(array).setBuffer(document.getRoot().listBuffers()[0]));
    }
  }
  for (const texture of document.getRoot().listTextures()) {
    const image = texture.getImage();
    if (image && texture.getMimeType() === 'image/webp') {
      texture.setImage(await webpToPng(image)).setMimeType('image/png');
    }
  }
  document.disposeExtension('EXT_texture_webp');
  document.disposeExtension('EXT_meshopt_compression');
  const out = await io.writeBinary(document);
  return out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength) as ArrayBuffer;
}
