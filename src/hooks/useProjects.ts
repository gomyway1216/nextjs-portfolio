'use client';

import { useState, useEffect, useCallback } from 'react';
import * as api from '@/services/projectsService';
import type { Project } from '@/services/projectsService';

export interface CreateProjectData {
  title: string;
  date?: string;
  description: string;
  client?: string;
  industry?: string;
  thumbImage?: string;
  images?: string[];
  urls?: any[];
  technologies?: string[];
  categories?: string[];
}

export interface UpdateProjectData {
  title: string;
  date?: string;
  description: string;
  client?: string;
  industry?: string;
  thumbImage?: string;
  images?: string[];
  urls?: any[];
  technologies?: string[];
  categories?: string[];
}

/**
 * Hook to fetch all projects
 */
export function useProjects() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchProjects = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.getProjects();
      setProjects(data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch projects'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  return { projects, loading, error, refetch: fetchProjects };
}

/**
 * Hook to fetch a single project
 */
export function useProject(id: string | null) {
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchProject = useCallback(async () => {
    if (!id) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const data = await api.getProject(id);
      setProject(data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch project'));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchProject();
  }, [fetchProject]);

  return { project, loading, error, refetch: fetchProject };
}

/**
 * Hook to fetch project categories
 */
export function useProjectCategories() {
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const fetchCategories = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await api.getProjectCategories();
        setCategories(data);
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to fetch categories'));
      } finally {
        setLoading(false);
      }
    };

    fetchCategories();
  }, []);

  return { categories, loading, error };
}

/**
 * Hook to fetch URL types
 */
export function useUrlTypes() {
  const [urlTypes, setUrlTypes] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const fetchUrlTypes = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await api.getUrlTypeList();
        setUrlTypes(data);
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to fetch URL types'));
      } finally {
        setLoading(false);
      }
    };

    fetchUrlTypes();
  }, []);

  return { urlTypes, loading, error };
}

/**
 * Hook for project mutations (create, update, delete)
 */
export function useProjectMutations() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const createProject = async (project: CreateProjectData) => {
    try {
      setLoading(true);
      setError(null);
      const id = await api.createProject(project);
      return id;
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to create project');
      setError(error);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const updateProject = async (id: string, project: UpdateProjectData) => {
    try {
      setLoading(true);
      setError(null);
      await api.updateProject(id, project);
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to update project');
      setError(error);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const deleteProject = async (id: string) => {
    try {
      setLoading(true);
      setError(null);
      await api.deleteProject(id);
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to delete project');
      setError(error);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  return {
    createProject,
    updateProject,
    deleteProject,
    loading,
    error,
  };
}
