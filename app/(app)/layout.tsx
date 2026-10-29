import { Suspense } from "react";
import { redirect } from "next/navigation";
import { lireSession } from "@/lib/auth";
import {
  estPerimetreRestreint,
  lireAffectationsDepartements,
  listerDepartementsAutorises,
  obtenirPerimetreDepartements,
} from "@/lib/perimetre";
import { AppShell } from "@/components/app-shell";
import type { PerimetreInfo } from "@/components/perimetre-context";

export const instant = false;

/** Calcule le périmètre à afficher (sidebar, exports). En cas d'erreur pour un admin : périmètre vide. */
async function lirePerimetreAffichage(user: {
  id: number;
  role: string;
}): Promise<PerimetreInfo> {
  if (user.role === "super_admin") {
    return { restreint: false, departements: [], effectifs: [] };
  }
  try {
    const perimetre = await obtenirPerimetreDepartements(user);
    if (!estPerimetreRestreint(perimetre)) {
      return { restreint: false, departements: [], effectifs: [] };
    }
    const [effectifs, directs] = await Promise.all([
      listerDepartementsAutorises(perimetre),
      lireAffectationsDepartements([user.id]),
    ]);
    return {
      restreint: true,
      departements: (directs.get(user.id) ?? []).map((d: { name: string }) => d.name),
      effectifs: effectifs.map((d: { name: string }) => d.name),
    };
  } catch {
    return { restreint: true, departements: [], effectifs: [] };
  }
}

async function LayoutContent({ children }: { children: React.ReactNode }) {
  const user = await lireSession();

  if (!user) {
    redirect("/login");
  }

  const perimetre = await lirePerimetreAffichage(user);

  return (
    <AppShell
      user={{
        id: user.id,
        username: user.username,
        full_name: user.full_name,
        role: user.role,
      }}
      perimetre={perimetre}
    >
      {children}
    </AppShell>
  );
}

function LayoutFallback({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-background">
      <div className="hidden md:flex w-68 border-r border-border bg-surface p-4 flex-col justify-between sticky top-0 h-screen shrink-0">
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
