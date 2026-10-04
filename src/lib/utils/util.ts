import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Dates on server-rendered pages are printed in one fixed time zone. Formatting
 * them in the viewer's own zone made the browser print a different day than the
 * server HTML whenever the two fell on different calendar days, which React
 * reports as a hydration error (#418) and repairs by re-rendering on the client.
 */
export const DISPLAY_TIME_ZONE = 'UTC';

export const convertTimestampToFormattedDate = (timestampSeconds: number) => {
  const d = new Date(timestampSeconds * 1000);
  const ye = new Intl.DateTimeFormat('en', { year: 'numeric', timeZone: DISPLAY_TIME_ZONE }).format(d);
  const mo = new Intl.DateTimeFormat('en', { month: 'short', timeZone: DISPLAY_TIME_ZONE }).format(d);
  const da = new Intl.DateTimeFormat('en', { day: '2-digit', timeZone: DISPLAY_TIME_ZONE }).format(d);
  return `${mo} ${da}, ${ye}`;
};

type DateLike = Date | string | number | { toDate: () => Date } | null | undefined;

export const formatDate = (d: DateLike) => {
  if (!d) return '';

  // Convert to Date object if it's a string or timestamp
  let date: Date;
  if (d instanceof Date) {
    date = d;
  } else if (typeof d === 'string') {
    date = new Date(d);
  } else if (typeof d === 'number') {
    date = new Date(d);
  } else if (d?.toDate && typeof d.toDate === 'function') {
    // Firestore Timestamp
    date = d.toDate();
  } else {
    return '';
  }

  // Check if date is valid
  if (isNaN(date.getTime())) {
    return '';
  }

  const ye = new Intl.DateTimeFormat('en', { year: 'numeric', timeZone: DISPLAY_TIME_ZONE }).format(date);
  const mo = new Intl.DateTimeFormat('en', { month: 'short', timeZone: DISPLAY_TIME_ZONE }).format(date);
  const da = new Intl.DateTimeFormat('en', { day: '2-digit', timeZone: DISPLAY_TIME_ZONE }).format(date);
  return `${mo} ${da}, ${ye}`;
};

export const formatJapaneseDate = (d: DateLike) => {
  if (!d) return '';

  // Convert to Date object if it's a string or timestamp
  let date: Date;
  if (d instanceof Date) {
    date = d;
  } else if (typeof d === 'string') {
    date = new Date(d);
  } else if (typeof d === 'number') {
    date = new Date(d);
  } else if (d?.toDate && typeof d.toDate === 'function') {
    // Firestore Timestamp
    date = d.toDate();
  } else {
    return '';
  }

  // Check if date is valid
  if (isNaN(date.getTime())) {
    return '';
  }

  const ye = new Intl.DateTimeFormat('en', { year: 'numeric', timeZone: DISPLAY_TIME_ZONE }).format(date);
  const da = new Intl.DateTimeFormat('en', { day: '2-digit', timeZone: DISPLAY_TIME_ZONE }).format(date);
  return ` ${ye}年 ${date.getUTCMonth() + 1}月 ${da}`;
};
