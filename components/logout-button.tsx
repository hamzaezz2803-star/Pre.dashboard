"use client";

import { LogOut } from "lucide-react";
import { logout } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";

export function LogoutButton() {
  return (
    <form action={logout}>
      <Button type="submit" variant="outline">
        <LogOut className="size-4" aria-hidden="true" />
        <span className="hidden sm:inline">Se déconnecter</span>
        <span className="sr-only sm:hidden">Se déconnecter</span>
      </Button>
    </form>
  );
}
