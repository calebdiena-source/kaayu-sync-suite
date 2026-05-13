import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import {
  LayoutDashboard,
  FolderOpen,
  Users2,
  CalendarDays,
  Settings,
  LogOut,
  ScanLine,
  Cloud,
  Menu,
  X,
  Sun,
  Moon,
  FileBarChart,
} from "lucide-react";
import { NotificationsPopover } from "@/components/notifications-popover";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { AIAssistant } from "@/components/ai-assistant";
import { useOnlineStatus } from "@/hooks/use-online-status";

const NAV = [
  { to: "/app/dashboard", label: "Tableau de bord", icon: LayoutDashboard },
  { to: "/app/documents", label: "Documents", icon: FolderOpen },
  { to: "/app/meetings", label: "Réunions", icon: Users2 },
  { to: "/app/planner", label: "Calendrier & Tâches", icon: CalendarDays },
  { to: "/app/ocr", label: "OCR & IA", icon: ScanLine },
  { to: "/app/reports", label: "Rapports IA", icon: FileBarChart },
  { to: "/app/settings", label: "Paramètres", icon: Settings },
] as const;

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, isAdmin, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [dark, setDark] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      navigate({ to: "/login", replace: true });
      return;
    }
    if (location.pathname === "/app" || location.pathname === "/app/") {
      navigate({ to: "/app/dashboard", replace: true });
    }
  }, [user, loading, navigate, location.pathname]);

  useEffect(() => {
    const stored = localStorage.getItem("theme");
    const isDark =
      stored === "dark" || (!stored && window.matchMedia("(prefers-color-scheme: dark)").matches);
    setDark(isDark);
    document.documentElement.classList.toggle("dark", isDark);
  }, []);

  const toggleTheme = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("theme", next ? "dark" : "light");
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        Chargement…
      </div>
    );
  }
  if (!user) {
    // useEffect above will navigate to /login; render nothing meanwhile.
    return null;
  }

  return (
    <div className="flex min-h-screen bg-background">
      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 w-64 -translate-x-full transform bg-sidebar text-sidebar-foreground transition-transform lg:static lg:translate-x-0",
          open && "translate-x-0",
        )}
      >
        <div className="flex h-16 items-center gap-2 border-b border-sidebar-border px-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Cloud className="h-5 w-5" />
          </div>
          <div>
            <div className="text-sm font-semibold tracking-tight">Kaayu</div>
            <div className="text-[11px] text-sidebar-foreground/60">Workspace</div>
          </div>
          <button className="ml-auto lg:hidden" onClick={() => setOpen(false)}>
            <X className="h-5 w-5" />
          </button>
        </div>
        <nav className="flex flex-col gap-0.5 p-3">
          {NAV.map((item) => {
            const Icon = item.icon;
            const active = location.pathname === item.to || location.pathname.startsWith(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => setOpen(false)}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                    : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
          {isAdmin && (
            <Link
              to="/app/admin"
              onClick={() => setOpen(false)}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                location.pathname.startsWith("/app/admin")
                  ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                  : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60",
              )}
            >
              <Settings className="h-4 w-4" /> Administration
            </Link>
          )}
        </nav>
        <div className="absolute inset-x-3 bottom-3 rounded-lg border border-sidebar-border/40 bg-sidebar-accent/30 p-3 text-xs">
          <div className="font-medium text-sidebar-foreground">{user.email}</div>
          <div className="mt-1 text-sidebar-foreground/60">
            {isAdmin ? "Administrateur" : "Employé"}
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b bg-card/80 px-4 backdrop-blur lg:px-6">
          <button className="lg:hidden" onClick={() => setOpen(true)}>
            <Menu className="h-5 w-5" />
          </button>
          <div className="hidden flex-1 sm:block">
            <h1 className="text-base font-semibold tracking-tight">
              Bienvenue, {user.email?.split("@")[0]}
            </h1>
            <p className="text-xs text-muted-foreground">
              {new Date().toLocaleDateString("fr-FR", {
                weekday: "long",
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <OnlineBadge />
            <Button variant="ghost" size="icon" onClick={toggleTheme} aria-label="Thème">
              {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
            <NotificationsPopover />
            <Button
              variant="ghost"
              size="icon"
              aria-label="Déconnexion"
              onClick={async () => {
                await supabase.auth.signOut();
                navigate({ to: "/login" });
              }}
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </header>
        <main className="flex-1 p-4 lg:p-8">{children}</main>
      </div>

      <AIAssistant />
      {open && (
        <div
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-30 bg-foreground/30 backdrop-blur-sm lg:hidden"
        />
      )}
    </div>
  );
}

function OnlineBadge() {
  const online = useOnlineStatus();
  return (
    <span
      title={online ? "Connecté" : "Hors connexion"}
      className={cn(
        "hidden items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium sm:inline-flex",
        online ? "bg-success/15 text-success" : "bg-warning/15 text-warning",
      )}
    >
      <span
        className={cn("h-2 w-2 rounded-full", online ? "bg-success animate-pulse" : "bg-warning")}
      />
      {online ? "En ligne" : "Hors connexion"}
    </span>
  );
}
