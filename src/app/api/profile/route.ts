import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { getFirestore } from '@/lib/firebase-admin';
import { logApiError } from '../utils/errorLogger';
import { ErrorSeverity } from '@/types/errors';
import { ensureAdmin } from '@/lib/auth-utils';
import { normalizeProfileImageUrl } from '@/lib/profileImage';
import { isSocialPlatform, type ProfileSocialLink } from '@/lib/socialLinks';

import { withActivityLog } from '@/app/api/_lib/withActivityLog';
const PROFILE_DOC_ID = 'main'; // Single document for the main profile

/**
 * GET /api/profile
 * Get profile information
 */
export const GET = withActivityLog('next_api.profile.GET', async () => {
  const endpoint = '/api/profile';
  try {
    const db = getFirestore();
    console.log('[API /profile] Fetching profile...');

    const docRef = db.collection('profile').doc(PROFILE_DOC_ID);
    const doc = await docRef.get();

    if (!doc.exists) {
      console.log('[API /profile] Profile not found');
      return NextResponse.json(
        { error: 'Profile not found' },
        { status: 404 }
      );
    }

    const profile = {
      id: doc.id,
      ...doc.data(),
    };

    console.log('[API /profile] Successfully returning profile');
    return NextResponse.json({ profile });
  } catch (error) {
    console.error('[API /profile] Error fetching profile:', error);
    await logApiError({
      severity: ErrorSeverity.HIGH,
      errorType: 'ProfileAPI:FetchError',
      message: 'Failed to fetch profile',
      details: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      endpoint,
    });
    return NextResponse.json(
      {
        error: 'Failed to fetch profile',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
});

/**
 * PUT /api/profile
 * Update profile information
 * SECURITY: Requires authentication
 */
export const PUT = withActivityLog('next_api.profile.PUT', async (request: NextRequest) => {
  const endpoint = '/api/profile';

  // SECURITY: Require admin for profile updates
  const { user, response: authResponse } = await ensureAdmin(request);
  if (!user) {
    return authResponse;
  }

  try {
    const body = await request.json();
    const { birthdate, location, email, languages, bioEn, bioJa, profileImageUrl, socialLinks } = body;
    let normalizedProfileImageUrl: string | undefined;

    try {
      normalizedProfileImageUrl = normalizeProfileImageUrl(profileImageUrl);
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'Invalid profile image URL' },
        { status: 400 }
      );
    }

    let normalizedSocialLinks: ProfileSocialLink[] | undefined;
    if (socialLinks !== undefined) {
      if (!Array.isArray(socialLinks)) {
        return NextResponse.json(
          { error: 'socialLinks must be an array of { platform, url }' },
          { status: 400 }
        );
      }
      for (const link of socialLinks) {
        const platform = (link as { platform?: unknown })?.platform;
        const url = (link as { url?: unknown })?.url;
        if (
          !isSocialPlatform(platform) ||
          typeof url !== 'string' ||
          !url.startsWith('https://') ||
          url.length > 300
        ) {
          return NextResponse.json(
            { error: 'Each social link needs a known platform and an https URL (max 300 chars)' },
            { status: 400 }
          );
        }
      }
      normalizedSocialLinks = (socialLinks as ProfileSocialLink[]).map(({ platform, url }) => ({
        platform,
        url,
      }));
    }

    const db = getFirestore();
    const docRef = db.collection('profile').doc(PROFILE_DOC_ID);

    const updateData: Record<string, unknown> = {};
    if (birthdate !== undefined) updateData.birthdate = birthdate;
    if (location !== undefined) updateData.location = location;
    if (email !== undefined) updateData.email = email;
    if (languages !== undefined) updateData.languages = languages;
    if (bioEn !== undefined) updateData.bioEn = bioEn;
    if (bioJa !== undefined) updateData.bioJa = bioJa;
    if (normalizedProfileImageUrl !== undefined) updateData.profileImageUrl = normalizedProfileImageUrl;
    if (normalizedSocialLinks !== undefined) updateData.socialLinks = normalizedSocialLinks;

    await docRef.set(updateData, { merge: true });

    // Bust the home page's cached profile so the edit shows up immediately.
    revalidateTag('profile', 'max');

    console.log('[API /profile] Successfully updated profile');
    return NextResponse.json({
      success: true,
      message: 'Profile updated successfully'
    });
  } catch (error) {
    console.error('[API /profile] Error updating profile:', error);
    await logApiError({
      severity: ErrorSeverity.HIGH,
      errorType: 'ProfileAPI:UpdateError',
      message: 'Failed to update profile',
      details: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      endpoint,
    });
    return NextResponse.json(
      {
        error: 'Failed to update profile',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
});
