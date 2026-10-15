"use client";

import { AlertCircle, Eye, EyeOff, Loader2, LogIn } from "lucide-react";
import { useActionState, useState } from "react";
import { login, type LoginState } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { fieldClass } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const initial: LoginState = { error: null };

export function LoginForm() {
  const [state, action, pending] = useActionState(login, initial);
  const [show, setShow] = useState(false);

  return (
    <form action={action} className="space-y-5" noValidate>
      <div className="space-y-1.5">
        <label htmlFor="username" className="text-sm font-medium">
          Identifiant
        </label>
        <input
          id="username"
          name="username"
          type="text"
          autoComplete="username"
          required
          autoFocus
          aria-invalid={!!state.error}
          aria-describedby={state.error ? "login-error" : undefined}
          className={cn(fieldClass, "h-10")}
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="password" className="text-sm font-medium">
          Mot de passe
        </label>
        <div className="relative">
          <input
            id="password"
            name="password"
            type={show ? "text" : "password"}
            autoComplete="current-password"
            required
            aria-invalid={!!state.error}
            aria-describedby={state.error ? "login-error" : undefined}
            className={cn(fieldClass, "h-10 pr-10")}
          />
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            aria-label={show ? "Masquer le mot de passe" : "Afficher le mot de passe"}
            aria-pressed={show}
            className="absolute right-1.5 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            {show ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}
          </button>
        </div>
      </div>

      {state.error && (
        <p
          id="login-error"
          role="alert"
          className="flex items-center gap-2 rounded-md border border-border bg-danger-soft px-3 py-2 text-sm text-danger"
        >
          <AlertCircle className="size-4 shrink-0" aria-hidden="true" />
          {state.error}
        </p>
      )}

      <Button type="submit" disabled={pending} className="h-10 w-full">
        {pending ? (
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        ) : (
          <LogIn className="size-4" aria-hidden="true" />
        )}
        {pending ? "Connexion en cours" : "Se connecter"}
      </Button>
    </form>
  );
}
