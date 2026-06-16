export type GuideImage = {
  src: string;
  alt: string;
  caption?: string;
};

export type GuideStep = {
  title: string;
  body: string;
};

export type GuideContentBlock = {
  steps: GuideStep[];
  image?: GuideImage;
};

export type GuideSection = {
  id: string;
  title: string;
  summary: string;
  intro: string;
  steps: GuideStep[];
  tips?: string[];
  successCheck?: string;
  images?: GuideImage[];
  /** When set, overrides default step/image index pairing. */
  blocks?: GuideContentBlock[];
};

/** Encode Guide screenshot paths (filenames may contain spaces). */
function guideImage(filename: string, alt: string, caption?: string): GuideImage {
  return {
    src: `/Guide/${encodeURIComponent(filename)}`,
    alt,
    caption,
  };
}

export const guideSections: GuideSection[] = [
  {
    id: "overview",
    title: "Overview",
    summary: "What ClinFlow AI does and what you will accomplish in this guide.",
    intro:
      "ClinFlow AI helps you document patient visits with voice. You speak during or after the exam; the app transcribes your audio and generates structured SOAP notes, visit summaries, lab orders, and clinical reminders. This guide walks you from requesting access through your first complete visit.",
    steps: [
      {
        title: "What you will complete",
        body: "By the end of this guide you will have requested an account, signed in, created a clinic, added a patient, recorded a visit, reviewed AI-generated notes, and explored the patient dashboard.",
      },
      {
        title: "Before you start",
        body: "Use a modern browser (Chrome, Edge, Safari, or Firefox) with microphone access for voice recording. Keep your email inbox open — account approval and password setup happen by email.",
      },
    ],
    successCheck:
      "You understand the full journey: request access → approval email → set password → sign in → clinic → patient → visit → dashboard.",
  },
  {
    id: "account-access",
    title: "Account activation",
    summary: "Request access, wait for approval by email, and set your password for the first time.",
    intro:
      "ClinFlow AI uses a reviewed access request — there is no instant self-serve signup. You submit your professional details, our team approves your request, and you receive an email with a one-time link to **set your password** and activate your account. You cannot sign in until all steps below are complete.",
    steps: [],
    blocks: [
      {
        steps: [
          {
            title: "Open the request form",
            body: 'From the landing page, click **Get Started** or go to `/signup`. The page title reads **Request account access** with the subtitle **Share your details and we will review your request**.',
          },
          {
            title: "Fill in your details",
            body: "Enter your **Full name**, **Country**, **City**, **Specialty**, and **Years of experience** (0–80). Optionally add **Practice/clinic name** and **License/registration #**. Enter your **Email** address.",
          },
        ],
        image: guideImage(
          "Signup.png",
          "ClinFlow AI access request form",
          "Request account access form",
        ),
      },
      {
        steps: [
          {
            title: "Submit the request",
            body: 'Click **Request Access**. On success you see the toast **Access request submitted ✓** and the page switches to the sign-in form. You still cannot sign in yet — check your inbox for a confirmation email while your request is reviewed.',
          },
        ],
        image: guideImage(
          "Request Email.png",
          "Confirmation email after submitting access request",
          "Confirmation email in your inbox",
        ),
      },
      {
        steps: [
          {
            title: "Open the approval email",
            body: 'There is no in-app waiting screen. When your request is approved, you receive **Your ClinFlowAI access request was approved** with a **Set your password** button. This link is for first-time account activation — it is not a forgot-password reset.',
          },
        ],
        image: guideImage(
          "Access Approved Email.png",
          "Access approved email with set password link",
          "Approval email with Set your password link",
        ),
      },
      {
        steps: [
          {
            title: "Set your password and activate your account",
            body: 'Click **Set your password** in the approval email. The link opens `/reset-password?token=...` where you create your initial login password. Enter **New password** (minimum 8 characters) and **Confirm password**, then click **Update password**. On success you see **Password updated. You can sign in now.** — proceed to the next chapter to sign in.',
          },
        ],
        image: guideImage(
          "Set Password.png",
          "Set new password form for first-time activation",
          "Set your password (first-time activation)",
        ),
      },
    ],
    tips: [
      'If you see "An account with this email already exists," you already have an account — go to **Sign in** instead.',
      'Already submitted a request? Check your inbox (and spam) for the approval email before submitting again.',
      "If you do not hear back within a few business days, contact support@clinflowai.net.",
      "Passwords must be at least 8 characters and must match in both fields.",
    ],
    successCheck:
      'Your access request was approved, you set your password via the approval email link, and you are ready to sign in.',
  },
  {
    id: "sign-in",
    title: "Sign in",
    summary: "Sign in and reach your clinic workspace.",
    intro: "After your password is set, sign in to reach your clinic workspace.",
    steps: [
      {
        title: "Go to sign in",
        body: 'Open `/signin`. The page shows **Welcome back** with subtitle **Sign in to continue**.',
      },
      {
        title: "Enter credentials",
        body: "Type your **Email** and **Password**, then click **Sign In**.",
      },
      {
        title: "Land on clinics",
        body: 'On success you see **Welcome back ✓** and are redirected to `/clinics` — your clinic picker.',
      },
    ],
    tips: [
      'Forgot your password? Click **Forgot password?**, enter your email, and click **Send reset link**.',
      'Need an account? Click **Don\'t have an account? Sign up** to return to the access request form.',
    ],
    successCheck: "You are signed in and viewing the Clinics page.",
    images: [guideImage("SignIn.png", "ClinFlow AI sign in form", "Sign in screen")],
  },
  {
    id: "add-clinic",
    title: "Add your first clinic",
    summary: "Create and select a clinic to organize patients and visits.",
    intro:
      "Clinics organize your patients and visits. You must select a clinic before accessing patients, visits, or search.",
    steps: [
      {
        title: "Open the clinic page",
        body: 'After sign-in you land on `/clinics`. If you have no clinics yet, you see **Welcome! Add your first clinic** with the message **Create a clinic to start managing patients and visits.**',
      },
      {
        title: "Create a clinic",
        body: 'Click **Add Your First Clinic** (or **Add Clinic** in the header). In the **Add New Clinic** dialog, enter **Clinic name *** (required). Optionally fill **Address**, **City**, **Country**, **Phone**, **Specialty**, and **Description**, then click **Add Clinic**.',
      },
      {
        title: "Select your clinic",
        body: 'You see the toast **Clinic added successfully**. Click your clinic card to select it and go to the patient list at `/patients`.',
      },
    ],
    tips: [
      "You can edit a clinic with the pencil icon on its card.",
      "A clinic can only be deleted if it has no patients.",
    ],
    successCheck: "Your clinic appears in the list and you are on the Patients page.",
    images: [
      guideImage("Add Clinic Button.png", "Add clinic button on empty clinics page", "Add Your First Clinic"),
      guideImage("Add Clinic Dialog.png", "Add New Clinic dialog form", "Add New Clinic dialog"),
      guideImage("Clinic List.png", "Clinic list with multiple clinics", "Your clinic list"),
    ],
  },
  {
    id: "add-patient",
    title: "Add a patient",
    summary: "Add patients with a reference ID, name, age, and gender.",
    intro:
      "Patients belong to your selected clinic. Each patient has a **Reference ID** you choose when adding them — it cannot be changed after save. Pick something you will remember and can search for on every return visit.",
    steps: [],
    blocks: [
      {
        steps: [
          {
            title: "Open the patient list",
            body: 'On `/patients`, use the search bar to find existing patients or click **Add Patient**.',
          },
        ],
        image: guideImage(
          "Add Patient Button.png",
          "Add Patient button on patient list",
          "Add Patient button",
        ),
      },
      {
        steps: [
          {
            title: "Fill the patient form",
            body: 'In **Add New Patient**, enter a **Reference ID** — **fixed after save**. Choose an ID you already use in practice, such as the patient\'s **mobile number** or an **existing patient ID** from your records or EMR (e.g. `03001234567` or `P-2041`). You will search by this same ID to reopen the patient on their next visit, so make it easy to recall and type. Then add **Patient name**, **Age**, and **Select gender** (Male, Female, or Other), and click **Add Patient**.',
          },
        ],
        image: guideImage("Add Patient Dialog.png", "Add New Patient dialog", "Add New Patient form"),
      },
      {
        steps: [
          {
            title: "Quick-add by reference ID",
            body: 'On return visits, type the patient\'s **Reference ID** (mobile number, EMR ID, or whatever you chose) in the search bar to find them instantly. If that ID does not exist yet, a card appears: **Add with ID {your search}** — click it to open the add dialog with the ID already filled in, so you can register a new patient without retyping the ID.',
          },
        ],
        image: guideImage(
          "Add Patient With Id.png",
          "Quick add patient by reference ID from search",
          "Quick-add by reference ID",
        ),
      },
      {
        steps: [
          {
            title: "Open the patient",
            body: 'After **Patient added successfully ✓**, you are taken to the patient dashboard at `/patients/{id}`.',
          },
        ],
        image: guideImage(
          "New Patient Added.png",
          "Newly added patient on dashboard",
          "Patient added confirmation",
        ),
      },
    ],
    tips: [
      "Use a Reference ID you already know — mobile number and EMR patient IDs work well because you can search the same value on every visit.",
      "Deleting a patient removes all their visits.",
    ],
    successCheck: "The new patient appears in your list and on their dashboard.",
  },
  {
    id: "create-visit",
    title: "Create a visit",
    summary: "Record a spoken visit summary, attach labs, and generate structured clinical notes.",
    intro:
      "Document a visit by recording a spoken summary of what happened in the exam room. ClinFlow AI transcribes your audio and turns it into SOAP notes, visit summaries, prescriptions, and lab orders. The more complete your spoken summary, the better the generated notes.",
    steps: [],
    blocks: [
      {
        steps: [
          {
            title: "Start a new visit",
            body: 'From the patient page, click **New Visit** in the header (or **New visit** / **Add first visit** on the dashboard). The screen title is **New Visit** with the patient name shown.',
          },
        ],
        image: guideImage("New Visit.png", "New visit screen before recording", "New Visit screen"),
      },
      {
        steps: [
          {
            title: "Record a spoken visit summary",
            body: "Tap the microphone and record a spoken summary of the patient visit. The more complete the details you speak, the better your SOAP notes, summary, and structured fields will be. You can add **more than one recording** — each time you press **Stop**, a new clip is saved in order, so you can pause between sections or add follow-up notes later. You can also drag and drop or browse audio files (webm, mp3, wav, m4a, ogg).",
          },
        ],
        image: guideImage("New Visit - Recording.png", "Recording audio during a visit", "Voice recording"),
      },
      {
        steps: [
          {
            title: "What to include in your spoken summary",
            body: "Speak naturally and cover the key parts of the encounter. For example: **symptoms or allergies** the patient reported; **measurements** you took (such as temperature or blood pressure); your **assessment**; and your **plan** — **medicines prescribed** and **lab tests or imaging ordered**. If you reviewed **lab reports during the visit**, say each **test name and its readings** aloud (e.g. \"HbA1c 8.2%, fasting glucose 145\"). Optionally, use **Upload files** or **Take photo** to attach lab images, PDFs, or documents — spoken values and uploaded files both help ClinFlow AI build your notes.",
          },
        ],
      },
      {
        steps: [
          {
            title: "Edit transcripts",
            body: "After you click **Transcribe audios**, expand each audio clip's **Transcript** section to review or correct the text before generating notes. Fix names, numbers, or clinical terms as needed — edits are saved when you generate the visit.",
          },
        ],
        image: guideImage("Edit Transcribe.png", "Editing visit transcript text", "Edit transcript"),
      },
      {
        steps: [
          {
            title: "Transcribe or generate notes",
            body: 'Click **Transcribe audios** to get editable transcripts without creating the visit yet. When you are satisfied, click **Generate notes** to transcribe (if needed) and create the visit with SOAP notes, summary, and structured fields in one step. If lab files are attached, confirm each **Lab test name** before generating.',
          },
        ],
        image: guideImage(
          "Generate and transcribe buttons.png",
          "Transcribe audios and Generate notes buttons",
          "Transcribe audios and Generate notes",
        ),
      },
    ],
    tips: [
      "Each recording stop saves a separate clip — use multiple clips if you prefer shorter takes.",
      'Success toast: **Visit created with structured notes**.',
      "You need a working microphone for in-browser recording.",
    ],
    successCheck:
      "You are on the visit detail page at `/patients/{id}/visits/{visitId}` with generated notes visible.",
  },
  {
    id: "visit-notes",
    title: "Review and edit visit notes",
    summary: "Review SOAP notes, summaries, labs, and AI reminders after a visit.",
    intro:
      "After a visit is created, review AI-generated documentation on the **Visits** tab. Edit any section and regenerate notes when you change transcripts or lab data.",
    steps: [
      {
        title: "SOAP Notes",
        body: "Review **Subjective**, **Objective**, **Assessment**, and **Plan**. Click the edit icon on any field, make changes, then **Save** or **Cancel**.",
      },
      {
        title: "Visit summary",
        body: "The **Visit summary** section includes date, visit title, summary report, and full transcript — all editable.",
      },
      {
        title: "Additional information",
        body: "Check **Symptoms**, **Duration**, **Relevant history**, **Allergies**, **Prescribed medicines**, and **Ordered labs & imaging** extracted from your visit.",
      },
      {
        title: "Lab reports",
        body: "View uploaded lab files and extracted details. Edit extracted text, then use **Regenerate structured notes** to refresh SOAP and summary fields.",
      },
      {
        title: "AI Reminders",
        body: 'Open **AI Reminders** and click **Refresh reminders** for similar previous visits, possible documentation gaps, and suggestions to repeat labs.',
      },
      {
        title: "Open visit history",
        body: 'Switch to the **Visits** tab. The left panel shows **Visit History** — click any visit to open it. The current visit displays on the right.',
      },
      {
        title: "Regenerate notes",
        body: 'After editing transcripts or lab extractions, click **Regenerate structured notes** at the bottom to rebuild SOAP, summary, medicines, and orders.',
      },
    ],
    tips: [
      "Deleting a visit unlinks its labs from that visit but keeps lab files on the patient record.",
      "Click a similar visit in AI Reminders to jump to that visit in history.",
    ],
    successCheck:
      "SOAP notes, visit summary, additional info, labs, and AI reminders are reviewed and accurate for your workflow.",
    images: [
      guideImage("Visit-SOAP Notes.png", "SOAP Notes section in visit details", "SOAP Notes"),
      guideImage("Visit - Visit Summary.png", "Visit summary section", "Visit summary"),
      guideImage("Visit - Additional Info.png", "Additional information section", "Additional information"),
      guideImage("Visit - Lab reports.png", "Lab reports section in visit", "Lab reports"),
      guideImage("Visit - AI Reminders.png", "AI Reminders section", "AI Reminders"),
    ],
  },
  {
    id: "patient-dashboard",
    title: "Patient dashboard",
    summary: "Use at-a-glance alerts, health profile, and lab trends per patient.",
    intro:
      "The **Dashboard** tab gives a longitudinal view of each patient — alerts, health profile, and lab trends across visits.",
    steps: [],
    blocks: [
      {
        steps: [
          {
            title: "Open the dashboard",
            body: 'Go to `/patients/{id}` with the **Dashboard** tab selected (default when no visit is in the URL). The dashboard brings together visit summaries, the health profile, and lab trends in one place.',
          },
        ],
        image: guideImage("Dashboard - Health Profile.png", "Patient health profile panel", "Health profile"),
      },
      {
        steps: [
          {
            title: "Review At a glance",
            body: 'The **At a glance** card highlights **Allergies**, **Recent abnormal labs**, and **Pending follow-up labs**. When nothing is flagged, it shows **Nothing flagged right now.**',
          },
        ],
        image: guideImage("Dashboard - At a glance.png", "Patient dashboard at a glance card", "At a glance"),
      },
      {
        steps: [
          {
            title: "Maintain health profile",
            body: 'Scroll to **Health profile** — **refreshes after visits**. Manage **Allergies**, **Long-term medications**, and **Conditions** with **Add allergy**, **Add medication**, or **Add condition**. Click **Save changes** when done.',
          },
        ],
        image: guideImage("Dashboard - Health Profile.png", "Patient health profile panel", "Health profile"),
      },
      {
        steps: [
          {
            title: "Track lab trends",
            body: 'The **Lab trends** section shows line charts when the same test appears at least twice with numeric values. KPI cards show visit count, last visit date, and lab report totals.',
          },
        ],
        image: guideImage(
          "Dashboard - Lab Report History.png",
          "Lab report history and trend charts",
          "Lab trends",
        ),
      },
    ],
    tips: [
      "Use **Open latest visit** or **Open visit** from the dashboard to jump back to documentation.",
      "Health profile data persists across visits and supplements visit-level notes.",
    ],
    successCheck:
      "You can read patient alerts, update the health profile, and see lab history charts when data is available.",
  },
  {
    id: "daily-navigation",
    title: "Daily navigation",
    summary: "Move between patients, visits, search, and clinics in the app.",
    intro:
      "Once your clinic is set up, use the sidebar and clinic switcher to move between patients, visits, and search.",
    steps: [
      {
        title: "Sidebar tabs",
        body: "**Patients** (`/patients`) — patient list and individual records. **Visits** (`/visits`) — recent visits across all patients in your clinic. **Search** (`/search`) — find patients by name or reference ID, and visits by title or diagnosis.",
      },
      {
        title: "Switch clinics",
        body: 'Click the clinic name at the top of the sidebar (**Back to Clinics**) to return to `/clinics` and select a different clinic.',
      },
      {
        title: "Patient tabs",
        body: "Inside a patient record, switch between **Dashboard** and **Visits** (with visit count badge).",
      },
      {
        title: "Sign out",
        body: "Use **Sign out** in the sidebar footer when you are done.",
      },
    ],
    tips: [
      "Tabs other than Clinics require a selected clinic — you are redirected to `/clinics` if none is selected.",
      "Settings is not yet available; the app redirects to Patients.",
    ],
    successCheck: "You can move between patients, visits, search, and clinics without getting lost.",
  },
  {
    id: "help",
    title: "Get help",
    summary: "Contact support and continue using ClinFlow AI in daily practice.",
    intro: "If you run into issues not covered in this guide, our team is here to help.",
    steps: [
      {
        title: "Contact support",
        body: "Email support@clinflowai.net with your account email and a description of the issue. Include screenshots if helpful.",
      },
      {
        title: "Request access for a colleague",
        body: "Each doctor needs their own account. Direct colleagues to the landing page **Get Started** button or `/signup`.",
      },
      {
        title: "Next steps",
        body: "Record your next visit, explore AI Reminders after a few patients accumulate, and keep health profiles updated for better dashboard insights.",
      },
    ],
    successCheck: "You know how to get support and continue using ClinFlow AI in daily practice.",
  },
];

export function getGuideSection(sectionId: string): GuideSection | undefined {
  return guideSections.find((s) => s.id === sectionId);
}

export function getGuideSectionIndex(sectionId: string): number {
  return guideSections.findIndex((s) => s.id === sectionId);
}

export function getAdjacentGuideSections(sectionId: string) {
  const index = getGuideSectionIndex(sectionId);
  if (index < 0) return { prev: undefined, next: undefined };
  return {
    prev: index > 0 ? guideSections[index - 1] : undefined,
    next: index < guideSections.length - 1 ? guideSections[index + 1] : undefined,
  };
}
