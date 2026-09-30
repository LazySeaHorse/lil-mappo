/**
 * Turns a user-picked image file into a compact data URL for callout content.
 *
 * Callout images live inside the project document (IndexedDB and the cloud
 * project row), and export draws them onto a canvas. A same-origin data URL
 * never taints the canvas, and downscaling keeps the document small.
 */

export const MAX_IMAGE_EDGE = 1280;
export const JPEG_QUALITY = 0.85;
/** Source files above this are refused before decoding. */
export const MAX_SOURCE_BYTES = 25 * 1024 * 1024;

export class ImageImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImageImportError';
  }
}

/** Largest size with the same aspect ratio whose long edge fits `maxEdge`. Never upscales. */
export function fitWithin(width: number, height: number, maxEdge: number = MAX_IMAGE_EDGE): { width: number; height: number } {
  const longEdge = Math.max(width, height);
  if (longEdge <= maxEdge) return { width, height };
  const scale = maxEdge / longEdge;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/** True when any pixel of RGBA data is not fully opaque. */
export function hasTransparency(rgba: ArrayLike<number>): boolean {
  for (let i = 3; i < rgba.length; i += 4) {
    if (rgba[i] < 255) return true;
  }
  return false;
}

function decode(file: File): Promise<{ image: HTMLImageElement; release: () => void }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const release = () => URL.revokeObjectURL(url);
    const image = new Image();
    image.onload = () => resolve({ image, release });
    image.onerror = () => {
      release();
      reject(new ImageImportError('That image could not be read.'));
    };
    image.src = url;
  });
}

/**
 * Decode, downscale to fit MAX_IMAGE_EDGE and re-encode: JPEG, or PNG when the
 * image has real transparency. Throws ImageImportError with a user-facing message.
 */
export async function imageFileToDataUrl(file: File): Promise<string> {
  if (!file.type.startsWith('image/') || file.type === 'image/svg+xml') {
    throw new ImageImportError('Choose a JPEG, PNG, WebP or GIF image.');
  }
  if (file.size > MAX_SOURCE_BYTES) {
    throw new ImageImportError('That image is too large. Choose one under 25 MB.');
  }

  const { image, release } = await decode(file);
  try {
    const source = { width: image.naturalWidth, height: image.naturalHeight };
    if (!source.width || !source.height) throw new ImageImportError('That image could not be read.');
    const { width, height } = fitWithin(source.width, source.height);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new ImageImportError('That image could not be processed.');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(image, 0, 0, width, height);

    // Only formats that can carry alpha are worth scanning.
    const canBeTransparent = file.type !== 'image/jpeg';
    if (canBeTransparent && hasTransparency(ctx.getImageData(0, 0, width, height).data)) {
      return canvas.toDataURL('image/png');
    }
    return canvas.toDataURL('image/jpeg', JPEG_QUALITY);
  } finally {
    release();
  }
}
