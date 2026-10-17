"use server";

import { redirect } from "next/navigation";
import { creerSession, supprimerSession, verifierMotDePasse } from "@/lib/auth";

export interface LoginState {
  error: string | null;
}

/**
 * Action serveur pour la connexion utilisateur.
 * Vérifie les identifiants via bcrypt et crée le cookie de session JWT.
 */
export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!username || !password) {
    return { error: "Identifiants incorrects" };
  }

  const user = await verifierMotDePasse(username, password);

  if (!user) {
    return { error: "Identifiants incorrects" };
  }

  await creerSession(user);
  redirect("/");
}

/**
 * Action serveur pour la déconnexion.
 * Supprime le cookie de session et redirige vers la page de connexion.
 */
export async function logout(): Promise<void> {
  await supprimerSession();
  redirect("/login");
}
