import { NextRequest, NextResponse } from 'next/server';
import { getFirestore } from '@/lib/firebase-admin';
import { logApiError } from '../utils/errorLogger';
import { ErrorSeverity } from '@/types/errors';
import { ensureAdmin } from '@/lib/auth-utils';

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
    const { birthdate, location, email, languages, bioEn, bioJa, profileImageUrl } = body;

    const db = getFirestore();
    const docRef = db.collection('profile').doc(PROFILE_DOC_ID);

    const updateData: Record<string, unknown> = {};
    if (birthdate !== undefined) updateData.birthdate = birthdate;
    if (location !== undefined) updateData.location = location;
    if (email !== undefined) updateData.email = email;
    if (languages !== undefined) updateData.languages = languages;
    if (bioEn !== undefined) updateData.bioEn = bioEn;
    if (bioJa !== undefined) updateData.bioJa = bioJa;
    if (profileImageUrl !== undefined) updateData.profileImageUrl = profileImageUrl;

    await docRef.set(updateData, { merge: true });

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
