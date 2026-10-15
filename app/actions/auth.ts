"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, STATIC_PASSWORD, STATIC_USERNAME } from "@/lib/auth";

export interface LoginState {
  error: string | null;
}

/**
 * Connexion statique de démonstration (admin / admin123).
 * À remplacer par une vraie authentification avant toute mise en production.
 */
export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  await new Promise((r) => setTimeout(r, 400));

  if (username !== STATIC_USERNAME || password !== STATIC_PASSWORD) {
    return { error: "Identifiant ou mot de passe incorrect." };
  }

  const store = await cookies();
  store.set(SESSION_COOKIE, "1", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 8,
  });
  redirect("/");
}

export async function logout(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  redirect("/login");
}
