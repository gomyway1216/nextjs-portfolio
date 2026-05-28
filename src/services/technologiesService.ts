export interface Technology {
  id: string;
  name: string;
  type: string;
  [key: string]: unknown;
}

export async function getTechnologies(): Promise<Technology[]> {
  const response = await fetch('/api/technology', {
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const data = await response.json();
  return data.technologies;
}

export async function getTechnologyNames(): Promise<string[]> {
  const response = await fetch('/api/technology/names', {
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const data = await response.json();
  return data.technologies;
}
