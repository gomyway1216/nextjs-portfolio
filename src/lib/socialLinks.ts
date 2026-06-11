export const SOCIAL_PLATFORMS = ['facebook', 'linkedin', 'github', 'twitter'] as const;
export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];

export interface ProfileSocialLink {
  platform: SocialPlatform;
  url: string;
}

// Fallback when the profile document has no socialLinks yet — keeps the
// site rendering identically until the Firestore data is populated.
export const DEFAULT_SOCIAL_LINKS: ProfileSocialLink[] = [
  { platform: 'facebook', url: 'https://www.facebook.com/yaguchiyuudai/' },
  { platform: 'linkedin', url: 'https://www.linkedin.com/in/yudai-yaguchi/' },
  { platform: 'github', url: 'https://github.com/gomyway1216/' },
  { platform: 'twitter', url: 'https://twitter.com/yudai_engineer/' },
];

export function isSocialPlatform(value: unknown): value is SocialPlatform {
  return typeof value === 'string' && (SOCIAL_PLATFORMS as readonly string[]).includes(value);
}

/**
 * Valid social link: known platform (this build has an icon for it) and
 * an https URL — mirrors the PUT /api/profile validation so a value
 * written around the API (e.g. Firestore console) can't introduce a
 * javascript:/data: href.
 */
export function isValidSocialLink(link: unknown): link is ProfileSocialLink {
  if (!link || typeof link !== 'object') return false;
  const { platform, url } = link as { platform?: unknown; url?: unknown };
  return isSocialPlatform(platform) && typeof url === 'string' && url.startsWith('https://');
}

/**
 * Profile links when configured, hardcoded defaults otherwise. A profile
 * with an explicit socialLinks array is respected even when it filters
 * down to empty (hiding all links); defaults apply only when the field
 * is missing entirely (not yet configured, or profile still loading).
 */
export function resolveSocialLinks(
  profile?: { socialLinks?: ProfileSocialLink[] | null } | null,
): ProfileSocialLink[] {
  if (!profile || profile.socialLinks === undefined || profile.socialLinks === null) {
    return DEFAULT_SOCIAL_LINKS;
  }
  return profile.socialLinks.filter(isValidSocialLink);
}
