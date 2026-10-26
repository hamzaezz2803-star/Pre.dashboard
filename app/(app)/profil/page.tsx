import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { lireSession } from "@/lib/auth";
import { ProfilePageContent } from "@/components/profile-page";

export const metadata: Metadata = {
  title: "Mon Profil | Suivi des pointages OCP",
  description: "Consultation et modification des informations du profil utilisateur.",
};

export default async function ProfilPage() {
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
