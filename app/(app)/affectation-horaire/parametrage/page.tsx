import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { lireSession } from "@/lib/auth";
import { HorairesParametrage } from "@/components/horaires-parametrage";

export const metadata: Metadata = {
  title: "Paramétrage des horaires | OCP Pointage",
  description: "Saisie des paramétrages horaires pour l'affectation dynamique des présences.",
};

export default async function ParametrageHorairesPage() {
  const session = await lireSession();
  if (!session) {
    redirect("/login");
  }

  return <HorairesParametrage />;
}
