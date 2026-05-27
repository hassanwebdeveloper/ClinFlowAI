import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";

const faqs = [
  {
    question: "How does ClinFlow AI work during a patient visit?",
    answer:
      "You focus entirely on your patient during the visit — no typing, no screen glances. After the patient leaves, you speak a natural summary of the visit. ClinFlow AI transcribes your speech and generates structured clinical documentation automatically.",
  },
  {
    question: "What documentation does ClinFlow AI generate?",
    answer:
      "From a single voice summary, ClinFlow AI creates SOAP notes, allergy updates, prescriptions with dosages, lab test orders, visit summaries, and AI-powered reminders such as similar past visits or potential documentation gaps.",
  },
  {
    question: "Does it understand medical terminology?",
    answer:
      "Yes. ClinFlow AI is built for clinical language — drug names, dosages, diagnoses, lab tests, and specialty-specific terminology are recognized and structured correctly into your patient records.",
  },
  {
    question: "What is the patient dashboard?",
    answer:
      "Each patient gets a living health profile in ClinFlow AI. It tracks visit history, follow-up labs required, and displays line charts for recurring lab results so you can spot trends at a glance.",
  },
  {
    question: "How does ClinFlow AI help catch errors?",
    answer:
      "The AI analyzes your spoken summary against the patient's history. It can flag missed dosages, remind you of allergies, surface similar previous visits, and highlight documentation items you may have overlooked.",
  },
  {
    question: "Is my patient data secure?",
    answer:
      "ClinFlow AI is designed with healthcare data security in mind. Patient records are encrypted and access-controlled, with audit trails for clinical compliance.",
  },
  {
    question: "Do I need special hardware?",
    answer:
      "No special equipment is required. Any standard microphone on your computer or clinic workstation works. Just speak naturally after each visit.",
  },
  {
    question: "How long does it take to generate documentation?",
    answer:
      "Most visit summaries are processed and structured within seconds. A two-minute voice summary typically produces a complete set of clinical records faster than typing would allow.",
  },
];

export function LandingFAQ() {
  return (
    <section id="faq" className="bg-white py-20 sm:py-28">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <div className="mb-12 text-center">
          <Badge variant="secondary" className="mb-4 border-teal-200 bg-teal-50 text-teal-800">
            FAQ
          </Badge>
          <h2 className="font-display text-3xl font-bold tracking-tight text-[hsl(210_25%_12%)] sm:text-4xl">
            Common questions
          </h2>
          <p className="mt-4 text-lg text-[hsl(210_12%_38%)]">
            Everything you need to know about voice-first documentation with ClinFlow AI.
          </p>
        </div>

        <Accordion type="single" collapsible className="space-y-3">
          {faqs.map((faq, index) => (
            <AccordionItem
              key={index}
              value={`item-${index}`}
              className="rounded-2xl border border-teal-900/8 bg-[hsl(40_33%_97%)] px-6 transition-colors hover:bg-teal-50/30"
            >
              <AccordionTrigger className="py-5 text-left font-semibold text-[hsl(210_25%_15%)] hover:no-underline">
                {faq.question}
              </AccordionTrigger>
              <AccordionContent className="pb-5 text-base leading-relaxed text-[hsl(210_12%_40%)]">
                {faq.answer}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}
