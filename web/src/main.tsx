import { StrictMode, useState, lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RequireAuth } from "./components/RequireAuth";
import { Layout } from "./components/Layout";
import { ServerUrlDialog } from "./components/ServerUrlDialog";
import { isNative } from "./lib/capacitor";
import { CalendarView } from "./components/CalendarView";
import { LoginPage } from "./pages/LoginPage";
import "./index.css";

const SettingsPage = lazy(() =>
  import("./pages/SettingsPage").then((m) => ({ default: m.SettingsPage }))
);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1 },
  },
});

function App() {
  const needServerUrl = isNative && !localStorage.getItem("serverUrl");
  const [showDialog, setShowDialog] = useState(needServerUrl);

  return (
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <ServerUrlDialog open={showDialog} onSaved={() => setShowDialog(false)} />
        <BrowserRouter>
          <Routes>
            <Route path="/auth/login" element={<LoginPage />} />
            <Route element={<RequireAuth />}>
              <Route element={<Layout />}>
                <Route index element={<Navigate to="/calendar" replace />} />
                <Route path="/calendar" element={<CalendarView />} />
                <Route path="/settings" element={<Suspense fallback={<div className="p-6 text-sm text-neutral-400">请稍候...</div>}><SettingsPage /></Suspense>} />
              </Route>
            </Route>
          </Routes>
        </BrowserRouter>
      </QueryClientProvider>
    </StrictMode>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
