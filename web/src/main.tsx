import "preact/debug";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "preact";
import Router from "preact-router";
import { CalendarView } from "./components/CalendarView";
import { Layout } from "./components/Layout";
import { RequireAuth } from "./components/RequireAuth";
import { ErrorBoundary } from "./components/ui/ErrorBoundary";
import { injectDeadlineGuard } from "./lib/deadline-guard";
import { LoginPage } from "./pages/LoginPage";
import { SettingsPage } from "./pages/SettingsPage";
import "./index.css";

// Last-resort: if React tree doesn't mount in 15s, show raw-DOM fallback
injectDeadlineGuard(15_000);

// Initialize dark mode on every page load
const saved = localStorage.getItem("darkMode") === "1";
document.documentElement.className = saved ? "dark" : "light";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 5 * 60 * 1000, gcTime: 30 * 60 * 1000, retry: 1, refetchOnWindowFocus: false },
  },
});

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <RequireAuth>
          <Layout>
            <Router>
              <LoginPage path="/auth/login" />
              <CalendarView path="/calendar" default />
              <SettingsPage path="/settings" />
            </Router>
          </Layout>
        </RequireAuth>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

render(<App />, document.getElementById("root")!);
