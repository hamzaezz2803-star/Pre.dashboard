import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { CompteursGestion } from "@/components/compteurs-gestion";
import { exigerRole } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Gestion des compteurs | Suivi des pointages",
  description: "Création et paramétrage des compteurs dynamiques et de leurs formules de calcul.",
};

export const instant = false;

async function CompteursContent() {
  // Consultation pour admin et super_admin ; seul le super_admin gère (contrôlé aussi par l'API)
  const auth = await exigerRole("admin", "super_admin");

  if (auth.error) {
    redirect("/");
  }

  return <CompteursGestion role={auth.role || "admin"} />;
}

export default function CompteursPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 text-center text-sm text-muted-foreground">
          Chargement des compteurs…
        </div>
      }
    >
      <CompteursContent />
    </Suspense>
  );
}
