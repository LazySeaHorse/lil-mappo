import { useEffect, useState } from 'react';
import { isDarkMapStyle } from '@/config/mapbox';
import { useProjectStore } from '@/store/useProjectStore';
import { StyleIcon } from './StyleIcon';
import { PREVIEW_HEIGHT, PREVIEW_WIDTH, getStylePreview } from './stylePreview';

/** The theme the editor shows: the map look decides it (see `MapStudioEditor`). */
function useIsDarkTheme(): boolean {
  return useProjectStore((s) => isDarkMapStyle(s.mapStyle, s.lightPreset, s.customStyle));
}

/** A picture of a callout style, drawn by the real renderer. Shows the style icon while it draws or when it cannot. */
export function StylePreview({ styleId, icon, text }: { styleId: string; icon: string; text: string }) {
  const theme = useIsDarkTheme() ? 'dark' : 'light';
  const [drawn, setDrawn] = useState<{ key: string; src: string } | null>(null);
  const key = `${styleId}|${theme}|${text}`;

  useEffect(() => {
    let current = true;
    getStylePreview(styleId, theme, text).then((src) => {
      if (current && src) setDrawn({ key, src });
    });
    return () => { current = false; };
  }, [styleId, theme, text, key]);

  // A picture for another theme or text would be wrong, so only a matching one shows.
  const src = drawn?.key === key ? drawn.src : null;
  return (
    <div
      className="flex w-full items-center justify-center overflow-hidden rounded-md"
      style={{ aspectRatio: `${PREVIEW_WIDTH} / ${PREVIEW_HEIGHT}` }}
    >
      {src
        ? <img src={src} alt="" draggable={false} className="h-full w-full object-contain" />
        : <StyleIcon name={icon} />}
    </div>
  );
}
