import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { lireSession } from "@/lib/auth";
import { HorairesSuivi } from "@/components/horaires-suivi";

export const metadata: Metadata = {
  title: "Suivi des présences | Affectation horaire dynamique",
  description: "Suivi des présences du personnel avec affectation automatique des horaires de travail.",
};

export default async function SuiviPresencesPage() {
  const session = await lireSession();
  if (!session) {
    redirect("/login");
  }

  return <HorairesSuivi />;
}
