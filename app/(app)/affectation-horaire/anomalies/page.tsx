import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { lireSession } from "@/lib/auth";
import { HorairesAnomalies } from "@/components/horaires-anomalies";

export const metadata: Metadata = {
  title: "Anomalies de pointage | Affectation horaire",
  description: "Consultation et diagnostic des retards, absences, sorties manquantes et horaires non reconnus.",
};

export const instant = false;

async function AnomaliesPointageContent() {
  const session = await lireSession();
  if (!session) {
    redirect("/login");
  }

  return <HorairesAnomalies />;
}

export default function AnomaliesPointagePage() {
  return (
    <Suspense
      fallback={
        <div className="p-6 text-sm text-muted-foreground animate-pulse">
          Chargement des anomalies...
        </div>
      }
    >
      <AnomaliesPointageContent />
    </Suspense>
  );
}
