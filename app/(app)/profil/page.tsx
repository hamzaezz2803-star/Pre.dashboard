import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { lireSession } from "@/lib/auth";
import { ProfilePageContent } from "@/components/profile-page";

export const metadata: Metadata = {
  title: "Mon Profil | Suivi des pointages OCP",
  description: "Consultation et modification des informations du profil utilisateur.",
};

export const instant = false;

async function ProfilContent() {
  const session = await lireSession();

  if (!session) {
    redirect("/login");
  }

  return (
    <ProfilePageContent
      currentUser={{
        id: session.id,
        username: session.username,
        full_name: session.full_name,
        role: session.role,
      }}
    />
  );
}

export default function ProfilPage() {
  return (
    <Suspense
      fallback={
        <div className="p-6 text-sm text-muted-foreground animate-pulse">
          Chargement du profil...
        </div>
      }
    >
      <ProfilContent />
    </Suspense>
  );
}
