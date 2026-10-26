"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { Sidebar, type SidebarUser } from "@/components/sidebar";
import { ThemeToggle } from "@/components/theme-toggle";

interface AppShellProps {
  user: SidebarUser;
  children: React.ReactNode;
}

export function AppShell({ user, children }: AppShellProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();

  // Obtenir le titre de la page courante pour la barre mobile
  const getPageTitle = () => {
    if (pathname === "/") return "Pointages du personnel";
    if (pathname.startsWith("/admin/utilisateurs")) return "Gestion des utilisateurs";
    if (pathname.startsWith("/profil")) return "Mon Profil";
    if (pathname.startsWith("/parametres")) return "Paramètres";
    if (pathname.startsWith("/conditions")) return "Conditions d'utilisation";
    if (pathname.startsWith("/confidentialite")) return "Confidentialité";
    return "Portail OCP";
  };

  return (
    <div className="flex min-h-screen bg-background">
      {/* Barre latérale (Sidebar) responsive */}
      <Sidebar
        user={user}
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed((c) => !c)}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
      />

      {/* Conteneur principal (Header mobile + Contenu des pages) */}
      <div className="flex flex-1 flex-col min-w-0">
        {/* En-tête mobile (visible uniquement sur petits écrans) */}
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-surface/90 px-4 backdrop-blur-md md:hidden">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="inline-flex size-9 items-center justify-center rounded-lg border border-border bg-surface text-foreground shadow-xs hover:bg-muted"
              aria-label="Ouvrir le menu"
            >
              <Menu className="size-5" />
            </button>

            <Link href="/" className="flex items-center gap-2">
              <Image
                src="/assets/logo-ocp-phosboucraa.png"
                alt="Logo OCP Phosboucraâ"
                width={28}
                height={28}
                priority
                className="h-7 w-auto object-contain"
              />
              <span className="text-sm font-bold truncate">{getPageTitle()}</span>
            </Link>
          </div>

          <div className="flex items-center gap-2">
            <ThemeToggle />
            <div className="flex size-8 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
              {(user.full_name || user.username || "U").slice(0, 1).toUpperCase()}
            </div>
          </div>
        </header>

        {/* Zone de contenu des pages */}
        <main className="flex-1 w-full">
          {children}
        </main>
      </div>
    </div>
  );
}
