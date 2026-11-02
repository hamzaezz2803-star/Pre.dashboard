import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { DetailJour } from "@/components/detail-jour";
import { exigerRole } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Détail jour | Suivi des pointages",
  description: "Pointages, horaire affecté et compteurs d'un employé pour une journée.",
};

export const instant = false;

async function DetailJourContent() {
  // Le périmètre de départements est contrôlé par chaque route API
  const auth = await exigerRole("admin", "super_admin");

  if (auth.error) {
    redirect("/");
  }

  return <DetailJour />;
}

export default function DetailJourPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 text-center text-sm text-muted-foreground">
          Chargement du détail jour…
        </div>
      }
    >
      <DetailJourContent />
    </Suspense>
  );
}
