export interface Job {
  id: string;
  companyName?: string;
  jobPosition?: string;
  jobDuration?: string;
  jobDescription?: string;
  jobType?: string;
  technologies?: string[];
  hidden?: boolean;
  order?: number;
  delayAnimation?: number;
  [key: string]: unknown;
}

export interface Education {
  id: string;
  school?: string;
  degree?: string;
  duration?: string;
  passingYear?: string;
  degreeTitle?: string;
  instituteName?: string;
  order?: number;
  delayAnimation?: number;
  [key: string]: unknown;
}

export async function getJobs(): Promise<Job[]> {
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

export async function getEducation(): Promise<Education[]> {
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
