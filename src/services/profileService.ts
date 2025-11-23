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
