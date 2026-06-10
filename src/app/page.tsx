// Home is the only route that uses [data-aos] elements, so AOS init +
// stylesheet live here instead of the root layout. Every other route
// (games, blog, tools, …) skips the AOS payload entirely.
import 'aos/dist/aos.css';
import { unstable_cache } from 'next/cache';
import AOSInitializer from './AOSInitializer';
import HomeLightAnimation from '@/views/all-home-version/HomeLightAnimation';
import { getFirestore } from '@/lib/firebase-admin';
import type { Profile } from '@/hooks/useProfile';
import { isSocialPlatform, type ProfileSocialLink } from '@/lib/socialLinks';

const PROFILE_DOC_ID = 'main';

function parseSocialLinks(value: unknown): ProfileSocialLink[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const links = value.filter(
    (link): link is ProfileSocialLink =>
      !!link &&
      typeof link === 'object' &&
      isSocialPlatform((link as { platform?: unknown }).platform) &&
      typeof (link as { url?: unknown }).url === 'string',
  );
  return links.length > 0 ? links : undefined;
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

export default async function Home() {
  let initialProfile: Profile | null = null;
  try {
    initialProfile = await getInitialProfileCached();
  } catch (error) {
    // Render with the client-side fallback; the failure is not cached,
    // so the next request retries Firestore.
    console.error('[Home] Failed to load initial profile:', error);
  }

  return (
    <>
      <AOSInitializer />
      <HomeLightAnimation initialProfile={initialProfile} />
    </>
  );
}
