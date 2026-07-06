import { describe, expect, it } from 'vitest';
import { getErrorMessage, getFirestoreIndexUrl, trimTrailingUrlPunctuation } from '@/lib/firestoreError';

describe('firestoreError', () => {
  it('extracts a Firebase Console index creation URL from an error', () => {
    const error = new Error(
      'The query requires an index. You can create it here: https://console.firebase.google.com/v1/r/project/demo/firestore/indexes?create_composite=abc123.',
    );

    expect(getFirestoreIndexUrl(error)).toBe(
      'https://console.firebase.google.com/v1/r/project/demo/firestore/indexes?create_composite=abc123',
    );
  });

  it('returns null when the error has no Firestore index URL', () => {
    expect(getFirestoreIndexUrl(new Error('permission denied'))).toBeNull();
  });

  it('normalizes unknown thrown values to a message', () => {
    expect(getErrorMessage('plain failure')).toBe('plain failure');
  });

  it('trims punctuation that commonly follows prose URLs', () => {
    expect(trimTrailingUrlPunctuation('https://example.com/indexes?x=1.;')).toBe('https://example.com/indexes?x=1');
  });
});
