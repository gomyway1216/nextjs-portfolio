import {
  POSTS_COLLECTION,
  POST_TAXONOMY_COLLECTION,
  POST_TAXONOMY_DOC_ID,
} from '@/app/api/constants';
import { withActivityLog } from '@/app/api/_lib/withActivityLog';
import { getFirestore } from '@/lib/firebase-admin';
import { ensureAdmin } from '@/lib/auth-utils';
import {
  SEEDED_POST_CATEGORIES,
  normalizePostCategory,
  normalizePostTag,
  normalizePostTags,
} from '@/lib/blog/postMetadata';
import { NextRequest, NextResponse } from 'next/server';

type TaxonomyType = 'category' | 'tag';

interface TaxonomyDoc {
  categories?: unknown;
  tags?: unknown;
}

interface TaxonomyItem {
  slug: string;
  postCount: number;
  configured: boolean;
  seeded: boolean;
}

const TYPE_FIELD: Record<TaxonomyType, 'categories' | 'tags'> = {
  category: 'categories',
  tag: 'tags',
};

function normalizeTaxonomyType(value: unknown): TaxonomyType | null {
  return value === 'category' || value === 'tag' ? value : null;
}

function normalizeStoredCategories(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map(normalizePostCategory).filter(Boolean)));
}

function normalizeStoredTags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return normalizePostTags(value);
}

function normalizeValue(type: TaxonomyType, value: unknown): string {
  return type === 'category' ? normalizePostCategory(value) : normalizePostTag(value);
}

function toTaxonomyItems(
  configured: string[],
  counts: Map<string, number>,
  seeded: readonly string[] = [],
): TaxonomyItem[] {
  const seededSet = new Set(seeded);
  const ordered = [
    ...seeded,
    ...configured.filter((slug) => !seededSet.has(slug)),
    ...Array.from(counts.keys()).sort((a, b) => a.localeCompare(b)),
  ];
  const slugs = Array.from(new Set(ordered));

  return slugs.map((slug) => ({
    slug,
    postCount: counts.get(slug) || 0,
    configured: configured.includes(slug),
    seeded: seededSet.has(slug),
  }));
}

function getTaxonomyRef() {
  const db = getFirestore();
  const ref = db.collection(POST_TAXONOMY_COLLECTION).doc(POST_TAXONOMY_DOC_ID);
  return { db, ref };
}

async function getTaxonomyDoc() {
  const { db, ref } = getTaxonomyRef();
  const doc = await ref.get();
  const data = doc.exists ? (doc.data() as TaxonomyDoc) : {};
  return { db, ref, data };
}

async function buildTaxonomyResponse() {
  const { db, data } = await getTaxonomyDoc();
  const configuredCategories = normalizeStoredCategories(data.categories);
  const configuredTags = normalizeStoredTags(data.tags);
  const categoryCounts = new Map<string, number>();
  const tagCounts = new Map<string, number>();

  const snapshot = await db.collection(POSTS_COLLECTION).select('category', 'tags').get();
  snapshot.forEach((doc) => {
    const post = doc.data();
    const category = normalizePostCategory(post.category);
    if (category) categoryCounts.set(category, (categoryCounts.get(category) || 0) + 1);

    for (const tag of normalizePostTags(post.tags)) {
      tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
    }
  });

  return {
    categories: toTaxonomyItems(configuredCategories, categoryCounts, SEEDED_POST_CATEGORIES),
    tags: toTaxonomyItems(configuredTags, tagCounts),
  };
}

export const GET = withActivityLog('next_api.post.taxonomy.GET', async (request: NextRequest) => {
  const { user, response } = await ensureAdmin(request);
  if (!user) return response!;

  try {
    return NextResponse.json(await buildTaxonomyResponse());
  } catch (error) {
    console.error('Error fetching post taxonomy:', error);
    return NextResponse.json(
      { error: 'Failed to fetch post taxonomy' },
      { status: 500 },
    );
  }
});

export const POST = withActivityLog('next_api.post.taxonomy.POST', async (request: NextRequest) => {
  const { user, response } = await ensureAdmin(request);
  if (!user) return response!;

  try {
    const body = await request.json();
    const type = normalizeTaxonomyType(body?.type);
    if (!type) {
      return NextResponse.json({ error: 'Invalid taxonomy type' }, { status: 400 });
    }

    const slug = normalizeValue(type, body?.value);
    if (!slug) {
      return NextResponse.json({ error: 'Taxonomy value is required' }, { status: 400 });
    }

    const { db, ref } = getTaxonomyRef();
    const field = TYPE_FIELD[type];

    await db.runTransaction(async (transaction) => {
      const doc = await transaction.get(ref);
      const data = doc.exists ? (doc.data() as TaxonomyDoc) : {};
      const existing = field === 'categories'
        ? normalizeStoredCategories(data.categories)
        : normalizeStoredTags(data.tags);

      transaction.set(ref, {
        [field]: Array.from(new Set([...existing, slug])),
        lastUpdated: new Date(),
      }, { merge: true });
    });

    return NextResponse.json(await buildTaxonomyResponse());
  } catch (error) {
    console.error('Error adding post taxonomy item:', error);
    return NextResponse.json(
      { error: 'Failed to add taxonomy item' },
      { status: 500 },
    );
  }
});

export const DELETE = withActivityLog('next_api.post.taxonomy.DELETE', async (request: NextRequest) => {
  const { user, response } = await ensureAdmin(request);
  if (!user) return response!;

  try {
    const body = await request.json();
    const type = normalizeTaxonomyType(body?.type);
    if (!type) {
      return NextResponse.json({ error: 'Invalid taxonomy type' }, { status: 400 });
    }

    const slug = normalizeValue(type, body?.value);
    if (!slug) {
      return NextResponse.json({ error: 'Taxonomy value is required' }, { status: 400 });
    }
    if (type === 'category' && SEEDED_POST_CATEGORIES.includes(slug as typeof SEEDED_POST_CATEGORIES[number])) {
      return NextResponse.json({ error: 'Seeded categories cannot be removed' }, { status: 409 });
    }

    const { db, ref } = getTaxonomyRef();
    const inUseQuery = type === 'category'
      ? db.collection(POSTS_COLLECTION).where('category', '==', slug).limit(1)
      : db.collection(POSTS_COLLECTION).where('tags', 'array-contains', slug).limit(1);
    const inUseSnapshot = await inUseQuery.get();
    if (!inUseSnapshot.empty) {
      return NextResponse.json(
        { error: 'Remove this value from posts before deleting it from taxonomy' },
        { status: 409 },
      );
    }

    const field = TYPE_FIELD[type];

    await db.runTransaction(async (transaction) => {
      const doc = await transaction.get(ref);
      const data = doc.exists ? (doc.data() as TaxonomyDoc) : {};
      const existing = field === 'categories'
        ? normalizeStoredCategories(data.categories)
        : normalizeStoredTags(data.tags);

      transaction.set(ref, {
        [field]: existing.filter((candidate) => candidate !== slug),
        lastUpdated: new Date(),
      }, { merge: true });
    });

    return NextResponse.json(await buildTaxonomyResponse());
  } catch (error) {
    console.error('Error deleting post taxonomy item:', error);
    return NextResponse.json(
      { error: 'Failed to delete taxonomy item' },
      { status: 500 },
    );
  }
});
