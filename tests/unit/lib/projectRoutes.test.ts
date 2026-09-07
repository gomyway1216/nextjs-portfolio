import { describe, expect, it } from 'vitest';
import {
  COMMUNITY_PROJECT_ID,
  buildProjectSlugMap,
  getProjectPath,
  projectSlugCandidate,
  resolveProjectRouteId,
} from '@/lib/projectRoutes';

const projects = [
  { id: 'uF6jbN53qdfZBamwsKHF', title: 'Guitar Scale Practice' },
  { id: 'VCSuFqUzAigwqmLnfR5Y', title: 'TEM automatic defect analysis' },
  { id: COMMUNITY_PROJECT_ID, title: 'JTPA Community Hub' },
  { id: 'dupA000000000000000A', title: 'Portfolio' },
  { id: 'dupB000000000000000B', title: 'Portfolio!' },
  { id: 'noTitle0000000000000', title: '' },
];

describe('projectSlugCandidate', () => {
  it('derives a lowercase hyphenated slug from the title', () => {
    expect(projectSlugCandidate(projects[0])).toBe('guitar-scale-practice');
  });

  it('prefers the curated slug', () => {
    expect(projectSlugCandidate(projects[2])).toBe('bayarea-ai-jtpa-community-hub');
  });
});

describe('buildProjectSlugMap', () => {
  const map = buildProjectSlugMap(projects);

  it('maps unique titles to slugs in both directions', () => {
    expect(map.slugById.get('uF6jbN53qdfZBamwsKHF')).toBe('guitar-scale-practice');
    expect(map.idBySlug.get('tem-automatic-defect-analysis')).toBe('VCSuFqUzAigwqmLnfR5Y');
  });

  it('keeps the Firestore id for colliding titles and for an empty title', () => {
    expect(map.slugById.get('dupA000000000000000A')).toBe('dupA000000000000000A');
    expect(map.slugById.get('dupB000000000000000B')).toBe('dupB000000000000000B');
    expect(map.idBySlug.has('portfolio')).toBe(false);
    expect(map.slugById.get('noTitle0000000000000')).toBe('noTitle0000000000000');
  });

  it('never lets a derived slug shadow a curated one', () => {
    const shadow = buildProjectSlugMap([
      ...projects,
      { id: 'imposter00000000000', title: 'BayArea AI JTPA Community Hub' },
    ]);
    expect(shadow.idBySlug.get('bayarea-ai-jtpa-community-hub')).toBe(COMMUNITY_PROJECT_ID);
    expect(shadow.slugById.get('imposter00000000000')).toBe('imposter00000000000');
  });

  it('resolves every URL segment back to exactly one project', () => {
    for (const [id, segment] of map.slugById) {
      expect(resolveProjectRouteId(segment, map)).toBe(id);
    }
  });
});

describe('getProjectPath / resolveProjectRouteId', () => {
  const map = buildProjectSlugMap(projects);

  it('uses the slug when given a project and the map', () => {
    expect(getProjectPath(projects[0], map)).toBe('/projects/guitar-scale-practice');
    expect(getProjectPath(projects[3], map)).toBe('/projects/dupA000000000000000A');
  });

  it('falls back to the derived slug without a map and to the id without a title', () => {
    expect(getProjectPath(projects[1])).toBe('/projects/tem-automatic-defect-analysis');
    expect(getProjectPath(projects[5])).toBe('/projects/noTitle0000000000000');
  });

  it('keeps the curated-id string form for callers that only know the id', () => {
    expect(getProjectPath(COMMUNITY_PROJECT_ID)).toBe('/projects/bayarea-ai-jtpa-community-hub');
    expect(getProjectPath('uF6jbN53qdfZBamwsKHF')).toBe('/projects/uF6jbN53qdfZBamwsKHF');
    expect(resolveProjectRouteId('bayarea-ai-jtpa-community-hub')).toBe(COMMUNITY_PROJECT_ID);
    expect(resolveProjectRouteId('guitar-scale-practice')).toBe('guitar-scale-practice');
  });
});
