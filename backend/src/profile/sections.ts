/** Config for the generic CRUD used by every profile section */
export interface SectionConfig {
  model: string; // Prisma delegate name
  strings: string[];
  arrays?: string[];
  numbers?: string[];
  booleans?: string[];
  required: string;
}

export const SECTIONS: Record<string, SectionConfig> = {
  education: {
    model: 'education',
    required: 'institution',
    strings: ['institution', 'qualification', 'location', 'startDate', 'endDate'],
    arrays: ['details'],
  },
  experience: {
    model: 'experience',
    required: 'company',
    strings: ['company', 'title', 'location', 'startDate', 'endDate'],
    arrays: ['bullets'],
    numbers: ['salary'],
    booleans: ['current'],
  },
  skills: { model: 'skill', required: 'name', strings: ['name', 'category'] },
  projects: {
    model: 'project',
    required: 'name',
    strings: ['name', 'role', 'url', 'description'],
    arrays: ['tech', 'imageIds'],
  },
  certifications: {
    model: 'certification',
    required: 'title',
    strings: ['title', 'issuer', 'url', 'date'],
  },
  publications: { model: 'publication', required: 'citation', strings: ['citation', 'url'] },
  references: {
    model: 'reference',
    required: 'name',
    strings: ['name', 'role', 'company', 'email', 'phone'],
  },
};

export const PROFILE_STRINGS = [
  'fullName',
  'headline',
  'email',
  'phone',
  'location',
  'linkedin',
  'github',
  'website',
  'summary',
  'salaryCurrency',
  'salaryPeriod',
];
