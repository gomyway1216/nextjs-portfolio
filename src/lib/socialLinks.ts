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
 * Profile links when present, hardcoded defaults otherwise. Entries with
 * a platform this build has no icon for are dropped instead of crashing.
 */
export function resolveSocialLinks(
  profile?: { socialLinks?: ProfileSocialLink[] | null } | null,
): ProfileSocialLink[] {
  const links = (profile?.socialLinks ?? []).filter(
    (link) => link && isSocialPlatform(link.platform) && typeof link.url === 'string' && link.url,
  );
  return links.length > 0 ? links : DEFAULT_SOCIAL_LINKS;
}
