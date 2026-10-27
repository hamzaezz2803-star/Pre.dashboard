import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { lireSession } from "@/lib/auth";
import { RapportPresences } from "@/components/rapport-presences";

export const metadata: Metadata = {
  title: "Rapport des Présences | OCP Pointage",
  description:
    "Rapport officiel des présences avec horaires affectés, filtrage par dates et exportation Excel / PDF.",
};

export default async function RapportPresencesPage() {
  const session = await lireSession();
  if (!session) {
    redirect("/login");
  }

  return <RapportPresences />;
}
