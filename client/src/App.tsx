import { lazy, Suspense, useEffect, useState } from "react";
import { Route, Switch, useLocation } from "wouter";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { fetchCurrentUserProfile, startIdleLogout, watchAuthState, type AppRole } from "./lib/firebase";
import LoginPage from "./pages/LoginPage";
import NotFound from "./pages/NotFound";
import StudentPublicPage from "./pages/StudentPublicPage";

// Anyone landing on "/" or a family's "/p/:publicId" link — almost certainly the most common visit —
// never touches the teacher/supervisor tooling, so it shouldn't have to download it upfront. Each of
// these is its own chunk, fetched only once a signed-in session actually needs that role's screen.
const TeacherDashboard = lazy(() => import("./pages/TeacherDashboard"));
const SupervisorDashboard = lazy(() => import("./pages/SupervisorDashboard"));
const HalaqaDetailsPage = lazy(() => import("./pages/HalaqaDetailsPage"));
const StudentProfilePage = lazy(() => import("./pages/StudentProfilePage"));

type ProtectedRole = "teacher" | "supervisor";

/**
 * Gates `/teacher` and every `/supervisor*` route behind a signed-in session with the matching
 * role, in one place, instead of each page re-deriving its own guard. Also owns the shared idle
 * timeout for every protected route, so it survives navigating between them (e.g. from the
 * supervisor dashboard into a halaqa's detail page) instead of restarting per page-mount.
 */
function ProtectedSessionBoundary() {
  const [location, setLocation] = useLocation();
  const requiredRole: ProtectedRole | null =
    location === "/teacher" || location.startsWith("/supervisor") ? (location.startsWith("/supervisor") ? "supervisor" : "teacher") : null;
  const [authReady, setAuthReady] = useState(false);
  const [authRole, setAuthRole] = useState<AppRole | null>(null);
  const [gateResolved, setGateResolved] = useState(requiredRole === null);
  const isAuthorized = requiredRole === null || (authReady && authRole === requiredRole);

  useEffect(() => {
    return watchAuthState((user) => {
      if (!user) {
        setAuthRole(null);
        setAuthReady(true);
        return;
      }
      setAuthReady(false);
      fetchCurrentUserProfile(user.uid)
        .then((profile) => setAuthRole(profile?.role ?? null))
        .catch(() => setAuthRole(null))
        .finally(() => setAuthReady(true));
    });
  }, []);

  useEffect(() => {
    setGateResolved(requiredRole === null);
    if (requiredRole === null || !authReady) return;
    if (!authRole) setLocation("/login");
    else if (authRole !== requiredRole) setLocation(authRole === "supervisor" ? "/supervisor" : "/teacher");
    setGateResolved(true);
  }, [authReady, authRole, requiredRole, setLocation]);

  useEffect(() => {
    if (!requiredRole || !isAuthorized) return;
    return startIdleLogout(() => setLocation("/login"));
  }, [isAuthorized, requiredRole, setLocation]);

  if (requiredRole && (!gateResolved || !isAuthorized)) {
    return (
      <main className="route-gate" dir="rtl" aria-live="polite">
        <span className="route-gate__spinner" /> جارٍ التحقق من صلاحية الدخول…
      </main>
    );
  }
  return <Router />;
}

function RouteFallback() {
  return (
    <main className="route-gate" dir="rtl" aria-live="polite">
      <span className="route-gate__spinner" /> جارٍ التحميل…
    </main>
  );
}

function Router() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <Switch>
        <Route path="/" component={StudentPublicPage} />
        <Route path="/p/:publicId" component={StudentPublicPage} />
        <Route path="/login" component={LoginPage} />
        <Route path="/teacher" component={TeacherDashboard} />
        <Route path="/supervisor/halaqa/:halaqaId/student/:studentId" component={StudentProfilePage} />
        <Route path="/supervisor/halaqa/:halaqaId" component={HalaqaDetailsPage} />
        <Route path="/supervisor" component={SupervisorDashboard} />
        <Route path="/404" component={NotFound} />
        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster position="top-center" richColors />
          <ProtectedSessionBoundary />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
