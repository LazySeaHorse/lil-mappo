// Kept apart from videoExport.ts so the capability probe does not pull mediabunny into the initial bundle.

export type LocalExportCapability =
  | { status: 'ready'; codec: string }
  | { status: 'limited' }
  | { status: 'unsupported' };

/**
 * Checks whether the browser reports support for local H.264 export at a
 * particular output size and frame rate. A negative codec probe is reported
 * as "limited", rather than "unsupported", because some browsers are known
 * to return false negatives from isConfigSupported().
 */
export async function getLocalExportCapability(
  width: number,
  height: number,
  fps: number,
): Promise<LocalExportCapability> {
  if (typeof VideoEncoder === 'undefined') return { status: 'unsupported' };

  const candidates = [
    'avc1.640034', 'avc1.640033', 'avc1.64002A', 'avc1.640028',
    'avc1.4D002A', 'avc1.4D0028', 'avc1.42E028', 'avc1.42E01F', 'avc1.42E01E',
  ];

  for (const codec of candidates) {
    try {
      const { supported } = await VideoEncoder.isConfigSupported({
        codec, width, height, bitrate: 8_000_000, framerate: fps,
      });
      if (supported) return { status: 'ready', codec };
    } catch {
      // Try the next H.264 profile; some implementations throw for profiles
      // they do not recognise.
    }
  }

  return { status: 'limited' };
}
