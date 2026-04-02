import { useEffect } from 'react';
import { useProjectStore } from '@/store/useProjectStore';
import { MAP_FONTS } from '@/components/Inspector/InspectorPanel';

/**
 * Monitors all callout items in the project and ensures their 
 * respective Google Fonts are loaded into the document head.
 * Now also preloads MAP_FONTS so the dropdown previews are instant.
 */
export default function FontLoader() {
  const items = useProjectStore((s) => s.items);

  useEffect(() => {
    // 1. Start with the predefined map fonts for dropdown previews
    const fonts = new Set<string>(MAP_FONTS);
    
    Object.values(items).forEach((item) => {
      if (item.kind === 'callout' && item.style.fontFamily) {
        // Skip default/standard fonts that are likely in index.css
        if (item.style.fontFamily !== 'Inter' && item.style.fontFamily !== 'sans-serif') {
          fonts.add(item.style.fontFamily);
        }
      }
    });

    const linkId = 'dynamic-project-fonts';
    let link = document.getElementById(linkId) as HTMLLinkElement | null;

    if (fonts.size === 0) {
      if (link) link.remove();
      return;
    }

    // 2. Build the Google Fonts CSS2 URL
    // Format: family=Font+Name:wght@400;700&family=Another+Font:wght@400;700
    const familyParams = Array.from(fonts)
      .map((f) => `family=${f.replace(/ /g, '+')}:wght@400;700`)
      .join('&');
    
    const url = `https://fonts.googleapis.com/css2?${familyParams}&display=swap`;

    // 3. Update or create the link tag
    if (!link) {
      link = document.createElement('link');
      link.id = linkId;
      link.rel = 'stylesheet';
      document.head.appendChild(link);
    }
    
    if (link.href !== url) {
      link.href = url;
    }
  }, [items]);

  return null;
}
