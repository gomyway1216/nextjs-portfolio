// Home is the only route that uses [data-aos] elements, so AOS init +
// stylesheet live here instead of the root layout. Every other route
// (games, blog, tools, …) skips the AOS payload entirely.
import 'aos/dist/aos.css';
import { cookies, headers } from 'next/headers';
import { unstable_cache } from 'next/cache';
import AOSInitializer from './AOSInitializer';
import HomeLightAnimation from '@/views/all-home-version/HomeLightAnimation';
import { getFirestore } from '@/lib/firebase-admin';
import type { Profile } from '@/hooks/useProfile';
import { isValidSocialLink, type ProfileSocialLink } from '@/lib/socialLinks';
import { HOME_GAMES_CONFIG_DOC_ID, SITE_CONFIG_COLLECTION, WRITING_COLLECTION } from '@/app/api/constants';
import { isSafeHttpUrl, parseWritingDoc, publicWritings, type Writing } from '@/lib/writing';
import { getInitialPostsCached, type ServerPost } from '@/lib/blog/getPostsServer';
import { createPlainTextExcerpt } from '@/lib/text';
import { getProjectsCached } from '@/lib/projects/getProjectsCached';
import type { Project } from '@/services/projectsService';
import type { Education, Job } from '@/services/resumeService';
import {
  HOME_EDUCATION_CACHE_TAG,
  HOME_JOBS_CACHE_TAG,
  HOME_RESUME_CACHE_TAG,
} from '@/lib/home/cacheTags';
import {
  DEFAULT_HOME_GAME_IDS,
  HOME_GAMES_CACHE_TAG,
  normalizeHomeGameIds,
  shouldUseDefaultHomeGameIdsForRuntimeEnv,
} from '@/lib/homeGames';

const PROFILE_DOC_ID = 'main';
const HOME_BLOG_POST_LIMIT = 3;
const HOME_BLOG_EXCERPT_LENGTH = 220;

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

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

async function getInitialHomeGameIds(): Promise<string[]> {
  if (shouldUseDefaultHomeGameIdsForRuntimeEnv()) {
    return DEFAULT_HOME_GAME_IDS;
  }

  const doc = await getFirestore()
    .collection(SITE_CONFIG_COLLECTION)
    .doc(HOME_GAMES_CONFIG_DOC_ID)
    .get();

  return normalizeHomeGameIds(doc.exists ? doc.data()?.gameIds : undefined);
}

const getInitialHomeGameIdsCached = unstable_cache(getInitialHomeGameIds, ['home-games-config'], {
  revalidate: 3600,
  tags: [HOME_GAMES_CACHE_TAG],
});

async function getInitialJobs(): Promise<Job[]> {
  const snapshot = await getFirestore().collection('job').get();
  return snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      companyName: optionalString(data.companyName),
      companyNameJa: optionalString(data.companyNameJa),
      jobPosition: optionalString(data.jobPosition),
      jobPositionJa: optionalString(data.jobPositionJa),
      jobDuration: optionalString(data.jobDuration),
      jobType: optionalString(data.jobType),
      jobTypeJa: optionalString(data.jobTypeJa),
      jobDescription: optionalString(data.jobDescription),
      jobDescriptionJa: optionalString(data.jobDescriptionJa),
      technologies: Array.isArray(data.technologies)
        ? data.technologies.filter((technology): technology is string => typeof technology === 'string')
        : [],
      hidden: data.hidden === true,
      order: optionalNumber(data.order),
      delayAnimation: optionalNumber(data.delayAnimation),
    };
  });
}

const getInitialJobsCached = unstable_cache(getInitialJobs, ['home-jobs'], {
  revalidate: 3600,
  tags: [HOME_JOBS_CACHE_TAG],
});

async function getInitialEducation(): Promise<Education[]> {
  const snapshot = await getFirestore().collection('education').get();
  return snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      school: optionalString(data.school),
      degree: optionalString(data.degree),
      duration: optionalString(data.duration),
      passingYear: optionalString(data.passingYear),
      degreeTitle: optionalString(data.degreeTitle),
      instituteName: optionalString(data.instituteName),
      order: optionalNumber(data.order),
      delayAnimation: optionalNumber(data.delayAnimation),
    };
  });
}

const getInitialEducationCached = unstable_cache(getInitialEducation, ['home-education'], {
  revalidate: 3600,
  tags: [HOME_EDUCATION_CACHE_TAG],
});

async function getInitialResumeLink(): Promise<string | undefined> {
  const snapshot = await getFirestore()
    .collection('profile')
    .where('name', '==', 'resume')
    .limit(1)
    .get();
  return optionalString(snapshot.docs[0]?.data().value);
}

const getInitialResumeLinkCached = unstable_cache(getInitialResumeLink, ['home-resume'], {
  revalidate: 3600,
  tags: [HOME_RESUME_CACHE_TAG],
});

async function getInitialHomeLanguage() {
  const cookieStore = await cookies();
  const cookieLang = cookieStore.get('i18nextLng')?.value?.toLowerCase();
  if (cookieLang?.startsWith('ja')) return 'ja';
  if (cookieLang?.startsWith('en')) return 'en';

  const hdrs = await headers();
  const preferredLanguage = hdrs.get('accept-language')?.split(',')[0]?.trim().toLowerCase();
  return preferredLanguage?.startsWith('ja') ? 'ja' : 'en';
}

function toHomeBlogPost(post: ServerPost): ServerPost {
  return {
    ...post,
    summary: createPlainTextExcerpt(post.summary, HOME_BLOG_EXCERPT_LENGTH),
  };
}

export default async function Home() {
  const languagePromise = getInitialHomeLanguage();
  const [
    initialProfile,
    initialWritings,
    initialBlogPosts,
    initialHomeGameIds,
    initialJobs,
    initialEducation,
    initialProjects,
    initialResumeLink,
  ] = await Promise.all([
    getInitialProfileCached().catch((error): Profile | null => {
      console.error('[Home] Failed to load initial profile:', error);
      return null;
    }),
    getInitialWritingsCached()
      .then((writings) => publicWritings(writings).filter((writing) => isSafeHttpUrl(writing.url)))
      .catch((error): Writing[] => {
        console.error('[Home] Failed to load initial writings:', error);
        return [];
      }),
    languagePromise
      .then((language) => getInitialPostsCached('all', HOME_BLOG_POST_LIMIT, language))
      .then((page) => page.posts.map(toHomeBlogPost))
      .catch((error): ServerPost[] => {
        console.error('[Home] Failed to load initial blog posts:', error);
        return [];
      }),
    getInitialHomeGameIdsCached().catch((error): string[] => {
      console.error('[Home] Failed to load home games config:', error);
      return DEFAULT_HOME_GAME_IDS;
    }),
    getInitialJobsCached().catch((error): Job[] | undefined => {
      console.error('[Home] Failed to load initial jobs:', error);
      return undefined;
    }),
    getInitialEducationCached().catch((error): Education[] | undefined => {
      console.error('[Home] Failed to load initial education:', error);
      return undefined;
    }),
    getProjectsCached().catch((error): Project[] | undefined => {
      console.error('[Home] Failed to load initial projects:', error);
      return undefined;
    }),
    getInitialResumeLinkCached().catch((error): undefined => {
      console.error('[Home] Failed to load initial resume link:', error);
      return undefined;
    }),
  ]);

  return (
    <>
      <AOSInitializer />
      <HomeLightAnimation
        initialProfile={initialProfile}
        initialWritings={initialWritings}
        initialBlogPosts={initialBlogPosts}
        initialHomeGameIds={initialHomeGameIds}
        initialJobs={initialJobs}
        initialEducation={initialEducation}
        initialProjects={initialProjects}
        initialResumeLink={initialResumeLink}
      />
    </>
  );
}
