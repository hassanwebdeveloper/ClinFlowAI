import { useState } from "react";
import { Users, CalendarDays, Search, Settings, Menu, X, Stethoscope, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";

interface AppSidebarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  userName?: string;
  onSignOut?: () => void;
}

const navItems = [
  { id: "patients", label: "Patients", icon: Users },
  { id: "visits", label: "Visits", icon: CalendarDays },
  { id: "search", label: "Search", icon: Search },
  { id: "settings", label: "Settings", icon: Settings },
];

export function AppSidebar({ activeTab, onTabChange, userName = "Doctor", onSignOut }: AppSidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const initials = userName.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);

  return (
    <aside
      className={cn(
        "h-screen sticky top-0 flex flex-col bg-card border-r border-border transition-all duration-200",
        collapsed ? "w-16" : "w-56"
      )}
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 h-14 border-b border-border">
        <Stethoscope className="h-6 w-6 text-primary shrink-0" />
        {!collapsed && (
          <span className="font-semibold text-foreground text-sm tracking-tight">MedScribe AI</span>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="ml-auto text-muted-foreground hover:text-foreground transition-colors"
        >
          {collapsed ? <Menu className="h-4 w-4" /> : <X className="h-4 w-4" />}
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-3 px-2 space-y-1">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => onTabChange(item.id)}
            className={cn(
              "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150",
              activeTab === item.id
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-accent hover:text-foreground"
            )}
          >
            <item.icon className="h-4.5 w-4.5 shrink-0" />
            {!collapsed && <span>{item.label}</span>}
          </button>
        ))}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-border">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-semibold text-primary shrink-0">
            {initials}
          </div>
          {!collapsed && (
            <>
              <div className="text-xs flex-1 min-w-0">
                <p className="font-medium text-foreground truncate">{userName}</p>
              </div>
              {onSignOut && (
                <button
                  onClick={onSignOut}
                  className="text-muted-foreground hover:text-destructive transition-colors"
                  title="Sign out"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </aside>
  );
}
