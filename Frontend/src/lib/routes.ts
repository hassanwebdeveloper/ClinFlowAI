export const signInPath = "/signin";
export const clinicsPath = "/clinics";
export const patientsListPath = "/patients";
export const searchTabPath = "/search";
export const settingsTabPath = "/settings";
export const visitsTabPath = "/visits";
export const patientPath = (id: string) => `/patients/${id}`;
export const patientVisitPath = (patientId: string, visitId: string) => `/patients/${patientId}/visits/${visitId}`;
