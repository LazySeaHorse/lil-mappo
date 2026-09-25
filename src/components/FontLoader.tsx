import { useEffect } from 'react';

/**
 * Ensures locally hosted fonts for map callouts and dropdown previews
 * are loaded into the document head without making external requests
 * to Google Fonts servers (GDPR / Munich court compliant).
 */
export default function FontLoader() {
  useEffect(() => {
    // Clean up any legacy dynamic external font link if present
    const legacyLink = document.getElementById('dynamic-project-fonts');
    if (legacyLink) {
      legacyLink.remove();
    }

    const linkId = 'local-map-fonts';
    if (!document.getElementById(linkId)) {
      const link = document.createElement('link');
      link.id = linkId;
      link.rel = 'stylesheet';
      link.href = `${import.meta.env.BASE_URL}fonts/map-fonts.css`;
      document.head.appendChild(link);
    }
  }, []);

  return null;
}

