import type { Metadata } from "next";
import { LegalPage, LegalSection } from "@/components/legal-page";

export const metadata: Metadata = {
  title: "Politique de confidentialité | Suivi des pointages",
  description: "Politique de confidentialité du tableau de bord de suivi des pointages (gabarit provisoire).",
};

export default function ConfidentialitePage() {
  return (
    <LegalPage title="Politique de confidentialité">
      <LegalSection title="1. Responsable du traitement">
        <p>[À compléter : identité et coordonnées du responsable du traitement.]</p>
      </LegalSection>
      <LegalSection title="2. Données traitées">
        <p>
          [À compléter : liste exacte des données collectées, par exemple identité,
          horaires de pointage, zones d&apos;accès. À confirmer avec la source réelle.]
        </p>
      </LegalSection>
      <LegalSection title="3. Finalités et base légale">
        <p>[À compléter : finalités du traitement et base légale.]</p>
      </LegalSection>
      <LegalSection title="4. Durée de conservation et destinataires">
        <p>[À compléter : durées de conservation, destinataires, sous-traitants éventuels.]</p>
      </LegalSection>
      <LegalSection title="5. Vos droits">
        <p>[À compléter : droits d&apos;accès, de rectification et d&apos;opposition, et procédure pour les exercer.]</p>
      </LegalSection>
    </LegalPage>
  );
}
