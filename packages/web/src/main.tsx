import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RequireAuth } from "./components/RequireAuth";
import { Layout } from "./components/Layout";
import { CalendarPage } from "./pages/CalendarPage";
import { ImportPage } from "./pages/ImportPage";
import { SettingsPage } from "./pages/SettingsPage";
import { LoginPage } from "./pages/LoginPage";
import "./index.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1 },
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/auth/login" element={<LoginPage />} />
          <Route element={<RequireAuth />}>
            <Route element={<Layout />}>
              <Route index element={<Navigate to="/calendar" replace />} />
              <Route path="/calendar" element={<CalendarPage />} />
              <Route path="/import" element={<ImportPage />} />
              <Route path="/settings" element={<SettingsPage />} />
            </Route>
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
