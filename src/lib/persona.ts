export type Persona = {
  fullName: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  postalCode: string;
  addressLine: string;
  city: string;
  region: string;
  country: string;
  company: string;
  jobTitle: string;
  dateOfBirth: string;
  scenario: string;
  tone: string;
  notes: string;
};

export const PERSONA_SCHEMA = {
  type: "object",
  required: [
    "fullName",
    "firstName",
    "lastName",
    "email",
    "phone",
    "postalCode",
    "addressLine",
    "city",
    "region",
    "country",
    "company",
    "jobTitle",
    "dateOfBirth",
    "scenario",
    "tone",
    "notes",
  ],
  additionalProperties: false,
  properties: {
    fullName: { type: "string" },
    firstName: { type: "string" },
    lastName: { type: "string" },
    email: { type: "string" },
    phone: { type: "string" },
    postalCode: { type: "string" },
    addressLine: { type: "string" },
    city: { type: "string" },
    region: { type: "string" },
    country: { type: "string" },
    company: { type: "string" },
    jobTitle: { type: "string" },
    dateOfBirth: { type: "string" },
    scenario: { type: "string" },
    tone: { type: "string" },
    notes: { type: "string" },
  },
} as const;
