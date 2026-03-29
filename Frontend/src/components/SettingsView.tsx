import { Settings as SettingsIcon } from "lucide-react";

export function SettingsView() {
  return (
    <div className="max-w-2xl mx-auto py-8 animate-fade-in">
      <h2 className="text-lg font-semibold text-foreground mb-5">Settings</h2>
      <div className="bg-card rounded-2xl border border-border card-shadow p-8 text-center">
        <SettingsIcon className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
        <p className="text-sm text-muted-foreground">Settings coming soon</p>
      </div>
    </div>
  );
}
