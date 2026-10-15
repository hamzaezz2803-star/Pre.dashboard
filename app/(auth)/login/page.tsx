import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { CalendarX, Clock, FileDown, MapPin } from "lucide-react";
import { LoginForm } from "@/components/login-form";
import { ThemeToggle } from "@/components/theme-toggle";

export const metadata: Metadata = {
  title: "Connexion | Suivi des pointages",
  description: "Connectez-vous pour consulter les pointages, temps de présence et absences du personnel.",
};

const features = [
  { Icon: Clock, text: "Temps de présence calculé à partir des pointages d'entrée et de sortie" },
  { Icon: MapPin, text: "Zones fréquentées et nombre de pointages par personne" },
  { Icon: CalendarX, text: "Jours d'absence détectés sur les jours ouvrés" },
  { Icon: FileDown, text: "Export de la période filtrée en Excel ou en PDF" },
];

export default function LoginPage() {
  return (
    <div className="grid min-h-screen lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-[#0b4a37] p-12 text-white lg:flex">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-32 -top-32 size-96 rounded-full border border-white/10"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-40 -left-24 size-[28rem] rounded-full border border-white/10"
        />
        <div className="relative flex items-center gap-4">
          <span className="flex size-16 items-center justify-center rounded-lg bg-white p-2">
            <Image src="/assets/ocpLogo.webp" alt="Logo OCP" width={467} height={428} priority className="h-full w-auto" />
          </span>
          <span className="text-lg font-semibold tracking-tight">Suivi des pointages</span>
        </div>

        <div className="relative max-w-lg">
          <h2 className="text-3xl font-semibold leading-tight tracking-tight">
            Consultez les pointages, la présence et les absences de votre personnel
          </h2>
          <p className="mt-3 text-white/75">
            Filtrez par département, par personne et par période, puis exportez les résultats.
          </p>
          <ul className="mt-8 space-y-4">
            {features.map(({ Icon, text }) => (
              <li key={text} className="flex items-start gap-3 text-sm text-white/90">
                <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-white/10">
                  <Icon className="size-4" aria-hidden="true" />
                </span>
                {text}
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-white/60">Accès réservé au personnel autorisé</p>
      </aside>

      <main className="relative flex flex-col items-center justify-center px-6 py-12">
        <div className="absolute right-4 top-4">
          <ThemeToggle />
        </div>

        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <Image src="/assets/ocpLogo.webp" alt="Logo OCP" width={467} height={428} priority className="h-12 w-auto" />
            <span className="font-semibold">Suivi des pointages</span>
          </div>

          <h1 className="text-2xl font-semibold tracking-tight">Connexion</h1>
          <p className="mb-8 mt-1 text-sm text-muted-foreground">
            Saisissez vos identifiants pour accéder au tableau de bord.
          </p>

          <LoginForm />

          <nav aria-label="Liens légaux" className="mt-10 flex gap-4 text-xs text-muted-foreground">
            <Link href="/conditions" className="underline-offset-4 hover:text-foreground hover:underline">
              Conditions d&apos;utilisation
            </Link>
            <Link href="/confidentialite" className="underline-offset-4 hover:text-foreground hover:underline">
              Politique de confidentialité
            </Link>
          </nav>
        </div>
      </main>
    </div>
  );
}
