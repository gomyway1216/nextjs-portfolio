import { auth } from '@/lib/firebaseConnect';

async function getAuthHeaders() {
  const user = auth.currentUser;
  if (!user) return {};

  const token = await user.getIdToken();
  return {
    'Authorization': `Bearer ${token}`,
  };
}

export async function getMenuImageRef(file: File) {
  const headers = await getAuthHeaders();
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch('/api/image/menu', {
    method: 'POST',
    headers: {
      ...headers,
    },
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const data = await response.json();
  return data.downloadURL;
}

export async function getImageRef(file: File, type: string, id: string) {
  const headers = await getAuthHeaders();
  const formData = new FormData();
  formData.append('file', file);
  formData.append('type', type);
  formData.append('id', id);

  const response = await fetch('/api/image', {
    method: 'POST',
    headers: {
      ...headers,
    },
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const data = await response.json();
  return data.downloadURL;
}
