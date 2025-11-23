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
  urls: any[];
  technologies: string[];
  categories: string[];
}

async function getAuthHeaders() {
  const user = auth.currentUser;
  if (!user) return {};

  const token = await user.getIdToken();
  return {
    'Authorization': `Bearer ${token}`,
  };
}

export async function getProjects() {
  const response = await fetch('/api/project', {
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

export async function getProject(id: string) {
  const response = await fetch(`/api/project/${id}`, {
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

export async function getProjectCategories() {
  const response = await fetch('/api/project/categories', {
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

export async function getUrlTypeList() {
  const response = await fetch('/api/project/url-types', {
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

export async function createProject(project: {
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
}) {
  const headers = await getAuthHeaders();

  const response = await fetch('/api/project', {
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

export async function updateProject(id: string, project: {
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
}) {
  const headers = await getAuthHeaders();

  const response = await fetch(`/api/project/${id}`, {
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

  const response = await fetch(`/api/project/${id}`, {
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
