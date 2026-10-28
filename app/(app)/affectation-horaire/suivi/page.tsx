import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { lireSession } from "@/lib/auth";
import { HorairesSuivi } from "@/components/horaires-suivi";

export const metadata: Metadata = {
  title: "Suivi des présences | Affectation horaire dynamique",
  description: "Suivi des présences du personnel avec affectation automatique des horaires de travail.",
};

export const instant = false;

async function SuiviPresencesContent() {
  const session = await lireSession();
  if (!session) {
    redirect("/login");
  }

  return <HorairesSuivi />;
}

export default function SuiviPresencesPage() {
  return (
    <Suspense
      fallback={
        <div className="p-6 text-sm text-muted-foreground animate-pulse">
          Chargement du suivi des présences...
        </div>
      }
    >
      <SuiviPresencesContent />
    </Suspense>
  );
}
