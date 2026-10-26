import { Suspense } from "react";
import { redirect } from "next/navigation";
import { lireSession } from "@/lib/auth";
import { AppShell } from "@/components/app-shell";

export const instant = false;

async function LayoutContent({ children }: { children: React.ReactNode }) {
  const user = await lireSession();

  if (!user) {
    redirect("/login");
  }

  return (
    <AppShell
      user={{
        id: user.id,
        username: user.username,
        full_name: user.full_name,
        role: user.role,
      }}
    >
      {children}
    </AppShell>
  );
}

function LayoutFallback({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-background">
      <div className="hidden md:flex w-68 border-r border-border bg-surface p-4 flex-col justify-between">
        <div className="h-8 w-36 rounded-md bg-muted animate-pulse" />
        <div className="space-y-3">
          <div className="h-9 rounded-md bg-muted animate-pulse" />
          <div className="h-9 rounded-md bg-muted animate-pulse" />
          <div className="h-9 rounded-md bg-muted animate-pulse" />
        </div>
        <div className="h-12 rounded-md bg-muted animate-pulse" />
      </div>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<LayoutFallback>{children}</LayoutFallback>}>
      <LayoutContent>{children}</LayoutContent>
    </Suspense>
  );
}
