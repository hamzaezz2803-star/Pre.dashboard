import type { Metadata } from "next";
import { LegalPage, LegalSection } from "@/components/legal-page";

export const metadata: Metadata = {
  title: "Conditions d'utilisation | Suivi des pointages",
  description: "Conditions d'utilisation du tableau de bord de suivi des pointages (gabarit provisoire).",
};

export default function ConditionsPage() {
  return (
    <LegalPage title="Conditions d'utilisation">
      <LegalSection title="1. Objet">
        <p>
          Ce service permet de consulter les pointages, les temps de présence et les
          absences du personnel. [À compléter : organisation responsable du service.]
        </p>
      </LegalSection>
      <LegalSection title="2. Accès et usage autorisé">
        <p>[À compléter : personnes autorisées, modalités d&apos;accès, usages interdits.]</p>
      </LegalSection>
      <LegalSection title="3. Exactitude des données">
        <p>[À compléter : origine des données, délais de mise à jour, procédure de contestation.]</p>
      </LegalSection>
      <LegalSection title="4. Responsabilités">
        <p>[À compléter : limites de responsabilité, disponibilité du service.]</p>
      </LegalSection>
      <LegalSection title="5. Droit applicable et contact">
        <p>[À compléter : droit applicable, juridiction compétente, adresse de contact.]</p>
      </LegalSection>
    </LegalPage>
  );
}
