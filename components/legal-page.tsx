import { TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";

export function LegalPage({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
      <div
        role="note"
        className="mb-6 flex items-start gap-3 rounded-md border border-border bg-warning-soft px-4 py-3 text-sm text-warning"
      >
        <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <p>Document provisoire, à valider par le service juridique</p>
      </div>
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">{title}</h1>
      <div className="space-y-6 text-sm leading-relaxed">{children}</div>
    </main>
  );
}

export function LegalSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section>
      <h2 className="mb-2 text-base font-semibold">{title}</h2>
      <div className="space-y-2 text-muted-foreground">{children}</div>
    </section>
  );
}
