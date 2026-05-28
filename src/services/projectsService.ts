import { auth } from '@/lib/firebaseConnect';

export interface Project {
  id: string;
  title: string;
  date: string;
  description: string;
  client: string;
  industry: string;
  thumbImage?: string;
  images: string[];
  urls: UrlData[];
  technologies: Array<string | TechnologyData>;
  categories: string[];
}

async function getAuthHeaders(): Promise<Record<string, string>> {
  const user = auth.currentUser;
  if (!user) return {};

  const token = await user.getIdToken();
  return {
    'Authorization': `Bearer ${token}`,
  };
}

export async function getProjects(): Promise<Project[]> {
  const response = await fetch('/api/projects', {
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const data = await response.json();
  return data.projects;
}

export async function getProject(id: string): Promise<Project> {
  const response = await fetch(`/api/projects/${id}`, {
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const data = await response.json();
  return data.project;
}

export async function getProjectCategories(): Promise<string[]> {
  const response = await fetch('/api/projects/categories', {
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const data = await response.json();
  return data.categories;
}

export async function getUrlTypeList(): Promise<string[]> {
  const response = await fetch('/api/projects/url-types', {
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const data = await response.json();
  return data.urlTypes;
}

export interface TechnologyData {
  id: string;
  name: string;
  type: string;
}

export interface UrlData {
  name: string;
  link: string;
  type: string;
}

export interface ProjectInput {
  title: string;
  date?: string;
  description: string;
  client?: string;
  industry?: string;
  thumbImage?: string;
  images?: string[];
  urls?: UrlData[];
  technologies?: TechnologyData[];
  categories?: string[];
}

export async function createProject(project: ProjectInput): Promise<string> {
  const headers = await getAuthHeaders();

  const response = await fetch('/api/projects', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(project),
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const data = await response.json();
  return data.id;
}

export async function updateProject(id: string, project: ProjectInput) {
  const headers = await getAuthHeaders();

  const response = await fetch(`/api/projects/${id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(project),
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
}

export async function deleteProject(id: string) {
  const headers = await getAuthHeaders();

  const response = await fetch(`/api/projects/${id}`, {
    method: 'DELETE',
    headers: {
      ...headers,
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  return true;
}
