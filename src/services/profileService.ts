import { auth } from '@/lib/firebaseConnect';

async function getAuthHeaders(): Promise<Record<string, string>> {
  const user = auth.currentUser;
  if (!user) return {};

  const token = await user.getIdToken();
  return {
    'Authorization': `Bearer ${token}`,
  };
}

export async function getResumeLink() {
  const response = await fetch('/api/profile/resume', {
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const data = await response.json();
  return data.resumeLink;
}

export async function uploadResume(file: File): Promise<string> {
  const headers = await getAuthHeaders();
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch('/api/profile/resume', {
    method: 'POST',
    headers,
    body: formData,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
  }

  const data = await response.json();
  return data.downloadURL;
}

export async function uploadProfilePhoto(file: File): Promise<string> {
  const headers = await getAuthHeaders();
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch('/api/profile/photo', {
    method: 'POST',
    headers,
    body: formData,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
  }

  const data = await response.json();
  return data.downloadURL;
}
