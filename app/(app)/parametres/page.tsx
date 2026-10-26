import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { lireSession } from "@/lib/auth";
import { SettingsPageContent } from "@/components/settings-page";

export const metadata: Metadata = {
  title: "Paramètres | Suivi des pointages OCP",
  description: "Paramètres et préférences du portail de suivi des pointages.",
};

export default async function ParametresPage() {
  const session = await lireSession();

  if (!session) {
    redirect("/login");
  }

  return (
    <SettingsPageContent
      currentUser={{
        id: session.id,
        username: session.username,
        full_name: session.full_name,
        role: session.role,
      }}
    />
  );
}
