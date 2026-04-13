import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { HomeRedirect } from "@/components/HomeRedirect";
import { SessionExpiredListener } from "@/components/SessionExpiredListener";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/useAuth";
import Index from "./pages/Index.tsx";
import NotFound from "./pages/NotFound.tsx";
import SignInPage from "./pages/SignIn.tsx";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <SessionExpiredListener />
          <Routes>
            <Route path="/" element={<HomeRedirect />} />
            <Route path="/signin" element={<SignInPage />} />
            <Route path="/clinics" element={<Index />} />
            <Route path="/patients/:patientId/visits/:visitId" element={<Index />} />
            <Route path="/patients/:patientId" element={<Index />} />
            <Route path="/patients" element={<Index />} />
            <Route path="/visits" element={<Index />} />
            <Route path="/search" element={<Index />} />
            <Route path="/settings" element={<Index />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
