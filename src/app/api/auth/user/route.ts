import { NextRequest, NextResponse } from 'next/server';
import { getFirestore } from '@/lib/firebase-admin';
import { USERS_COLLECTION } from '@/app/api/constants';
import { getOptionalUser } from '@/lib/auth-utils';

export async function POST(request: NextRequest) {
  try {
    const user = await getOptionalUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { displayName } = body;

    const db = getFirestore();
    const userRef = db.collection(USERS_COLLECTION).doc(user.uid);
    const existing = await userRef.get();

    if (existing.exists) {
      return NextResponse.json({ message: 'User already exists', user: existing.data() });
    }

    const userData = {
      uid: user.uid,
      email: user.email || '',
      displayName: displayName || '',
      role: 'user' as const,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await userRef.set(userData);

    return NextResponse.json({ message: 'User created', user: userData }, { status: 201 });
  } catch (error) {
    console.error('User creation error:', error);
    return NextResponse.json({ error: 'Failed to create user' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const user = await getOptionalUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const db = getFirestore();
    const userDoc = await db.collection(USERS_COLLECTION).doc(user.uid).get();

    if (!userDoc.exists) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    return NextResponse.json({ user: userDoc.data() });
  } catch (error) {
    console.error('Get user error:', error);
    return NextResponse.json({ error: 'Failed to get user' }, { status: 500 });
  }
}
