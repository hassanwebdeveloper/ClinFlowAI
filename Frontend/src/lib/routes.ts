export function signInPath() {
  return "/signin";
}

export function signUpPath() {
  return "/signup";
}

export function guidePath() {
  return "/guide";
}

export function guideChapterPath(sectionId: string) {
  return `/guide/${encodeURIComponent(sectionId)}`;
}

export function resetPasswordPath() {
  return "/reset-password";
}

export function clinicsPath() {
  return "/clinics";
}

export function patientsListPath() {
  return "/patients";
}

export function patientPath(patientId: string) {
  return `/patients/${encodeURIComponent(patientId)}`;
}

export function patientVisitPath(patientId: string, visitId: string) {
  return `/patients/${encodeURIComponent(patientId)}/visits/${encodeURIComponent(visitId)}`;
}

export function visitsTabPath() {
  return "/visits";
}

export function searchTabPath() {
  return "/search";
}

export function settingsTabPath() {
  return "/settings";
}

