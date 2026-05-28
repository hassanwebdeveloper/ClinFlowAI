import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { clinicsPath } from "@/lib/routes";
import { LandingHeader } from "@/components/landing/Header";
import { LandingHero } from "@/components/landing/Hero";
import { LandingMediaSection } from "@/components/landing/MediaSection";
import { DemoVideoSection } from "@/components/landing/DemoVideoSection";
import { ProductShowcase } from "@/components/landing/ProductShowcase";
import { LandingBenefits } from "@/components/landing/Benefits";
import { LandingTestimonials } from "@/components/landing/Testimonials";
import { LandingFAQ } from "@/components/landing/FAQ";
import { LandingFinalCTA } from "@/components/landing/FinalCTA";
import { LandingFooter } from "@/components/landing/Footer";

export default function Landing() {
  const { isAuthenticated } = useAuth();

  if (isAuthenticated) {
    return <Navigate to={clinicsPath()} replace />;
  }

  return (
    <div className="landing-page min-h-screen">
      <LandingHeader />
      <main>
        <LandingHero />
        <LandingMediaSection />
        <DemoVideoSection />
        <ProductShowcase />
        <LandingBenefits />
        <LandingTestimonials />
        <LandingFAQ />
        <LandingFinalCTA />
      </main>
      <LandingFooter />
    </div>
  );
}
