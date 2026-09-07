import { NextRequest, NextResponse } from 'next/server';

import { withActivityLog } from '@/app/api/_lib/withActivityLog';
import {
  STUDY_ARTICLES_COLLECTION,
  STUDY_ARTICLE_FEEDBACK_COLLECTION,
} from '@/app/api/constants';
import { logApiError } from '@/app/api/utils/errorLogger';
import { ensureValidUser } from '@/lib/auth-utils';
import { getFirestore } from '@/lib/firebase-admin';
import { parseStudyArticleFeedback, StudyArticleFeedback } from '@/lib/studyArticleFeedback';
import { ErrorSeverity } from '@/types/errors';

function feedbackDocumentId(userId: string, articleId: string): string {
  return `${userId}__${articleId}`;
}

type RouteContext = { params: Promise<{ id: string }> };

export const GET = withActivityLog(
  'next_api.study.articles.id.feedback.GET',
  async (request: NextRequest, { params }: RouteContext) => {
    const { user, response } = await ensureValidUser(request);
    if (response) return response;
    if (!user) {
      return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 });
    }

    const { id } = await params;
    const snapshot = await getFirestore()
      .collection(STUDY_ARTICLE_FEEDBACK_COLLECTION)
      .doc(feedbackDocumentId(user.uid, id))
      .get();

    return NextResponse.json(
      { success: true, feedback: snapshot.exists ? snapshot.data() : null },
      { headers: { 'Cache-Control': 'private, no-store' } }
    );
  }
);

export const PUT = withActivityLog(
  'next_api.study.articles.id.feedback.PUT',
  async (request: NextRequest, { params }: RouteContext) => {
    const endpoint = '/api/study/articles/[id]/feedback';
    try {
      const { user, response } = await ensureValidUser(request);
      if (response) return response;
      if (!user) {
        return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 });
      }

      const { id } = await params;
      const parsed = parseStudyArticleFeedback(await request.json().catch(() => null));
      if (!parsed.ok) {
        return NextResponse.json({ success: false, error: parsed.error }, { status: 400 });
      }

      const db = getFirestore();
      const article = await db.collection(STUDY_ARTICLES_COLLECTION).doc(id).get();
      if (!article.exists) {
        return NextResponse.json({ success: false, error: 'Article not found' }, { status: 404 });
      }

      const ref = db
        .collection(STUDY_ARTICLE_FEEDBACK_COLLECTION)
        .doc(feedbackDocumentId(user.uid, id));
      const existing = await ref.get();
      const now = new Date().toISOString();
      const feedback: StudyArticleFeedback = {
        articleId: id,
        userId: user.uid,
        signals: parsed.value.signals,
        skipped: parsed.value.skipped,
        createdAt: existing.exists
          ? (existing.data()?.createdAt as string | undefined) || now
          : now,
        updatedAt: now,
      };

      await ref.set(feedback);
      return NextResponse.json(
        { success: true, feedback },
        { headers: { 'Cache-Control': 'private, no-store' } }
      );
    } catch (error) {
      await logApiError({
        severity: ErrorSeverity.MEDIUM,
        errorType: 'StudyArticleFeedbackAPI:SaveError',
        message: 'Failed to save article feedback',
        details: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        endpoint,
      });
      return NextResponse.json(
        { success: false, error: 'Failed to save article feedback' },
        { status: 500 }
      );
    }
  }
);
