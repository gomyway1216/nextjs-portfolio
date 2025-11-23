export interface Job {
  id: string;
  [key: string]: any;
}

export interface Education {
  id: string;
  [key: string]: any;
}

export async function getJobs() {
  const response = await fetch('/api/job', {
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const data = await response.json();
  return data.jobs;
}

export async function getEducation() {
  const response = await fetch('/api/education', {
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const data = await response.json();
  return data.education;
}
