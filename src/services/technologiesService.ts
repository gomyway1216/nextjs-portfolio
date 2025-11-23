export interface Technology {
  id: string;
  name: string;
  type: string;
  [key: string]: any;
}

export async function getTechnologies() {
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

export async function getTechnologyNames() {
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
