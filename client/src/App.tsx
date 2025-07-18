import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import LandingPage from "@/pages/landing";
import WorkspacePage from "@/pages/workspace";
import ProcessingPage from "@/pages/processing";
import ServiceSelectionPage from "@/pages/service-selection";

function Router() {
  return (
    <Switch>
      <Route path="/" component={LandingPage} />
      <Route path="/processing/:videoId" component={ProcessingPage} />
      <Route path="/select-services/:id" component={ServiceSelectionPage} />
      <Route path="/workspace/:videoId" component={WorkspacePage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
