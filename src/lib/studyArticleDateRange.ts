export interface StudyArticleDateRange {
  fromDate?: string;
  toDate?: string;
}

export function getStudyArticleDateRange(date: string): StudyArticleDateRange {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return {};

  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const day = Number(match[3]);
  const start = new Date(year, monthIndex, day);

  if (
    start.getFullYear() !== year ||
    start.getMonth() !== monthIndex ||
    start.getDate() !== day
  ) {
    return {};
  }

  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  return {
    fromDate: start.toISOString(),
    toDate: end.toISOString(),
  };
}
