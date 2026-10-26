"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Settings,
  Moon,
  Sun,
  Monitor,
  RefreshCw,
  Database,
  ShieldCheck,
  FileText,
  CheckCircle2,
  AlertCircle,
  Laptop,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ThemeToggle } from "@/components/theme-toggle";
import { type SidebarUser } from "@/components/sidebar";

interface SettingsPageContentProps {
  currentUser: SidebarUser;
}

export function SettingsPageContent({ currentUser }: SettingsPageContentProps) {
  const isSuperAdmin = currentUser.role === "super_admin";
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  const handleManualSync = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    setSyncStatus(null);
    setSyncError(null);

    try {
      const res = await fetch("/api/sync", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok && res.status !== 202) {
        throw new Error(data.error || "Échec de synchronisation");
      }
      setSyncStatus("Synchronisation lancée avec succès.");
    } catch (err: unknown) {
      setSyncError(err instanceof Error ? err.message : "Erreur de synchronisation");
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-4 py-8 sm:px-6">
      {/* En-tête */}
      <div className="flex flex-col gap-1 border-b border-border pb-5">
        <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
          <Settings className="size-6 text-primary" />
          <span>Paramètres de l'application</span>
        </h1>
        <p className="text-sm text-muted-foreground">
          Configurez l'apparence, visualisez le statut du système et gérez vos préférences.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Apparence & Thème */}
        <Card className="p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Laptop className="size-5 text-primary" />
            <h2 className="text-base font-semibold text-foreground">Apparence & Thème</h2>
          </div>
          <p className="text-xs text-muted-foreground">
            Basculez entre le thème clair et le thème sombre selon votre confort visuel.
          </p>

          <div className="flex items-center justify-between rounded-lg border border-border p-4 bg-muted/20">
            <div>
              <p className="text-sm font-semibold text-foreground">Mode Sombre / Clair</p>
              <p className="text-xs text-muted-foreground">Changer immédiatement le thème de l'interface</p>
            </div>
            <ThemeToggle />
          </div>
        </Card>

        {/* Droits & Accès de la session */}
        <Card className="p-6 space-y-4">
          <div className="flex items-center gap-2">
            <ShieldCheck className="size-5 text-primary" />
            <h2 className="text-base font-semibold text-foreground">Droits d'accès du compte</h2>
          </div>
          <p className="text-xs text-muted-foreground">
            Résumé des privilèges associés à votre rôle actuel.
          </p>

          <div className="rounded-lg border border-border/80 bg-muted/20 p-4 space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Rôle actif :</span>
              <span className="font-bold text-foreground">
                {isSuperAdmin ? "Super Administrateur" : "Administrateur"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Consultation des pointages :</span>
              <span className="text-emerald-600 dark:text-emerald-400 font-semibold">Autorisé</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Gestion des utilisateurs :</span>
              {isSuperAdmin ? (
                <span className="text-emerald-600 dark:text-emerald-400 font-semibold">Autorisé</span>
              ) : (
                <span className="text-muted-foreground italic">Non autorisé (réservé Super Admin)</span>
              )}
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Synchronisation manuelle :</span>
              {isSuperAdmin ? (
                <span className="text-emerald-600 dark:text-emerald-400 font-semibold">Autorisé</span>
              ) : (
                <span className="text-muted-foreground italic">Automatique uniquement</span>
              )}
            </div>
          </div>
        </Card>

        {/* Section Système & Synchronisation (Uniquement Super Admin) */}
        {isSuperAdmin && (
          <Card className="p-6 space-y-4 md:col-span-2">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <Database className="size-5 text-primary" />
                <h2 className="text-base font-semibold text-foreground">Administration & Synchronisation OCP</h2>
              </div>
              <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
                Espace Super Administrateur
              </span>
            </div>

            <p className="text-xs text-muted-foreground">
              Le système synchronise automatiquement les pointages depuis la base source vers la base locale de consultation. Vous pouvez forcer un rafraîchissement immédiat si nécessaire.
            </p>

            {syncStatus && (
              <div className="flex items-center gap-2 rounded-lg bg-emerald-500/10 p-3 text-xs font-medium text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                <CheckCircle2 className="size-4 shrink-0" />
                <span>{syncStatus}</span>
              </div>
            )}

            {syncError && (
              <div className="flex items-center gap-2 rounded-lg bg-danger-soft p-3 text-xs font-medium text-danger border border-danger/20">
                <AlertCircle className="size-4 shrink-0" />
                <span>{syncError}</span>
              </div>
            )}

            <div className="flex items-center justify-between flex-wrap gap-4 pt-2">
              <div className="text-xs text-muted-foreground">
                <p>État de la connexion base : <strong className="text-emerald-600 dark:text-emerald-400">Opérationnelle</strong></p>
                <p>Mode de réplication : Incrémentale automatique</p>
              </div>

              <Button
                type="button"
                onClick={handleManualSync}
                disabled={isSyncing}
                className="gap-2"
              >
                <RefreshCw className={`size-4 ${isSyncing ? "animate-spin" : ""}`} />
                <span>{isSyncing ? "Synchronisation en cours…" : "Forcer la synchronisation"}</span>
              </Button>
            </div>
          </Card>
        )}

        {/* Informations Légales & Support */}
        <Card className="p-6 space-y-4 md:col-span-2">
          <div className="flex items-center gap-2">
            <FileText className="size-5 text-primary" />
            <h2 className="text-base font-semibold text-foreground">Informations Légales & Conformité</h2>
          </div>
          <p className="text-xs text-muted-foreground">
            L&apos;utilisation de ce portail est réservée aux besoins professionnels internes du groupe OCP Phosboucraâ.
          </p>

          <div className="flex flex-wrap gap-4 pt-1">
            <Link
              href="/conditions"
              className="text-xs font-medium text-primary hover:underline"
            >
              Conditions d&apos;utilisation →
            </Link>
            <span className="text-muted-foreground text-xs">•</span>
            <Link
              href="/confidentialite"
              className="text-xs font-medium text-primary hover:underline"
            >
              Politique de confidentialité →
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
}
