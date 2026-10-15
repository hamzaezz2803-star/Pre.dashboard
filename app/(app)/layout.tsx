import Image from "next/image";
import Link from "next/link";
import { LogoutButton } from "@/components/logout-button";
import { ThemeToggle } from "@/components/theme-toggle";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex h-14 w-full max-w-7xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <Image
              src="/assets/ocpLogo.webp"
              alt="Logo OCP"
              width={467}
              height={428}
              priority
              className="h-9 w-auto"
            />
            Suivi des pointages
          </Link>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <LogoutButton />
          </div>
        </div>
      </header>
      <div className="flex-1">{children}</div>
      <footer className="border-t border-border bg-surface">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-2 px-4 py-4 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>Suivi des pointages du personnel</p>
          <nav aria-label="Liens légaux" className="flex gap-4">
            <Link href="/conditions" className="underline-offset-4 hover:text-foreground hover:underline">
              Conditions d&apos;utilisation
            </Link>
            <Link href="/confidentialite" className="underline-offset-4 hover:text-foreground hover:underline">
              Politique de confidentialité
            </Link>
          </nav>
        </div>
      </footer>
    </>
  );
}
