import { Header } from "@/components/layout/Header";
import { HeroSection } from "@/components/home/HeroSection";
import { PrivacySecuritySection } from "@/components/home/PrivacySecuritySection";
import { DashboardPreview } from "@/components/home/DashboardPreview";
import { InfrastructureSection } from "@/components/home/InfrastructureSection";
import { NetworkGlobeSection } from "@/components/home/NetworkGlobeSection";
import { TransactionFlowSection } from "@/components/home/TransactionFlowSection";
import { Footer } from "@/components/layout/Footer";

export default function Home() {
  return (
    <div className="min-h-screen bg-[#08090C] text-[#F8FAFC] flex flex-col font-sans">
      <Header />
      <main className="flex-1">
        <HeroSection />
        <PrivacySecuritySection />
        <DashboardPreview />
        <InfrastructureSection />
        <NetworkGlobeSection />
        <TransactionFlowSection />
      </main>
      <Footer />
    </div>
  );
}
