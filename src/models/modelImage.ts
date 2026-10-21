/** Re-encodes WebP image bytes as PNG (the map's model loader decodes PNG and JPEG, not WebP in a .glb). */
export async function webpToPng(webp: Uint8Array): Promise<Uint8Array> {
  const bitmap = await createImageBitmap(new Blob([webp as Uint8Array<ArrayBuffer>], { type: 'image/webp' }));
  try {
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('No canvas');
    context.drawImage(bitmap, 0, 0);
    const png = await canvas.convertToBlob({ type: 'image/png' });
    return new Uint8Array(await png.arrayBuffer());
  } finally {
    bitmap.close();
  }
}
