import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { UserManagement } from "@/components/user-management";
import { exigerRole } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Gestion des utilisateurs | Suivi des pointages",
  description: "Administration des comptes utilisateurs, attributions des rôles et autorisations.",
};

export const instant = false;

async function AdminUsersContent() {
  const auth = await exigerRole("super_admin");

  if (auth.error) {
    redirect("/");
  }

  return (
    <UserManagement
      currentUser={{
        id: auth.id,
        username: auth.username || "",
        full_name: auth.full_name || null,
        role: auth.role || "super_admin",
      }}
    />
  );
}

export default function AdminUsersPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 text-center text-sm text-muted-foreground">
          Chargement de la gestion des utilisateurs…
        </div>
      }
    >
      <AdminUsersContent />
    </Suspense>
  );
}
