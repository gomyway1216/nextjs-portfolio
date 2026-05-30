import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const convertTimestampToFormattedDate = (timestampSeconds: number) => {
  const d = new Date(timestampSeconds * 1000);
  const ye = new Intl.DateTimeFormat('en', { year: 'numeric' }).format(d);
  const mo = new Intl.DateTimeFormat('en', { month: 'short' }).format(d);
  const da = new Intl.DateTimeFormat('en', { day: '2-digit' }).format(d);
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

  const ye = new Intl.DateTimeFormat('en', { year: 'numeric' }).format(date);
  const mo = new Intl.DateTimeFormat('en', { month: 'short' }).format(date);
  const da = new Intl.DateTimeFormat('en', { day: '2-digit' }).format(date);
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

  const ye = new Intl.DateTimeFormat('en', { year: 'numeric' }).format(date);
  const da = new Intl.DateTimeFormat('en', { day: '2-digit' }).format(date);
  return ` ${ye}年 ${date.getMonth() + 1}月 ${da}`;
};
