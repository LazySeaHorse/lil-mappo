import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { SpeedInsights } from "@vercel/speed-insights/react";
import { Analytics } from "@vercel/analytics/react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/components/Account/AuthProvider";
import { AppErrorBoundary } from "@/components/AppErrorBoundary";
import { AnalyticsBridge } from "@/lib/analytics/AnalyticsBridge";
import Index from "./pages/Index.tsx";
import NotFound from "./pages/NotFound.tsx";
import { lazy, Suspense } from "react";
import { IS_DEMO, IS_DEMO_FRAME } from "./demo/isDemo";
import { loadDemoFrame } from "@/lib/lazyModules";

// Pure, so builds without the demo drop it along with its chunk.
const DemoFrame = /* @__PURE__ */ lazy(loadDemoFrame);

const App = () => (
  <AppErrorBoundary>
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
    <TooltipProvider>
      <BrowserRouter basename={import.meta.env.BASE_URL}>
        {!IS_DEMO && <AnalyticsBridge />}
        {IS_DEMO_FRAME && <Suspense fallback={null}><DemoFrame /></Suspense>}
        <Routes>
          <Route path="/" element={<Index />} />
          {/* Same element as "/" so replacing the URL after a deep link applies does not remount the editor. */}
          <Route path="/routes/:slug" element={<Index />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
      {!IS_DEMO && <SpeedInsights />}
      {!IS_DEMO && <Analytics />}
    </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
  </AppErrorBoundary>
);

export default App;
