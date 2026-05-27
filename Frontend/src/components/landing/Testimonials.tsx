import { Quote } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";

const testimonials = [
  {
    name: "Dr. Sarah Mitchell",
    role: "Family Medicine",
    location: "Austin, TX",
    initials: "SM",
    content:
      "I used to spend 15 minutes after every patient typing notes while they waited. Now I look them in the eye the entire visit. I speak for two minutes after they leave, and my SOAP note is done.",
    highlight: "2 min vs 15 min per patient",
  },
  {
    name: "Dr. Raj Patel",
    role: "Internal Medicine",
    location: "Chicago, IL",
    initials: "RP",
    content:
      "The AI reminders caught a dosage inconsistency I would have missed. It flagged a similar visit from eight months ago and reminded me the patient had reported a penicillin reaction.",
    highlight: "Caught a critical allergy gap",
  },
  {
    name: "Dr. Emily Chen",
    role: "Pediatrics",
    location: "Seattle, WA",
    initials: "EC",
    content:
      "Parents notice when I'm not staring at a screen. My patient satisfaction scores went up, and I leave the clinic an hour earlier every day. The lab trend charts are a game changer for chronic cases.",
    highlight: "1 hour saved daily",
  },
  {
    name: "Dr. James Okonkwo",
    role: "General Practice",
    location: "Atlanta, GA",
    initials: "JO",
    content:
      "I was skeptical about voice documentation, but ClinFlow AI understands clinical language. Prescriptions, lab orders, follow-ups — all structured correctly on the first pass.",
    highlight: "Accurate on first pass",
  },
];

export function LandingTestimonials() {
  return (
    <section id="testimonials" className="py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto mb-16 max-w-2xl text-center">
          <Badge variant="secondary" className="mb-4 border-teal-200 bg-teal-50 text-teal-800">
            Testimonials
          </Badge>
          <h2 className="font-display text-3xl font-bold tracking-tight text-[hsl(210_25%_12%)] sm:text-4xl lg:text-5xl">
            Physicians who reclaimed their focus
          </h2>
          <p className="mt-4 text-lg text-[hsl(210_12%_38%)]">
            Early adopters report more time with patients, fewer documentation errors, and
            shorter days at the clinic.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {testimonials.map((t) => (
            <Card
              key={t.name}
              className="group border-teal-900/8 bg-white transition-all duration-300 hover:-translate-y-1 hover:shadow-xl"
            >
              <CardContent className="p-6 sm:p-8">
                <Quote className="mb-4 h-8 w-8 text-teal-300" />
                <p className="mb-6 text-base leading-relaxed text-[hsl(210_15%_30%)]">
                  "{t.content}"
                </p>
                <Badge
                  variant="secondary"
                  className="mb-6 border-teal-200 bg-teal-50 text-teal-800"
                >
                  {t.highlight}
                </Badge>
                <div className="flex items-center gap-3 border-t border-teal-900/5 pt-4">
                  <Avatar className="h-11 w-11 border-2 border-teal-200">
                    <AvatarFallback className="bg-teal-100 font-semibold text-teal-800">
                      {t.initials}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-semibold text-[hsl(210_25%_15%)]">{t.name}</p>
                    <p className="text-sm text-[hsl(210_12%_45%)]">
                      {t.role} · {t.location}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
