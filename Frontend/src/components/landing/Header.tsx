import { Link } from "react-router-dom";
import { Activity } from "lucide-react";
import { Button } from "@/components/ui/button";
import { APP_NAME } from "@/lib/branding";
import { signInPath, signUpPath } from "@/lib/routes";

const navLinks = [
  { href: "#how-it-works", label: "How It Works" },
  { href: "#demo", label: "Demo" },
  { href: "#product", label: "Product" },
  { href: "#features", label: "Features" },
  { href: "#testimonials", label: "Testimonials" },
  { href: "#faq", label: "FAQ" },
];

export function LandingHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-teal-900/5 bg-[hsl(40_33%_97%/0.85)] backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link to="/" className="group flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-600 shadow-md shadow-teal-600/20 transition-transform group-hover:scale-105">
            <Activity className="h-5 w-5 text-white" strokeWidth={2.5} />
          </div>
          <span className="font-display text-xl font-semibold tracking-tight text-[hsl(210_25%_15%)]">
            {APP_NAME}
          </span>
        </Link>

        <nav className="hidden items-center gap-8 md:flex" aria-label="Main navigation">
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-sm font-medium text-[hsl(210_15%_40%)] transition-colors hover:text-teal-700"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            className="hidden text-[hsl(210_15%_40%)] hover:text-teal-700 sm:inline-flex"
            asChild
          >
            <Link to={signInPath()}>Sign In</Link>
          </Button>
          <Button
            className="rounded-full bg-teal-600 px-5 shadow-lg shadow-teal-600/25 hover:bg-teal-700"
            asChild
          >
            <Link to={signUpPath()}>Get Started</Link>
          </Button>
        </div>
      </div>
    </header>
  );
}
