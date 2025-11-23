import { auth } from '@/lib/firebaseConnect';

export interface Contact {
  id: string;
  blogId?: string;
  name: string;
  email: string;
  subject: string;
  comment: string;
  created: string;
}

async function getAuthHeaders(): Promise<Record<string, string>> {
  const user = auth.currentUser;
  if (!user) return {};

  const token = await user.getIdToken();
  return {
    'Authorization': `Bearer ${token}`,
  };
}

export async function getContacts() {
  const headers = await getAuthHeaders();

  const response = await fetch('/api/contact', {
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const data = await response.json();
  return data.contacts;
}

export async function createContact(contact: {
  blogId?: string;
  name: string;
  email: string;
  subject: string;
  comment: string;
}) {
  const response = await fetch('/api/contact', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(contact),
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const data = await response.json();
  return data.id;
}
