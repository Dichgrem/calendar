import "preact/debug";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "preact";
import Router from "preact-router";
import { CalendarView } from "./components/CalendarView";
import { Layout } from "./components/Layout";
import { RequireAuth } from "./components/RequireAuth";
import { ErrorBoundary } from "./components/ui/ErrorBoundary";
import { LoginPage } from "./pages/LoginPage";
import { SettingsPage } from "./pages/SettingsPage";
import "./index.css";

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
