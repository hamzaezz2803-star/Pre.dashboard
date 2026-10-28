import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { lireSession } from "@/lib/auth";
import { RapportPresences } from "@/components/rapport-presences";

export const metadata: Metadata = {
  title: "Rapport des Présences | OCP Pointage",
  description:
    "Rapport officiel des présences avec horaires affectés, filtrage par dates et exportation Excel / PDF.",
};

export const instant = false;

async function RapportPresencesContent() {
  const session = await lireSession();
  if (!session) {
    redirect("/login");
  }

  return <RapportPresences />;
}

export default function RapportPresencesPage() {
  return (
    <Suspense
      fallback={
        <div className="p-6 text-sm text-muted-foreground animate-pulse">
          Chargement du rapport des présences...
        </div>
      }
    >
      <RapportPresencesContent />
    </Suspense>
  );
}
