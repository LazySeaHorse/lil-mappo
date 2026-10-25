import type { ClipboardEvent } from 'react';
import { splitPastedPlaces } from '@/engine/hubSpoke';

/**
 * A paste handler for a place field that sits in a list. Text with several places goes to
 * `onPasteList` instead of the field; a single place pastes as usual.
 */
export const pasteListHandler = (onPasteList?: (text: string) => void) =>
  onPasteList
    ? (e: ClipboardEvent<HTMLInputElement>) => {
        const text = e.clipboardData.getData('text');
        if (splitPastedPlaces(text).entries.length < 2) return;
        e.preventDefault();
        onPasteList(text);
      }
    : undefined;
