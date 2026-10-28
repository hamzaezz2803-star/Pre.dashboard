import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { lireSession } from "@/lib/auth";
import { SettingsPageContent } from "@/components/settings-page";

export const metadata: Metadata = {
  title: "Paramètres | Suivi des pointages OCP",
  description: "Paramètres et préférences du portail de suivi des pointages.",
};

export const instant = false;

async function ParametresContent() {
  const session = await lireSession();

  if (!session) {
    redirect("/login");
  }

  return (
    <SettingsPageContent
      currentUser={{
        id: session.id,
        username: session.username,
        full_name: session.full_name,
        role: session.role,
      }}
    />
  );
}

export default function ParametresPage() {
  return (
    <Suspense
      fallback={
        <div className="p-6 text-sm text-muted-foreground animate-pulse">
          Chargement des paramètres...
        </div>
      }
    >
      <ParametresContent />
    </Suspense>
  );
}
