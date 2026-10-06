import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { SpeedInsights } from "@vercel/speed-insights/react";
import { Analytics } from "@vercel/analytics/react";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/components/Account/AuthProvider";
import { AnalyticsBridge } from "@/lib/analytics/AnalyticsBridge";
import Index from "./pages/Index.tsx";
import NotFound from "./pages/NotFound.tsx";

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
    <TooltipProvider>
      <BrowserRouter basename={import.meta.env.BASE_URL}>
        <AnalyticsBridge />
        <Routes>
          <Route path="/" element={<Index />} />
          {/* Same element as "/" so replacing the URL after a deep link applies does not remount the editor. */}
          <Route path="/routes/:slug" element={<Index />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
      <SpeedInsights />
      <Analytics />
    </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
