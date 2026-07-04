type EducationDisplaySource = {
  passingYear?: string | null;
  duration?: string | null;
  degreeTitle?: string | null;
  degree?: string | null;
  instituteName?: string | null;
  school?: string | null;
};

export const getEducationPassingYear = (education: EducationDisplaySource): string => education.passingYear || education.duration || '';
export const getEducationDegreeTitle = (education: EducationDisplaySource): string => education.degreeTitle || education.degree || '';
export const getEducationInstituteName = (education: EducationDisplaySource): string => education.instituteName || education.school || '';

export function getEducationDisplayFields(education: EducationDisplaySource) {
  return {
    passingYear: getEducationPassingYear(education),
    degreeTitle: getEducationDegreeTitle(education),
    instituteName: getEducationInstituteName(education),
  };
}
