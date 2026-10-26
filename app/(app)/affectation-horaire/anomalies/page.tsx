import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { lireSession } from "@/lib/auth";
import { HorairesAnomalies } from "@/components/horaires-anomalies";

export const metadata: Metadata = {
  title: "Anomalies de pointage | Affectation horaire",
  description: "Consultation et diagnostic des retards, absences, sorties manquantes et horaires non reconnus.",
};

export default async function AnomaliesPointagePage() {
  const session = await lireSession();
  if (!session) {
    redirect("/login");
  }

  return <HorairesAnomalies />;
}
