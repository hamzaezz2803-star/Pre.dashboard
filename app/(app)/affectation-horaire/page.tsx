import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { lireSession } from "@/lib/auth";
import { AffectationHoraireDynamique } from "@/components/affectation-horaire-dynamique";

export const metadata: Metadata = {
  title: "Affectation horaire dynamique | OCP Pointage",
  description:
    "Sélection des employés et gestion des règles de reconnaissance horaire dynamique.",
};

export default async function AffectationHorairePage() {
  const session = await lireSession();
  if (!session) {
    redirect("/login");
  }

  return <AffectationHoraireDynamique />;
}
