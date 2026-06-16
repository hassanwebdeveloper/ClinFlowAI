import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";

const faqs = [
  {
    question: "How much time will I actually save per patient?",
    answer:
      "Physicians typically reclaim 30–40% of the time they used to spend on documentation per visit. What was 15 minutes of typing often becomes a 2-minute voice summary — freeing 2+ hours across a full clinic day.",
  },
  {
    question: "Can I really see more patients in the same hours?",
    answer:
      "Yes. When charting stops being the bottleneck between visits, many physicians fit 2 or more additional patients into the same schedule — directly increasing practice revenue without extending clinic hours.",
  },
  {
    question: "How does ClinFlow AI help me understand patients better?",
    answer:
      "Each patient gets a living health dashboard with visit history, lab trends, and follow-up tracking. You walk into every appointment with the full picture — not fragments scattered across old notes.",
  },
  {
    question: "What if I miss something during a busy visit?",
    answer:
      "ClinFlow AI analyzes your summary against patient history and flags potential gaps: missed dosages, allergy conflicts, similar past visits, and incomplete documentation — before you sign off.",
  },
  {
    question: "Will my patients notice a difference?",
    answer:
      "Absolutely. When you're not turning to a screen every few seconds, patients feel heard. Early adopters report higher satisfaction scores and stronger trust during exams.",
  },
  {
    question: "Does it understand medical terminology?",
    answer:
      "Yes. ClinFlow AI is built for clinical language — drug names, dosages, diagnoses, lab tests, and specialty-specific terminology are recognized and structured correctly into your patient records.",
  },
  {
    question: "Is my patient data secure?",
    answer:
      "ClinFlow AI is designed with healthcare data security in mind. Patient records are encrypted and access-controlled, with audit trails for clinical compliance.",
  },
  {
    question: "How long does it take to get started?",
    answer:
      "Setup takes minutes — no special hardware required. Any standard microphone works. Most physicians are documenting their first visit within their first session.",
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
            Practical answers about what changes for you, your patients, and your practice.
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
