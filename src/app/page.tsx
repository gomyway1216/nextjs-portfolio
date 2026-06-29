// Home is the only route that uses [data-aos] elements, so AOS init +
// stylesheet live here instead of the root layout. Every other route
// (games, blog, tools, …) skips the AOS payload entirely.
import 'aos/dist/aos.css';
import { unstable_cache } from 'next/cache';
import AOSInitializer from './AOSInitializer';
import HomeLightAnimation from '@/views/all-home-version/HomeLightAnimation';
import { getFirestore } from '@/lib/firebase-admin';
import type { Profile } from '@/hooks/useProfile';
import { isValidSocialLink, type ProfileSocialLink } from '@/lib/socialLinks';
import { WRITING_COLLECTION } from '@/app/api/constants';
import { isSafeHttpUrl, parseWritingDoc, publicWritings, type Writing } from '@/lib/writing';

const PROFILE_DOC_ID = 'main';

// Missing/malformed field → undefined (resolveSocialLinks falls back to
// defaults); a real array is kept even when it filters to empty, so an
// explicitly cleared list hides the links.
function parseSocialLinks(value: unknown): ProfileSocialLink[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter(isValidSocialLink);
}

// Throws on Firestore failure so unstable_cache never caches an outage —
// the caller catches and renders with null instead.
async function getInitialProfile(): Promise<Profile | null> {
  const doc = await getFirestore().collection('profile').doc(PROFILE_DOC_ID).get();
  if (!doc.exists) return null;

  const data = doc.data() ?? {};
  return {
    id: doc.id,
    birthdate: typeof data.birthdate === 'string' ? data.birthdate : '1998-06-15',
    location: typeof data.location === 'string' ? data.location : 'San Francisco, Remote',
    email: typeof data.email === 'string' ? data.email : 'uwyudai@gmail.com',
    languages: Array.isArray(data.languages) ? data.languages.filter((language): language is string => typeof language === 'string') : ['English', 'Japanese'],
    bioEn: typeof data.bioEn === 'string' ? data.bioEn : undefined,
    bioJa: typeof data.bioJa === 'string' ? data.bioJa : undefined,
    profileImageUrl: typeof data.profileImageUrl === 'string' ? data.profileImageUrl : undefined,
    socialLinks: parseSocialLinks(data.socialLinks),
  };
}

// The route itself is request-rendered (the root layout reads cookies for
// locale detection), so cache the Firestore read instead: profile changes
// rarely, and the profile PUT/photo routes bust the tag on save.
const getInitialProfileCached = unstable_cache(getInitialProfile, ['home-profile'], {
  revalidate: 3600,
  tags: ['profile'],
});

async function getInitialWritings(): Promise<Writing[]> {
  const snapshot = await getFirestore().collection(WRITING_COLLECTION).get();
  return snapshot.docs.map((doc) => parseWritingDoc(doc.id, doc.data()));
}

// Cached like the profile read; the /api/writing POST/PUT/DELETE routes bust
// the 'writing' tag on save.
const getInitialWritingsCached = unstable_cache(getInitialWritings, ['home-writings'], {
  revalidate: 3600,
  tags: ['writing'],
});

export default async function Home() {
  let initialProfile: Profile | null = null;
  try {
    initialProfile = await getInitialProfileCached();
  } catch (error) {
    // Render with the client-side fallback; the failure is not cached,
    // so the next request retries Firestore.
    console.error('[Home] Failed to load initial profile:', error);
  }

  let initialWritings: Writing[] = [];
  try {
    const fetched = await getInitialWritingsCached();
    initialWritings = publicWritings(fetched).filter((w) => isSafeHttpUrl(w.url));
  } catch (error) {
    console.error('[Home] Failed to load initial writings:', error);
  }

  return (
    <>
      <AOSInitializer />
      <HomeLightAnimation initialProfile={initialProfile} initialWritings={initialWritings} />
    </>
  );
}
