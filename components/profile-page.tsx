"use client";

import { useState } from "react";
import {
  User,
  ShieldCheck,
  UserCheck,
  KeyRound,
  CheckCircle2,
  AlertCircle,
  Save,
  Lock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { type SidebarUser } from "@/components/sidebar";

interface ProfilePageContentProps {
  currentUser: SidebarUser;
}

export function ProfilePageContent({ currentUser }: ProfilePageContentProps) {
  const [fullName, setFullName] = useState(currentUser.full_name || "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [savingProfile, setSavingProfile] = useState(false);
  const [profileSuccess, setProfileSuccess] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);

  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const isSuperAdmin = currentUser.role === "super_admin";

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    setProfileSuccess(null);
    setProfileError(null);

    try {
      const res = await fetch("/api/auth/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ full_name: fullName }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Erreur lors de la mise à jour");
      }

      setProfileSuccess("Votre nom complet a été mis à jour avec succès.");
    } catch (err: unknown) {
      setProfileError(err instanceof Error ? err.message : "Erreur inattendue");
    } finally {
      setSavingProfile(false);
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingPassword(true);
    setPasswordSuccess(null);
    setPasswordError(null);

    if (newPassword.length < 6) {
      setPasswordError("Le nouveau mot de passe doit comporter au moins 6 caractères.");
      setSavingPassword(false);
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError("Les deux nouveaux mots de passe ne correspondent pas.");
      setSavingPassword(false);
      return;
    }

    try {
      const res = await fetch("/api/auth/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          current_password: currentPassword,
          new_password: newPassword,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Erreur lors du changement de mot de passe");
      }

      setPasswordSuccess("Votre mot de passe a été modifié avec succès.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: unknown) {
      setPasswordError(err instanceof Error ? err.message : "Erreur inattendue");
    } finally {
      setSavingPassword(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-4 py-8 sm:px-6">
      {/* En-tête */}
      <div className="flex flex-col gap-1 border-b border-border pb-5">
        <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
          <User className="size-6 text-primary" />
          <span>Profil Utilisateur</span>
        </h1>
        <p className="text-sm text-muted-foreground">
          Consultez vos informations personnelles et gérez la sécurité de votre compte.
        </p>
      </div>

      {/* Carte d'identité du compte */}
      <Card className="p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="flex size-16 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-2xl font-bold text-primary ring-4 ring-primary/10">
              {(currentUser.full_name || currentUser.username || "U").slice(0, 2).toUpperCase()}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-foreground">
                  {currentUser.full_name || currentUser.username}
                </h2>
                {isSuperAdmin ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2.5 py-0.5 text-xs font-semibold text-primary">
                    <ShieldCheck className="size-3.5" />
                    Super Admin
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold text-muted-foreground">
                    <UserCheck className="size-3.5" />
                    Admin
                  </span>
                )}
              </div>
              <p className="text-sm text-muted-foreground">Identifiant : @{currentUser.username}</p>
            </div>
          </div>

          <div className="rounded-lg border border-border/80 bg-muted/30 p-3 text-xs text-muted-foreground space-y-1">
            <p>
              <strong className="text-foreground">Rôle système :</strong>{" "}
              {isSuperAdmin ? "Super Administrateur" : "Administrateur"}
            </p>
            <p>
              <strong className="text-foreground">Droits :</strong>{" "}
              {isSuperAdmin ? "Accès complet (Pointages + Utilisateurs + Système)" : "Consultation et pointages"}
            </p>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Formulaire Informations Générales */}
        <Card className="p-6">
          <h3 className="text-base font-semibold text-foreground flex items-center gap-2 mb-4">
            <User className="size-4 text-primary" />
            Informations générales
          </h3>

          {profileSuccess && (
            <div className="mb-4 flex items-center gap-2 rounded-lg bg-emerald-500/10 p-3 text-xs font-medium text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
              <CheckCircle2 className="size-4 shrink-0" />
              <span>{profileSuccess}</span>
            </div>
          )}

          {profileError && (
            <div className="mb-4 flex items-center gap-2 rounded-lg bg-danger-soft p-3 text-xs font-medium text-danger border border-danger/20">
              <AlertCircle className="size-4 shrink-0" />
              <span>{profileError}</span>
            </div>
          )}

          <form onSubmit={handleUpdateProfile} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-foreground mb-1.5">
                Identifiant (non modifiable)
              </label>
              <input
                type="text"
                disabled
                value={currentUser.username}
                className="w-full rounded-md border border-border bg-muted/60 px-3 py-2 text-sm text-muted-foreground cursor-not-allowed"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-foreground mb-1.5">
                Nom complet
              </label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Ex : Ahmed Bennani"
                className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            <Button type="submit" disabled={savingProfile} className="w-full">
              <Save className="size-4 mr-2" />
              {savingProfile ? "Enregistrement…" : "Enregistrer les modifications"}
            </Button>
          </form>
        </Card>

        {/* Formulaire Sécurité & Mot de passe */}
        <Card className="p-6">
          <h3 className="text-base font-semibold text-foreground flex items-center gap-2 mb-4">
            <Lock className="size-4 text-primary" />
            Sécurité du mot de passe
          </h3>

          {passwordSuccess && (
            <div className="mb-4 flex items-center gap-2 rounded-lg bg-emerald-500/10 p-3 text-xs font-medium text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
              <CheckCircle2 className="size-4 shrink-0" />
              <span>{passwordSuccess}</span>
            </div>
          )}

          {passwordError && (
            <div className="mb-4 flex items-center gap-2 rounded-lg bg-danger-soft p-3 text-xs font-medium text-danger border border-danger/20">
              <AlertCircle className="size-4 shrink-0" />
              <span>{passwordError}</span>
            </div>
          )}

          <form onSubmit={handleUpdatePassword} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-foreground mb-1.5">
                Mot de passe actuel
              </label>
              <input
                type="password"
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-foreground mb-1.5">
                Nouveau mot de passe (min. 6 caractères)
              </label>
              <input
                type="password"
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-foreground mb-1.5">
                Confirmer le nouveau mot de passe
              </label>
              <input
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            <Button type="submit" disabled={savingPassword} variant="outline" className="w-full">
              <KeyRound className="size-4 mr-2" />
              {savingPassword ? "Modification…" : "Changer le mot de passe"}
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
