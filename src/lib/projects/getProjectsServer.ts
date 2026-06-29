import 'server-only';

import { PROJECTS_COLLECTION } from '@/app/api/constants';
import { getFirestore } from '@/lib/firebase-admin';
import { resolveProjectRouteId } from '@/lib/projectRoutes';
import type { Project, TechnologyData, UrlData } from '@/services/projectsService';

type ProjectDocData = Record<string, unknown>;

function toIsoDate(value: unknown): string {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (value instanceof Date) return value.toISOString();

  const timestamp = value as { toDate?: () => Date };
  return timestamp.toDate?.()?.toISOString() ?? '';
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function urlArray(value: unknown): UrlData[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): UrlData[] => {
    if (!item || typeof item !== 'object') return [];
    const data = item as Record<string, unknown>;
    const link = typeof data.link === 'string' ? data.link : '';
    if (!link) return [];

    return [{
      name: typeof data.name === 'string' ? data.name : '',
      link,
      type: typeof data.type === 'string' ? data.type : '',
    }];
  });
}

function technologyArray(value: unknown): Array<string | TechnologyData> {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): Array<string | TechnologyData> => {
    if (typeof item === 'string') return [item];
    if (!item || typeof item !== 'object') return [];

    const data = item as Record<string, unknown>;
    const name = typeof data.name === 'string' ? data.name : '';
    if (!name) return [];

    return [{
      id: typeof data.id === 'string' ? data.id : '',
      name,
      type: typeof data.type === 'string' ? data.type : '',
    }];
  });
}

function serializeProject(id: string, data: ProjectDocData): Project {
  return {
    id,
    title: typeof data.title === 'string' ? data.title : '',
    date: toIsoDate(data.date),
    description: typeof data.description === 'string' ? data.description : '',
    client: typeof data.client === 'string' ? data.client : '',
    industry: typeof data.industry === 'string' ? data.industry : '',
    thumbImage: typeof data.thumbImage === 'string' ? data.thumbImage : undefined,
    images: stringArray(data.images),
    urls: urlArray(data.urls),
    technologies: technologyArray(data.technologies),
    categories: stringArray(data.categories),
  };
}

export async function getProjectServer(routeId: string): Promise<Project | null> {
  const projectId = resolveProjectRouteId(routeId);
  const doc = await getFirestore().collection(PROJECTS_COLLECTION).doc(projectId).get();
  if (!doc.exists) return null;

  return serializeProject(doc.id, doc.data() ?? {});
}

export async function getProjectsServer(): Promise<Project[]> {
  const snapshot = await getFirestore().collection(PROJECTS_COLLECTION).get();
  return snapshot.docs.map((doc) => serializeProject(doc.id, doc.data() ?? {}));
}
