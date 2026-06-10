import { NextRequest, NextResponse } from 'next/server';
import { getFirestore } from '@/lib/firebase-admin';
import { ensureValidUser } from '@/lib/auth-utils';
import { clientIpFrom, isRateLimited } from '@/lib/rateLimit';
import { CONTACT_COLLECTION } from '@/app/api/constants';

import { withActivityLog } from '@/app/api/_lib/withActivityLog';
/**
 * GET /api/contacts
 * Get all contacts
 * Requires authentication
 */
export const GET = withActivityLog('next_api.contact.GET', async (request: NextRequest) => {
  try {
    const { user, response } = await ensureValidUser(request);
    if (!user) {
      return response!;
    }

    const db = getFirestore();
    const snapshot = await db.collection(CONTACT_COLLECTION).get();

    const contacts = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        blogId: data.blogId || null,
        name: data.name,
        email: data.email,
        subject: data.subject,
        comment: data.comment,
        created: data.created?.toDate?.()?.toISOString() || data.created,
      };
    });

    return NextResponse.json({ contacts });
  } catch (error) {
    console.error('Error fetching contacts:', error);
    return NextResponse.json(
      { error: 'Failed to fetch contacts' },
      { status: 500 }
    );
  }
});

/**
 * POST /api/contacts
 * Create a new contact message
 */
const FIELD_LIMITS = {
  name: 100,
  email: 254,
  subject: 200,
  comment: 5000,
  blogId: 100,
} as const;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Generous ceiling over the summed FIELD_LIMITS (~5.7KB of content).
const MAX_PAYLOAD_BYTES = 32 * 1024;

export const POST = withActivityLog('next_api.contact.POST', async (request: NextRequest) => {
  try {
    // Unauthenticated public endpoint — cap how fast a single IP can
    // write to Firestore.
    if (isRateLimited(`contact:${clientIpFrom(request)}`, { limit: 5, windowMs: 10 * 60 * 1000 })) {
      return NextResponse.json(
        { error: 'Too many messages. Please try again later.' },
        { status: 429 }
      );
    }

    // Reject oversized payloads before request.json() buffers them.
    const contentLength = Number(request.headers.get('content-length'));
    if (Number.isFinite(contentLength) && contentLength > MAX_PAYLOAD_BYTES) {
      return NextResponse.json(
        { error: 'Payload too large' },
        { status: 413 }
      );
    }

    const body = await request.json();
    const { blogId, name, email, subject, comment } = body;

    if (!name || !email || !subject || !comment) {
      return NextResponse.json(
        { error: 'Missing required fields: name, email, subject, comment' },
        { status: 400 }
      );
    }

    for (const [field, max] of Object.entries(FIELD_LIMITS)) {
      const value = (body as Record<string, unknown>)[field];
      if (value === undefined || value === null) continue;
      if (typeof value !== 'string' || value.length > max) {
        return NextResponse.json(
          { error: `Field "${field}" must be a string of at most ${max} characters` },
          { status: 400 }
        );
      }
    }

    if (!EMAIL_PATTERN.test(email)) {
      return NextResponse.json(
        { error: 'Invalid email address' },
        { status: 400 }
      );
    }

    const db = getFirestore();

    const docRef = await db.collection(CONTACT_COLLECTION).add({
      blogId: blogId || null,
      name,
      email,
      subject,
      comment,
      created: new Date(),
    });

    return NextResponse.json(
      { id: docRef.id, message: 'Contact created successfully' },
      { status: 201 }
    );
  } catch (error) {
    console.error('Error creating contact:', error);
    return NextResponse.json(
      { error: 'Failed to create contact' },
      { status: 500 }
    );
  }
});
