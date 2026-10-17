import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { Clock, ShieldCheck, UserCheck, Users } from "lucide-react";
import { LogoutButton } from "@/components/logout-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { lireSession } from "@/lib/auth";

export const instant = false;

async function HeaderContent() {
  const user = await lireSession();

  if (!user) {
    redirect("/login");
  }

  const isSuperAdmin = user.role === "super_admin";

  return (
    <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-4 sm:px-6">
      <div className="flex items-center gap-4 sm:gap-6">
        <Link href="/" className="flex items-center gap-2.5 font-semibold">
          <Image
            src="/assets/logo-ocp-phosboucraa.png"
            alt="Logo OCP Phosboucraâ"
            width={1283}
            height={1226}
            priority
            className="h-10 w-auto rounded-md object-contain"
          />
          <span className="hidden sm:inline">Suivi des pointages</span>
        </Link>

        <nav className="flex items-center gap-1 sm:gap-2 text-sm font-medium" aria-label="Navigation principale">
          <Link
            href="/"
            className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <Clock className="size-4" aria-hidden="true" />
            <span>Pointages</span>
          </Link>
          {isSuperAdmin && (
            <Link
              href="/admin/utilisateurs"
              className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              <Users className="size-4" aria-hidden="true" />
              <span>Utilisateurs</span>
            </Link>
          )}
        </nav>
      </div>

      <div className="flex items-center gap-3">
        {/* Nom et rôle de l'utilisateur connecté */}
        <div className="flex items-center gap-2 text-right">
          <div className="hidden sm:flex flex-col items-end">
            <span className="text-xs font-semibold leading-tight text-foreground">
              {user.full_name || user.username}
            </span>
            <span className="text-[11px] text-muted-foreground flex items-center gap-1">
              {isSuperAdmin ? (
                <>
                  <ShieldCheck className="size-3 text-primary" aria-hidden="true" />
                  Super Administrateur
                </>
              ) : (
                <>
                  <UserCheck className="size-3 text-muted-foreground" aria-hidden="true" />
                  Administrateur
                </>
              )}
            </span>
          </div>
        </div>

        <ThemeToggle />
        <LogoutButton />
      </div>
    </div>
  );
}

function HeaderFallback() {
  return (
    <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-4 sm:px-6">
      <div className="flex items-center gap-2.5 font-semibold">
        <Image
          src="/assets/logo-ocp-phosboucraa.png"
          alt="Logo OCP Phosboucraâ"
          width={1283}
          height={1226}
          priority
          className="h-10 w-auto rounded-md object-contain"
        />
        <span className="hidden sm:inline">Suivi des pointages</span>
      </div>
      <div className="flex items-center gap-3">
        <ThemeToggle />
        <LogoutButton />
      </div>
    </div>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header className="border-b border-border bg-surface">
        <Suspense fallback={<HeaderFallback />}>
          <HeaderContent />
        </Suspense>
      </header>
      <div className="flex-1">{children}</div>
    </>
  );
}
