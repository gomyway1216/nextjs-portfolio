import { NextRequest, NextResponse } from 'next/server';
import { getFirestore } from '@/lib/firebase-admin';
import { ensureValidUser } from '@/lib/auth-utils';
import { CONTACT_COLLECTION } from '@/app/api/constants';

/**
 * GET /api/contacts
 * Get all contacts
 * Requires authentication
 */
export async function GET(request: NextRequest) {
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
}

/**
 * POST /api/contacts
 * Create a new contact message
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { blogId, name, email, subject, comment } = body;

    if (!name || !email || !subject || !comment) {
      return NextResponse.json(
        { error: 'Missing required fields: name, email, subject, comment' },
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
}
