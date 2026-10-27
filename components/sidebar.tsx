"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import {
  Clock,
  Users,
  User,
  Settings,
  LogOut,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  UserCheck,
  X,
  Sliders,
  CalendarClock,
  AlertTriangle,
} from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";

export interface SidebarUser {
  id: number;
  username: string;
  full_name: string | null;
  role: "super_admin" | "admin" | string;
}

export interface NavItem {
  id: string;
  label: string;
  href: string;
  icon: typeof Clock;
  allowedRoles: string[];
  badge?: string;
  description?: string;
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

/**
 * Configuration complète de la navigation avec la section « Affectation horaire dynamique ».
 */
export const NAV_SECTIONS: NavSection[] = [
  {
    title: "Menu Principal",
    items: [
      {
        id: "pointages",
        label: "Pointages",
        href: "/",
        icon: Clock,
        allowedRoles: ["super_admin", "admin"],
        description: "Pointages bruts et statistiques",
      },
      {
        id: "utilisateurs",
        label: "Utilisateurs",
        href: "/admin/utilisateurs",
        icon: Users,
        allowedRoles: ["super_admin"],
        badge: "Super Admin",
        description: "Gestion des comptes",
      },
    ],
  },
  {
    title: "Affectation horaire dynamique",
    items: [
      {
        id: "affectation-horaire",
        label: "Affectation horaire dynamique",
        href: "/affectation-horaire",
        icon: CalendarClock,
        allowedRoles: ["super_admin", "admin"],
        description: "Sélection employés & gestion des horaires dynamiques",
      },
    ],
  },
  {
    title: "Compte & Préférences",
    items: [
      {
        id: "profil",
        label: "Profil",
        href: "/profil",
        icon: User,
        allowedRoles: ["super_admin", "admin"],
        description: "Informations personnelles",
      },
      {
        id: "parametres",
        label: "Paramètres",
        href: "/parametres",
        icon: Settings,
        allowedRoles: ["super_admin", "admin"],
        description: "Préférences et synchronisation",
      },
    ],
  },
];

interface SidebarProps {
  user: SidebarUser;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
}

export function Sidebar({
  user,
  collapsed = false,
  onToggleCollapse,
  mobileOpen = false,
  onCloseMobile,
}: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const isSuperAdmin = user.role === "super_admin";

  async function handleLogout() {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // Ignorer l'erreur réseau éventuelle
    } finally {
      router.push("/login");
      router.refresh();
      setIsLoggingOut(false);
    }
  }

  // Détection de la route active
  const isActive = (href: string) => {
    if (href === "/") {
      return pathname === "/";
    }
    return pathname.startsWith(href);
  };

  const userInitials = (user.full_name || user.username || "U")
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <>
      {/* Overlay sombre pour mobile */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-xs transition-opacity md:hidden"
          onClick={onCloseMobile}
          aria-hidden="true"
        />
      )}

      {/* Barre latérale (Sidebar) fixe lors du défilement */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex flex-col border-r border-border bg-surface transition-all duration-300 ease-in-out md:sticky md:top-0 md:h-screen md:shrink-0",
          // État Mobile
          mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0",
          // Largeur Desktop (pliée ou dépliée)
          collapsed ? "md:w-20" : "md:w-68 w-72"
        )}
      >
        {/* En-tête : Logo et Titre */}
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-border px-4">
          <Link
            href="/"
            onClick={onCloseMobile}
            className="flex items-center gap-3 overflow-hidden group focus-visible:ring-2 focus-visible:ring-primary rounded-md p-1"
          >
            <div className="relative shrink-0 flex items-center justify-center rounded-lg bg-surface p-1 shadow-xs border border-border/60">
              <Image
                src="/assets/logo-ocp-phosboucraa.png"
                alt="Logo OCP Phosboucraâ"
                width={36}
                height={36}
                priority
                className="h-8 w-auto object-contain transition-transform group-hover:scale-105"
              />
            </div>
            {!collapsed && (
              <div className="flex flex-col min-w-0">
                <span className="truncate text-sm font-bold tracking-tight text-foreground">
                  Phosboucraâ
                </span>
                <span className="truncate text-[11px] font-medium text-muted-foreground">
                  Suivi des pointages
                </span>
              </div>
            )}
          </Link>

          {/* Bouton fermeture sur mobile */}
          <button
            type="button"
            onClick={onCloseMobile}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground md:hidden"
            aria-label="Fermer le menu"
          >
            <X className="size-5" />
          </button>

          {/* Bouton replier/déplier sur Desktop */}
          {onToggleCollapse && (
            <button
              type="button"
              onClick={onToggleCollapse}
              className="hidden md:inline-flex items-center justify-center rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              title={collapsed ? "Agrandir le menu" : "Réduire le menu"}
              aria-label={collapsed ? "Agrandir le menu" : "Réduire le menu"}
            >
              {collapsed ? (
                <ChevronRight className="size-4" />
              ) : (
                <ChevronLeft className="size-4" />
              )}
            </button>
          )}
        </div>

        {/* Section Navigation */}
        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
          {/* Badge du rôle actif */}
          {!collapsed && (
            <div className="px-2">
              <div
                className={cn(
                  "flex items-center gap-2 rounded-lg border px-3 py-2 text-xs",
                  isSuperAdmin
                    ? "border-primary/30 bg-primary/5 text-primary dark:bg-primary/10"
                    : "border-border bg-muted/50 text-muted-foreground"
                )}
              >
                {isSuperAdmin ? (
                  <>
                    <ShieldCheck className="size-4 shrink-0 text-primary" />
                    <div className="flex flex-col min-w-0">
                      <span className="font-semibold text-foreground">Super Administrateur</span>
                      <span className="text-[10px] text-muted-foreground">Accès complet à tous les modules</span>
                    </div>
                  </>
                ) : (
                  <>
                    <UserCheck className="size-4 shrink-0 text-muted-foreground" />
                    <div className="flex flex-col min-w-0">
                      <span className="font-semibold text-foreground">Administrateur</span>
                      <span className="text-[10px] text-muted-foreground">Consultation & rapports</span>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Liens de navigation par section */}
          <div className="space-y-4">
            {NAV_SECTIONS.map((section, sIdx) => {
              const visibleItems = section.items.filter((item) =>
                item.allowedRoles.includes(user.role)
              );
              if (visibleItems.length === 0) return null;

              return (
                <div key={section.title || sIdx} className="space-y-1">
                  {!collapsed ? (
                    <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/80">
                      {section.title}
                    </p>
                  ) : sIdx > 0 ? (
                    <div className="my-2 border-t border-border/60 mx-2" />
                  ) : null}

                  <nav className="space-y-1" aria-label={section.title}>
                    {visibleItems.map((item) => {
                      const active = isActive(item.href);
                      const IconComponent = item.icon;

                      return (
                        <Link
                          key={item.id}
                          href={item.href}
                          onClick={onCloseMobile}
                          title={collapsed ? `${item.label} (${item.description})` : undefined}
                          className={cn(
                            "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-150",
                            active
                              ? "bg-primary text-primary-foreground shadow-xs font-semibold"
                              : "text-muted-foreground hover:bg-muted hover:text-foreground",
                            collapsed && "justify-center px-2"
                          )}
                        >
                          <IconComponent
                            className={cn(
                              "size-4.5 shrink-0 transition-transform group-hover:scale-110",
                              active ? "text-primary-foreground" : "text-muted-foreground group-hover:text-foreground"
                            )}
                            aria-hidden="true"
                          />

                          {!collapsed && (
                            <div className="flex flex-1 items-center justify-between min-w-0">
                              <span className="truncate">{item.label}</span>
                              {item.badge && (
                                <span
                                  className={cn(
                                    "ml-2 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                                    active
                                      ? "bg-white/20 text-white"
                                      : "bg-primary/10 text-primary dark:bg-primary/20"
                                  )}
                                >
                                  {item.badge}
                                </span>
                              )}
                            </div>
                          )}
                        </Link>
                      );
                    })}
                  </nav>
                </div>
              );
            })}
          </div>
        </div>

        {/* Section Bas : Carte Utilisateur + Déconnexion */}
        <div className="shrink-0 border-t border-border p-3 space-y-2 bg-muted/20">
          {/* Carte Utilisateur */}
          <div
            className={cn(
              "flex items-center gap-3 rounded-lg p-2 transition-colors",
              collapsed ? "justify-center" : "bg-surface border border-border/70"
            )}
          >
            {/* Avatar avec initiales */}
            <div
              className="relative flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/15 font-bold text-xs text-primary ring-2 ring-primary/20"
              title={`${user.full_name || user.username} (${user.role})`}
            >
              {userInitials}
              <span className="absolute bottom-0 right-0 size-2.5 rounded-full bg-emerald-500 ring-2 ring-surface" />
            </div>

            {!collapsed && (
              <div className="flex flex-1 flex-col min-w-0">
                <span className="truncate text-xs font-bold text-foreground">
                  {user.full_name || user.username}
                </span>
                <span className="truncate text-[11px] text-muted-foreground">
                  @{user.username}
                </span>
              </div>
            )}
          </div>

          {/* Outils et bouton Déconnexion */}
          <div
            className={cn(
              "flex items-center gap-1.5",
              collapsed ? "flex-col" : "justify-between"
            )}
          >
            {/* Bouton Thème */}
            <ThemeToggle />

            {/* Bouton Se Déconnecter */}
            <button
              type="button"
              onClick={handleLogout}
              disabled={isLoggingOut}
              title="Se déconnecter"
              className={cn(
                "flex items-center gap-2 rounded-lg border border-border/80 px-3 py-2 text-xs font-semibold text-danger hover:bg-danger-soft hover:border-danger/30 transition-all disabled:opacity-60",
                collapsed ? "w-9 h-9 justify-center p-0" : "flex-1 justify-center"
              )}
              aria-label="Se déconnecter"
            >
              <LogOut className="size-4 shrink-0" aria-hidden="true" />
              {!collapsed && (
                <span>{isLoggingOut ? "Déconnexion…" : "Se déconnecter"}</span>
              )}
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
