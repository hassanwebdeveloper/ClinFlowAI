export const LANDING_VIDEO = "/landing/clinflow-ai-features.mp4";

export const landingScreenshots = {
  newVisitRecording: {
    src: "/landing/new-visit-recording.png",
    alt: "ClinFlow AI new visit recording interface with voice capture",
    title: "Voice Recording",
    description: "Speak your visit summary naturally — ClinFlow AI listens and transcribes in real time.",
  },
  visitSoapNotes: {
    src: "/landing/visit-soap-notes.png",
    alt: "ClinFlow AI generated SOAP notes from voice summary",
    title: "SOAP Notes",
    description: "Structured Subjective, Objective, Assessment, and Plan notes generated automatically.",
  },
  visitSummary: {
    src: "/landing/visit-summary.png",
    alt: "ClinFlow AI visit summary with prescriptions and follow-ups",
    title: "Visit Summary",
    description: "Complete visit summary with prescriptions, allergies, and follow-up instructions.",
  },
  visitAiReminders: {
    src: "/landing/visit-ai-reminders.png",
    alt: "ClinFlow AI reminders for similar visits and missed documentation",
    title: "AI Reminders",
    description: "Smart alerts for similar past visits, dosage checks, and documentation gaps.",
  },
  visitLabReports: {
    src: "/landing/visit-lab-reports.png",
    alt: "ClinFlow AI lab test orders from visit",
    title: "Lab Orders",
    description: "Lab tests required for the visit, extracted and organized from your speech.",
  },
  dashboardHealthProfile: {
    src: "/landing/dashboard-health-profile.png",
    alt: "ClinFlow AI patient health profile dashboard",
    title: "Health Profile",
    description: "Living patient health profile maintained across every visit.",
  },
  dashboardAtAGlance: {
    src: "/landing/dashboard-at-a-glance.png",
    alt: "ClinFlow AI patient dashboard at a glance overview",
    title: "At a Glance",
    description: "Quick overview of patient status, recent visits, and pending follow-ups.",
  },
  dashboardLabHistory: {
    src: "/landing/dashboard-lab-report-history.png",
    alt: "ClinFlow AI lab report history with trend charts",
    title: "Lab Trend Charts",
    description: "Line charts tracking recurring lab results over time for every patient.",
  },
} as const;

export const visitOutputScreenshots = [
  landingScreenshots.visitSoapNotes,
  landingScreenshots.visitSummary,
  landingScreenshots.visitAiReminders,
  landingScreenshots.visitLabReports,
];

export const dashboardScreenshots = [
  landingScreenshots.dashboardAtAGlance,
  landingScreenshots.dashboardHealthProfile,
  landingScreenshots.dashboardLabHistory,
];
