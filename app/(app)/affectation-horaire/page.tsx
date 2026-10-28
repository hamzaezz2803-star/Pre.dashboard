import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { lireSession } from "@/lib/auth";
import { AffectationHoraireDynamique } from "@/components/affectation-horaire-dynamique";

export const metadata: Metadata = {
  title: "Affectation horaire dynamique | OCP Pointage",
  description:
    "Sélection des employés et gestion des règles de reconnaissance horaire dynamique.",
};

export const instant = false;

async function AffectationHoraireContent() {
  const session = await lireSession();
  if (!session) {
    redirect("/login");
  }

  return <AffectationHoraireDynamique />;
}

export default function AffectationHorairePage() {
  return (
    <Suspense
      fallback={
        <div className="p-6 text-sm text-muted-foreground animate-pulse">
          Chargement du module d&apos;affectation horaire...
        </div>
      }
    >
      <AffectationHoraireContent />
    </Suspense>
  );
}
