"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export function LogoutButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleLogout() {
    if (loading) return;
    setLoading(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // Ignorer l'erreur réseau éventuelle lors du logout
    } finally {
      router.push("/login");
      router.refresh();
      setLoading(false);
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      onClick={handleLogout}
      disabled={loading}
      aria-label="Se déconnecter"
    >
      <LogOut className="size-4" aria-hidden="true" />
      <span className="hidden sm:inline">
        {loading ? "Déconnexion…" : "Se déconnecter"}
      </span>
      <span className="sr-only sm:hidden">Se déconnecter</span>
    </Button>
  );
}
