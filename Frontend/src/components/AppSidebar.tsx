import { useState } from "react";
import { Users, CalendarDays, Search, Settings, Menu, X, Stethoscope, LogOut, Building2 } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { cn } from "@/lib/utils";
import { APP_NAME } from "@/lib/branding";
import { patientsListPath, searchTabPath, settingsTabPath, visitsTabPath } from "@/lib/routes";

interface AppSidebarProps {
  userName?: string;
  clinicName?: string;
  onBackToClinics?: () => void;
  onSignOut?: () => void;
}

const navItems = [
  { id: "patients", label: "Patients", icon: Users, to: patientsListPath() },
  { id: "visits", label: "Visits", icon: CalendarDays, to: visitsTabPath() },
  { id: "search", label: "Search", icon: Search, to: searchTabPath() },
  { id: "settings", label: "Settings", icon: Settings, to: settingsTabPath() },
] as const;

export function AppSidebar({ userName = "Doctor", clinicName, onBackToClinics, onSignOut }: AppSidebarProps) {
  /** Collapsed by default on small screens so main content gets width; expanded on md+. */
  const [collapsed, setCollapsed] = useState(() =>
    typeof window !== "undefined" ? !window.matchMedia("(min-width: 768px)").matches : false
  );
  const initials = userName.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);

  return (
    <aside
      className={cn(
        "h-screen sticky top-0 flex shrink-0 flex-col overflow-hidden border-r border-border bg-card transition-all duration-200",
        collapsed ? "w-14 sm:w-16" : "w-56"
      )}
    >
      {/* Logo + toggle — when collapsed, stack vertically so controls stay inside narrow rail */}
      <div
        className={cn(
          "shrink-0 border-b border-border",
          collapsed
            ? "flex flex-col items-center gap-1.5 px-1 py-2"
            : "flex h-14 items-center gap-3 px-4"
        )}
      >
        <Stethoscope className={cn("shrink-0 text-primary", collapsed ? "h-5 w-5" : "h-6 w-6")} />
        {!collapsed && (
          <span className="min-w-0 flex-1 truncate font-semibold text-sm tracking-tight text-foreground">
            {APP_NAME}
          </span>
        )}
        <button
          type="button"
          onClick={() => setCollapsed(!collapsed)}
          className={cn(
            "shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
            collapsed ? "" : "ml-auto"
          )}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <Menu className="h-4 w-4" /> : <X className="h-4 w-4" />}
        </button>
      </div>

      {/* Clinic indicator + back button */}
      {onBackToClinics && (
        <button
          onClick={onBackToClinics}
          className={cn(
            "flex items-center gap-2.5 rounded-lg text-sm transition-all duration-150",
            "bg-primary/5 hover:bg-primary/10 text-primary border border-primary/10",
            collapsed ? "mx-1 mt-2 justify-center px-0 py-2.5" : "mx-2 mt-2 px-3 py-2.5"
          )}
          title="Back to Clinics"
        >
          <Building2 className="h-4 w-4 shrink-0" />
          {!collapsed && (
            <span className="min-w-0 flex-1 truncate font-medium">{clinicName || "Switch Clinic"}</span>
          )}
        </button>
      )}

      {/* Nav */}
      <nav className={cn("flex-1 space-y-1 py-3", collapsed ? "px-1" : "px-2")}>
        {navItems.map((item) => (
          <NavLink
            key={item.id}
            to={item.to}
            className={cn(
              "flex w-full items-center rounded-lg text-sm font-medium transition-all duration-150",
              collapsed ? "justify-center px-2 py-2.5" : "gap-3 px-3 py-2.5",
              "text-muted-foreground hover:bg-accent hover:text-foreground"
            )}
            activeClassName="!bg-primary/10 !text-primary"
          >
            <item.icon className="h-4.5 w-4.5 shrink-0" />
            {!collapsed && <span>{item.label}</span>}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className={cn("border-t border-border", collapsed ? "p-2" : "p-4")}>
        <div className={cn("flex gap-2", collapsed ? "flex-col items-center" : "items-center")}>
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
            {initials}
          </div>
          {!collapsed && (
            <>
              <div className="min-w-0 flex-1 text-xs">
                <p className="truncate font-medium text-foreground">{userName}</p>
              </div>
              {onSignOut && (
                <button
                  type="button"
                  onClick={onSignOut}
                  className="text-muted-foreground transition-colors hover:text-destructive"
                  title="Sign out"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              )}
            </>
          )}
          {collapsed && onSignOut && (
            <button
              type="button"
              onClick={onSignOut}
              className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-destructive"
              title="Sign out"
            >
              <LogOut className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}
