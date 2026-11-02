"use client";

import {
  AlertCircle,
  AlertTriangle,
  Calculator,
  Check,
  CheckCircle2,
  Edit2,
  Eye,
  FlaskConical,
  History,
  Loader2,
  Plus,
  Power,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, fieldClass } from "@/components/ui/card";
import { FONCTIONS_FORMULE } from "@/lib/compteurs/formule";
import { VARIABLES_COMPTEURS, type Periodicite } from "@/lib/compteurs/variables";
import { UNITES, validerFormule } from "@/lib/compteurs/validation";
import { cn } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────────────────────

interface VersionFormule {
  version_formule: number;
  formule: string;
  unite: string;
  journalier: boolean;
  hebdomadaire: boolean;
  mensuel: boolean;
  modifie_le: string;
  modifie_par: string | null;
}

interface Compteur {
  id_compteur: string;
  libelle: string;
  formule: string;
  journalier: boolean;
  hebdomadaire: boolean;
  mensuel: boolean;
  unite: string;
  description: string | null;
  actif: boolean;
  version_formule: number;
  created_at: string;
  updated_at: string;
  versions?: VersionFormule[];
}

interface ErreurChamp {
  champ: string | null;
  message: string;
  periodicite?: string;
}

interface Formulaire {
  id_compteur: string;
  libelle: string;
  description: string;
  formule: string;
  journalier: boolean;
  hebdomadaire: boolean;
  mensuel: boolean;
  unite: string;
}

type Verification = { ok: true; variables: string[] } | { ok: false; erreurs: ErreurChamp[] };

type ResultatTest =
  | { ok: true; valeur: number }
  | { ok: false; code: string; message: string };

const FORMULAIRE_VIDE: Formulaire = {
  id_compteur: "",
  libelle: "",
  description: "",
  formule: "",
  journalier: true,
  hebdomadaire: false,
  mensuel: false,
  unite: "minutes",
};

const PERIODES: { cle: Periodicite; colonne: "journalier" | "hebdomadaire" | "mensuel"; libelle: string; court: string }[] = [
  { cle: "JOUR", colonne: "journalier", libelle: "Journalier", court: "Jour" },
  { cle: "SEMAINE", colonne: "hebdomadaire", libelle: "Hebdomadaire", court: "Semaine" },
  { cle: "MOIS", colonne: "mensuel", libelle: "Mensuel", court: "Mois" },
];

const LIBELLES_UNITES: Record<string, string> = {
  minutes: "Minutes",
  heures: "Heures",
  jours: "Jours",
  nombre: "Nombre",
  pourcentage: "Pourcentage",
};

const periodicitesDe = (c: Pick<Formulaire, "journalier" | "hebdomadaire" | "mensuel">) =>
  PERIODES.filter((p) => c[p.colonne]).map((p) => p.cle);

const formaterDate = (iso: string) =>
  new Date(iso).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });

function formaterValeur(valeur: number, unite: string) {
  const nombre = valeur.toLocaleString("fr-FR", { maximumFractionDigits: 4 });
  const suffixe = unite === "pourcentage" ? " %" : unite === "nombre" ? "" : ` ${unite}`;
  return `${nombre}${suffixe}`;
}

async function lireReponse(res: Response) {
  try {
    return await res.json();
  } catch {
    return {};
  }
}

// ─── Composant principal ─────────────────────────────────────────────────────

export function CompteursGestion({ role }: { role: string }) {
  const peutGerer = role === "super_admin";

  const [compteurs, setCompteurs] = useState<Compteur[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);

  const [recherche, setRecherche] = useState("");
  const rechercheDifferee = useDeferredValue(recherche);
  const [filtrePeriode, setFiltrePeriode] = useState("");
  const [filtreStatut, setFiltreStatut] = useState("tous");

  const [editeur, setEditeur] = useState<{ mode: "creation" | "edition" | "lecture"; compteur?: Compteur } | null>(null);
  const [aBasculer, setABasculer] = useState<Compteur | null>(null);
  const [bascule, setBascule] = useState(false);

  const charger = useCallback(async () => {
    setChargement(true);
    try {
      const params = new URLSearchParams({ statut: filtreStatut });
      if (rechercheDifferee.trim()) params.set("recherche", rechercheDifferee.trim());
      if (filtrePeriode) params.set("periodicite", filtrePeriode);
      const res = await fetch(`/api/compteurs?${params}`, { cache: "no-store" });
      const data = await lireReponse(res);
      if (!res.ok) {
        setErreur(data.error || "Impossible de charger les compteurs.");
        setCompteurs([]);
        return;
      }
      setErreur(null);
      setCompteurs(data.compteurs || []);
    } catch {
      setErreur("Erreur réseau : impossible de charger les compteurs.");
    } finally {
      setChargement(false);
    }
  }, [rechercheDifferee, filtrePeriode, filtreStatut]);

  useEffect(() => {
    const t = setTimeout(charger, 250);
    return () => clearTimeout(t);
  }, [charger]);

  useEffect(() => {
    if (!succes) return;
    const t = setTimeout(() => setSucces(null), 4000);
    return () => clearTimeout(t);
  }, [succes]);

  async function ouvrir(mode: "edition" | "lecture", c: Compteur) {
    try {
      const res = await fetch(`/api/compteurs/${encodeURIComponent(c.id_compteur)}`, { cache: "no-store" });
      const data = await lireReponse(res);
      if (!res.ok) {
        setErreur(data.error || "Impossible d'ouvrir ce compteur.");
        return;
      }
      setEditeur({ mode, compteur: data.compteur });
    } catch {
      setErreur("Erreur réseau : impossible d'ouvrir ce compteur.");
    }
  }

  async function confirmerBascule() {
    if (!aBasculer) return;
    setBascule(true);
    try {
      const res = await fetch(`/api/compteurs/${encodeURIComponent(aBasculer.id_compteur)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actif: !aBasculer.actif }),
      });
      const data = await lireReponse(res);
      if (!res.ok) {
        setErreur(data.error || "Modification impossible.");
      } else {
        setSucces(`Compteur ${aBasculer.id_compteur} ${aBasculer.actif ? "désactivé" : "activé"}.`);
        await charger();
      }
    } catch {
      setErreur("Erreur réseau : modification impossible.");
    } finally {
      setBascule(false);
      setABasculer(null);
    }
  }

  const migrationAbsente = erreur?.includes("migration-compteurs.sql");

  return (
    <main className="mx-auto w-full max-w-7xl space-y-6 px-4 py-6 sm:px-6">
      {/* En-tête */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Gestion des compteurs</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Compteurs calculés à partir des pointages et des horaires affectés, avec vos propres formules.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={charger} disabled={chargement} aria-label="Rafraîchir la liste">
            <RefreshCw className={cn("size-4", chargement && "animate-spin")} aria-hidden="true" />
            <span className="hidden sm:inline">Actualiser</span>
          </Button>
          {peutGerer && (
            <Button onClick={() => setEditeur({ mode: "creation" })} disabled={migrationAbsente} className="whitespace-nowrap">
              <Plus className="size-4" aria-hidden="true" />
              <span>Nouveau compteur</span>
            </Button>
          )}
        </div>
      </div>

      {succes && (
        <div
          role="status"
          className="flex items-center gap-2 rounded-md border border-emerald-500/20 bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-400"
        >
          <Check className="size-4 shrink-0" aria-hidden="true" />
          <span>{succes}</span>
        </div>
      )}

      {erreur && (
        <div
          role="alert"
          className={cn(
            "flex items-start gap-2 rounded-md border p-3 text-sm",
            migrationAbsente
              ? "border-warning/30 bg-warning-soft text-warning"
              : "border-danger/20 bg-danger/10 text-danger"
          )}
        >
          {migrationAbsente ? (
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          ) : (
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          )}
          <span>{erreur}</span>
        </div>
      )}

      {/* Filtres */}
      <div className="grid gap-3 sm:grid-cols-[1fr_180px_160px]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <input
            type="search"
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            placeholder="Rechercher par identifiant ou libellé…"
            aria-label="Rechercher un compteur"
            maxLength={100}
            className={cn(fieldClass, "pl-9")}
          />
        </div>
        <select
          value={filtrePeriode}
          onChange={(e) => setFiltrePeriode(e.target.value)}
          aria-label="Filtrer par périodicité"
          className={fieldClass}
        >
          <option value="">Toutes périodicités</option>
          {PERIODES.map((p) => (
            <option key={p.cle} value={p.cle}>
              {p.libelle}
            </option>
          ))}
        </select>
        <select
          value={filtreStatut}
          onChange={(e) => setFiltreStatut(e.target.value)}
          aria-label="Filtrer par statut"
          className={fieldClass}
        >
          <option value="tous">Tous les statuts</option>
          <option value="actif">Actifs</option>
          <option value="inactif">Inactifs</option>
        </select>
      </div>

      {/* Liste */}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] border-collapse text-left text-sm">
            <thead className="bg-muted text-xs text-muted-foreground border-b border-border">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">Identifiant</th>
                <th scope="col" className="px-4 py-3 font-medium">Libellé</th>
                <th scope="col" className="px-4 py-3 font-medium">Formule</th>
                <th scope="col" className="px-4 py-3 font-medium">Périodicités</th>
                <th scope="col" className="px-4 py-3 font-medium">Unité</th>
                <th scope="col" className="px-4 py-3 font-medium">Statut</th>
                <th scope="col" className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {chargement && compteurs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                    <Loader2 className="mx-auto mb-2 size-5 animate-spin text-primary" aria-hidden="true" />
                    Chargement des compteurs…
                  </td>
                </tr>
              ) : compteurs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                    <Calculator className="mx-auto mb-2 size-6 opacity-60" aria-hidden="true" />
                    {erreur
                      ? "Liste indisponible."
                      : recherche || filtrePeriode || filtreStatut !== "tous"
                      ? "Aucun compteur ne correspond aux filtres."
                      : peutGerer
                        ? "Aucun compteur. Créez le premier avec « Nouveau compteur »."
                        : "Aucun compteur n'a encore été configuré."}
                  </td>
                </tr>
              ) : (
                compteurs.map((c) => (
                  <tr key={c.id_compteur} className={cn("transition-colors hover:bg-muted/40", !c.actif && "opacity-60")}>
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs font-medium">{c.id_compteur}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium">{c.libelle}</div>
                      {c.description && (
                        <div className="mt-0.5 line-clamp-1 max-w-xs text-xs text-muted-foreground">{c.description}</div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <code className="block max-w-[280px] truncate rounded bg-muted px-2 py-1 font-mono text-xs" title={c.formule}>
                        {c.formule}
                      </code>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {PERIODES.filter((p) => c[p.colonne]).map((p) => (
                          <span key={p.cle} className="rounded bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary">
                            {p.court}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{LIBELLES_UNITES[c.unite] ?? c.unite}</td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
                          c.actif
                            ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                            : "bg-muted text-muted-foreground"
                        )}
                      >
                        <span className={cn("size-1.5 rounded-full", c.actif ? "bg-emerald-500" : "bg-muted-foreground")} />
                        {c.actif ? "Actif" : "Inactif"}
                      </span>
                      <div className="mt-1 text-[11px] text-muted-foreground">v{c.version_formule}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => ouvrir("lecture", c)}
                          className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                          title="Consulter"
                          aria-label={`Consulter ${c.libelle}`}
                        >
                          <Eye className="size-4" />
                        </button>
                        {peutGerer && (
                          <>
                            <button
                              type="button"
                              onClick={() => ouvrir("edition", c)}
                              className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                              title="Modifier"
                              aria-label={`Modifier ${c.libelle}`}
                            >
                              <Edit2 className="size-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setABasculer(c)}
                              className={cn(
                                "rounded-md p-1.5 hover:bg-muted",
                                c.actif ? "text-danger" : "text-emerald-600 dark:text-emerald-400"
                              )}
                              title={c.actif ? "Désactiver" : "Activer"}
                              aria-label={`${c.actif ? "Désactiver" : "Activer"} ${c.libelle}`}
                            >
                              <Power className="size-4" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {editeur && (
        <EditeurCompteur
          mode={editeur.mode}
          compteur={editeur.compteur}
          peutGerer={peutGerer}
          onFermer={() => setEditeur(null)}
          onModifier={() => editeur.compteur && setEditeur({ mode: "edition", compteur: editeur.compteur })}
          onEnregistre={(message) => {
            setEditeur(null);
            setSucces(message);
            charger();
          }}
        />
      )}

      {aBasculer && (
        <Dialogue onFermer={() => !bascule && setABasculer(null)} titre={aBasculer.actif ? "Désactiver le compteur" : "Activer le compteur"} largeur="max-w-md">
          <p className="text-sm text-muted-foreground">
            {aBasculer.actif ? (
              <>
                <strong className="text-foreground">{aBasculer.libelle}</strong> ne sera plus calculé. Les valeurs
                déjà enregistrées restent consultables dans l&apos;historique.
              </>
            ) : (
              <>
                <strong className="text-foreground">{aBasculer.libelle}</strong> sera de nouveau calculé pour les
                prochaines périodes.
              </>
            )}
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setABasculer(null)} disabled={bascule}>
              Annuler
            </Button>
            <Button
              onClick={confirmerBascule}
              disabled={bascule}
              className={aBasculer.actif ? "bg-danger text-white hover:bg-danger/90" : undefined}
            >
              {bascule && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
              {aBasculer.actif ? "Désactiver" : "Activer"}
            </Button>
          </div>
        </Dialogue>
      )}
    </main>
  );
}

// ─── Fenêtre modale ──────────────────────────────────────────────────────────

function Dialogue({
  titre,
  icone,
  largeur = "max-w-lg",
  onFermer,
  children,
}: {
  titre: string;
  icone?: React.ReactNode;
  largeur?: string;
  onFermer: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const surTouche = (e: KeyboardEvent) => e.key === "Escape" && onFermer();
    window.addEventListener("keydown", surTouche);
    return () => window.removeEventListener("keydown", surTouche);
  }, [onFermer]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={titre}
        className={cn("w-full max-h-[92vh] space-y-4 overflow-y-auto rounded-lg border border-border bg-surface p-5 shadow-xl sm:p-6", largeur)}
      >
        <div className="flex items-center justify-between border-b border-border pb-3">
          <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
            {icone}
            {titre}
          </h2>
          <button type="button" onClick={onFermer} className="text-muted-foreground hover:text-foreground" aria-label="Fermer">
            <X className="size-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ─── Éditeur (création, modification, consultation) ─────────────────────────

function EditeurCompteur({
  mode,
  compteur,
  peutGerer,
  onFermer,
  onModifier,
  onEnregistre,
}: {
  mode: "creation" | "edition" | "lecture";
  compteur?: Compteur;
  peutGerer: boolean;
  onFermer: () => void;
  onModifier: () => void;
  onEnregistre: (message: string) => void;
}) {
  const lecture = mode === "lecture";
  const initial: Formulaire = compteur
    ? {
        id_compteur: compteur.id_compteur,
        libelle: compteur.libelle,
        description: compteur.description ?? "",
        formule: compteur.formule,
        journalier: compteur.journalier,
        hebdomadaire: compteur.hebdomadaire,
        mensuel: compteur.mensuel,
        unite: compteur.unite,
      }
    : FORMULAIRE_VIDE;

  const [form, setForm] = useState<Formulaire>(initial);
  const [erreurs, setErreurs] = useState<ErreurChamp[]>([]);
  const [erreurGlobale, setErreurGlobale] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const zoneFormule = useRef<HTMLTextAreaElement>(null);

  const periodicites = periodicitesDe(form);
  const formuleDifferee = useDeferredValue(form.formule);

  // Vérification instantanée avec le même moteur que le serveur (le serveur revalide à l'enregistrement)
  const clePeriodes = periodicites.join(",");
  const verification = useMemo((): Verification | null => {
    if (!formuleDifferee.trim() || !clePeriodes) return null;
    return validerFormule(formuleDifferee, clePeriodes.split(","));
  }, [formuleDifferee, clePeriodes]);

  const erreurDe = (champ: string) => erreurs.find((e) => e.champ === champ)?.message;

  const versionnee =
    mode === "edition" &&
    compteur &&
    (form.formule.trim() !== compteur.formule ||
      form.unite !== compteur.unite ||
      PERIODES.some((p) => form[p.colonne] !== compteur[p.colonne]));

  function maj<K extends keyof Formulaire>(champ: K, valeur: Formulaire[K]) {
    const periodique = PERIODES.some((p) => p.colonne === champ);
    setForm((f) => ({ ...f, [champ]: valeur }));
    setErreurs((e) => e.filter((x) => x.champ !== champ && !(periodique && x.champ === "periodicites")));
  }

  function inserer(texte: string) {
    const zone = zoneFormule.current;
    if (!zone || lecture) return;
    const debut = zone.selectionStart ?? form.formule.length;
    const fin = zone.selectionEnd ?? debut;
    const avant = form.formule.slice(0, debut);
    const espace = avant && !/[\s(,]$/.test(avant) ? " " : "";
    const nouveau = `${avant}${espace}${texte}${form.formule.slice(fin)}`;
    maj("formule", nouveau);
    requestAnimationFrame(() => {
      zone.focus();
      const curseur = debut + espace.length + texte.length;
      zone.setSelectionRange(curseur, curseur);
    });
  }

  async function enregistrer(e: React.FormEvent) {
    e.preventDefault();
    if (lecture) return;
    setEnvoi(true);
    setErreurGlobale(null);
    setErreurs([]);

    const corps = {
      libelle: form.libelle,
      description: form.description.trim() ? form.description : null,
      formule: form.formule,
      journalier: form.journalier,
      hebdomadaire: form.hebdomadaire,
      mensuel: form.mensuel,
      unite: form.unite,
      ...(mode === "creation" ? { id_compteur: form.id_compteur } : {}),
    };

    try {
      const url = mode === "creation" ? "/api/compteurs" : `/api/compteurs/${encodeURIComponent(form.id_compteur)}`;
      const res = await fetch(url, {
        method: mode === "creation" ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corps),
      });
      const data = await lireReponse(res);
      if (!res.ok) {
        setErreurs(data.erreurs || []);
        setErreurGlobale(data.error || "Enregistrement impossible.");
        return;
      }
      if (mode === "creation") {
        onEnregistre(`Compteur ${data.compteur.id_compteur} créé.`);
      } else {
        onEnregistre(
          data.nouvelleVersion
            ? `Compteur ${data.compteur.id_compteur} modifié (formule version ${data.compteur.version_formule}).`
            : `Compteur ${data.compteur.id_compteur} modifié.`
        );
      }
    } catch {
      setErreurGlobale("Erreur réseau : enregistrement impossible.");
    } finally {
      setEnvoi(false);
    }
  }

  const titre =
    mode === "creation" ? "Nouveau compteur" : mode === "edition" ? `Modifier ${compteur?.id_compteur}` : compteur?.libelle ?? "";

  return (
    <Dialogue
      titre={titre}
      icone={<Calculator className="size-5 text-primary" aria-hidden="true" />}
      largeur="max-w-5xl"
      onFermer={() => !envoi && onFermer()}
    >
      {erreurGlobale && (
        <div role="alert" className="flex items-start gap-2 rounded-md border border-danger/20 bg-danger/10 p-2.5 text-sm text-danger">
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>{erreurGlobale}</span>
        </div>
      )}

      <form onSubmit={enregistrer} className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 space-y-4">
          <div className="grid gap-4 sm:grid-cols-[160px_1fr]">
            <Champ id="cpt-id" libelle="Identifiant" requis erreur={erreurDe("id_compteur")} aide={mode === "creation" ? "Ex. CPT001 — non modifiable ensuite" : undefined}>
              <input
                id="cpt-id"
                value={form.id_compteur}
                onChange={(e) => maj("id_compteur", e.target.value.toUpperCase())}
                disabled={mode !== "creation"}
                required
                maxLength={30}
                pattern="[A-Za-z0-9][A-Za-z0-9_\-]{0,29}"
                placeholder="CPT001"
                autoFocus={mode === "creation"}
                className={cn(fieldClass, "font-mono uppercase disabled:opacity-70")}
              />
            </Champ>
            <Champ id="cpt-libelle" libelle="Libellé" requis erreur={erreurDe("libelle")}>
              <input
                id="cpt-libelle"
                value={form.libelle}
                onChange={(e) => maj("libelle", e.target.value)}
                disabled={lecture}
                required
                maxLength={100}
                placeholder="Débit / Crédit"
                autoFocus={mode === "edition"}
                className={cn(fieldClass, "disabled:opacity-70")}
              />
            </Champ>
          </div>

          <Champ id="cpt-description" libelle="Description" erreur={erreurDe("description")}>
            <input
              id="cpt-description"
              value={form.description}
              onChange={(e) => maj("description", e.target.value)}
              disabled={lecture}
              maxLength={500}
              placeholder="À quoi sert ce compteur (facultatif)"
              className={cn(fieldClass, "disabled:opacity-70")}
            />
          </Champ>

          <div className="grid gap-4 sm:grid-cols-[1fr_180px]">
            <fieldset className="space-y-1.5">
              <legend className="text-xs font-medium">
                Périodicités <span className="text-danger">*</span>
              </legend>
              <div className="flex flex-wrap gap-2">
                {PERIODES.map((p) => (
                  <label
                    key={p.cle}
                    className={cn(
                      "flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-sm transition-colors",
                      form[p.colonne] ? "border-primary/40 bg-primary/5 text-foreground" : "border-border text-muted-foreground",
                      lecture && "cursor-default"
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={form[p.colonne]}
                      onChange={(e) => maj(p.colonne, e.target.checked)}
                      disabled={lecture}
                      className="accent-primary"
                    />
                    {p.libelle}
                  </label>
                ))}
              </div>
              {(erreurDe("periodicites") || (!lecture && periodicites.length === 0)) && (
                <p className="text-xs text-danger">{erreurDe("periodicites") ?? "Choisissez au moins une périodicité."}</p>
              )}
            </fieldset>
            <Champ id="cpt-unite" libelle="Unité" requis erreur={erreurDe("unite")}>
              <select
                id="cpt-unite"
                value={form.unite}
                onChange={(e) => maj("unite", e.target.value)}
                disabled={lecture}
                className={cn(fieldClass, "disabled:opacity-70")}
              >
                {UNITES.map((u) => (
                  <option key={u} value={u}>
                    {LIBELLES_UNITES[u] ?? u}
                  </option>
                ))}
              </select>
            </Champ>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="cpt-formule" className="text-xs font-medium">
              Formule <span className="text-danger">*</span>
            </label>
            <textarea
              id="cpt-formule"
              ref={zoneFormule}
              value={form.formule}
              onChange={(e) => maj("formule", e.target.value)}
              readOnly={lecture}
              required
              rows={4}
              maxLength={2000}
              spellCheck={false}
              placeholder="Ex. MAX(0, DUREE_TRAVAILLEE_MIN - DUREE_PREVUE_MIN)"
              aria-invalid={verification ? !verification.ok : undefined}
              aria-describedby="cpt-formule-etat"
              className={cn(
                "w-full rounded-md border bg-surface px-3 py-2 font-mono text-sm leading-relaxed text-foreground placeholder:text-muted-foreground",
                verification && !verification.ok ? "border-danger/60" : "border-border"
              )}
            />
            <EtatFormule id="cpt-formule-etat" verification={verification} erreurServeur={erreurDe("formule")} />
          </div>

          {versionnee && (
            <div className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning-soft p-2.5 text-xs text-warning">
              <History className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span>
                Une nouvelle version de la formule (v{(compteur?.version_formule ?? 0) + 1}) sera enregistrée. Les valeurs
                déjà calculées ne sont pas recalculées automatiquement.
              </span>
            </div>
          )}

          {peutGerer && verification?.ok && (
            <TestFormule formule={form.formule} periodicites={periodicites} variables={verification.variables} unite={form.unite} />
          )}

          {lecture && compteur?.versions && compteur.versions.length > 0 && <Versions versions={compteur.versions} />}

          <div className="flex justify-end gap-2 border-t border-border pt-4">
            {lecture ? (
              <>
                <Button variant="outline" onClick={onFermer}>
                  Fermer
                </Button>
                {peutGerer && (
                  <Button onClick={onModifier}>
                    <Edit2 className="size-4" aria-hidden="true" />
                    Modifier
                  </Button>
                )}
              </>
            ) : (
              <>
                <Button variant="outline" onClick={onFermer} disabled={envoi}>
                  Annuler
                </Button>
                <Button type="submit" disabled={envoi || periodicites.length === 0 || (verification !== null && !verification.ok)}>
                  {envoi && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
                  {mode === "creation" ? "Créer le compteur" : "Enregistrer"}
                </Button>
              </>
            )}
          </div>
        </div>

        <AideFormule periodicites={periodicites} onInserer={lecture ? undefined : inserer} />
      </form>
    </Dialogue>
  );
}

function Champ({
  id,
  libelle,
  requis,
  erreur,
  aide,
  children,
}: {
  id: string;
  libelle: string;
  requis?: boolean;
  erreur?: string;
  aide?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="text-xs font-medium">
        {libelle} {requis && <span className="text-danger">*</span>}
      </label>
      {children}
      {erreur ? <p className="text-xs text-danger">{erreur}</p> : aide ? <p className="text-[11px] text-muted-foreground">{aide}</p> : null}
    </div>
  );
}

function EtatFormule({
  id,
  verification,
  erreurServeur,
}: {
  id: string;
  verification: Verification | null;
  erreurServeur?: string;
}) {
  if (!verification) {
    return (
      <p id={id} className="text-[11px] text-muted-foreground">
        Écrivez librement votre formule. Cliquez sur une variable ou une fonction à droite pour l&apos;insérer.
      </p>
    );
  }
  if (verification.ok) {
    return (
      <p id={id} role="status" className="flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-400">
        <CheckCircle2 className="size-3.5 shrink-0" aria-hidden="true" />
        Formule valide
        {verification.variables.length > 0 && (
          <span className="text-muted-foreground">— utilise {verification.variables.join(", ")}</span>
        )}
      </p>
    );
  }
  return (
    <ul id={id} role="alert" className="space-y-0.5 text-xs text-danger">
      {verification.erreurs.map((e, i) => (
        <li key={i} className="flex items-start gap-1.5">
          <AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          <span>
            {e.periodicite && <strong>{PERIODES.find((p) => p.cle === e.periodicite)?.libelle} : </strong>}
            {e.message}
          </span>
        </li>
      ))}
      {erreurServeur && <li>{erreurServeur}</li>}
    </ul>
  );
}

// ─── Test de la formule ──────────────────────────────────────────────────────

function TestFormule({
  formule,
  periodicites,
  variables,
  unite,
}: {
  formule: string;
  periodicites: Periodicite[];
  variables: string[];
  unite: string;
}) {
  const [periode, setPeriode] = useState<Periodicite>(periodicites[0]);
  const [valeurs, setValeurs] = useState<Record<string, string>>({});
  const [test, setTest] = useState<{ cle: string; resultat: ResultatTest } | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  const periodeActive = periodicites.includes(periode) ? periode : periodicites[0];
  // Un résultat n'est affiché que pour la formule et la périodicité qui l'ont produit
  const cle = `${periodeActive}|${formule}`;
  const resultat = test?.cle === cle ? test.resultat : null;

  async function tester() {
    setEnvoi(true);
    setErreur(null);
    try {
      const corps: Record<string, number | null> = {};
      for (const v of variables) {
        const brut = (valeurs[v] ?? "").trim().replace(",", ".");
        corps[v] = brut === "" ? null : Number(brut);
        if (corps[v] !== null && !Number.isFinite(corps[v])) {
          setErreur(`Valeur invalide pour ${v}.`);
          return;
        }
      }
      const res = await fetch("/api/compteurs/tester-formule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ formule, periodicite: periodeActive, valeurs: corps }),
      });
      const data = await lireReponse(res);
      if (!res.ok) {
        setErreur(data.error || "Test impossible.");
        return;
      }
      setTest({ cle, resultat: data.resultat });
    } catch {
      setErreur("Erreur réseau : test impossible.");
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <section className="space-y-3 rounded-md border border-border bg-muted/30 p-3" aria-label="Tester la formule">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold">
          <FlaskConical className="size-4 text-primary" aria-hidden="true" />
          Tester avec des valeurs d&apos;exemple
        </h3>
        {periodicites.length > 1 && (
          <select
            value={periodeActive}
            onChange={(e) => setPeriode(e.target.value as Periodicite)}
            aria-label="Périodicité du test"
            className={cn(fieldClass, "h-8 w-auto text-xs")}
          >
            {PERIODES.filter((p) => periodicites.includes(p.cle)).map((p) => (
              <option key={p.cle} value={p.cle}>
                {p.libelle}
              </option>
            ))}
          </select>
        )}
      </div>

      {variables.length > 0 ? (
        <div className="grid gap-2 sm:grid-cols-2">
          {variables.map((v) => (
            <label key={v} className="flex items-center gap-2 text-xs">
              <span className="w-44 shrink-0 truncate font-mono" title={v}>
                {v}
              </span>
              <input
                inputMode="decimal"
                value={valeurs[v] ?? ""}
                onChange={(e) => setValeurs((x) => ({ ...x, [v]: e.target.value }))}
                placeholder="vide = manquante"
                className={cn(fieldClass, "h-8 text-xs")}
              />
            </label>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">La formule n&apos;utilise aucune variable.</p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" onClick={tester} disabled={envoi} className="h-8 text-xs">
          {envoi ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : <FlaskConical className="size-3.5" aria-hidden="true" />}
          Calculer
        </Button>
        <div role="status" className="min-w-0 text-sm">
          {erreur && <span className="text-danger">{erreur}</span>}
          {resultat?.ok && (
            <span>
              Résultat : <strong className="font-mono">{formaterValeur(resultat.valeur, unite)}</strong>
            </span>
          )}
          {resultat && !resultat.ok && (
            <span className="text-warning">
              {resultat.code === "DONNEE_MANQUANTE" ? "Non calculable — " : "Erreur — "}
              {resultat.message}
            </span>
          )}
        </div>
      </div>
    </section>
  );
}

// ─── Historique des versions ─────────────────────────────────────────────────

function Versions({ versions }: { versions: VersionFormule[] }) {
  return (
    <section className="space-y-2" aria-label="Historique des formules">
      <h3 className="flex items-center gap-1.5 text-sm font-semibold">
        <History className="size-4 text-primary" aria-hidden="true" />
        Historique des formules
      </h3>
      <ol className="space-y-2">
        {versions.map((v) => (
          <li key={v.version_formule} className="rounded-md border border-border p-2.5 text-xs">
            <div className="mb-1 flex flex-wrap items-center gap-x-2 text-muted-foreground">
              <span className="font-semibold text-foreground">v{v.version_formule}</span>
              <span>{formaterDate(v.modifie_le)}</span>
              {v.modifie_par && <span>par {v.modifie_par}</span>}
              <span>· {periodicitesDe(v).map((p) => PERIODES.find((x) => x.cle === p)?.court).join(", ")}</span>
              <span>· {LIBELLES_UNITES[v.unite] ?? v.unite}</span>
            </div>
            <code className="block whitespace-pre-wrap break-all font-mono">{v.formule}</code>
          </li>
        ))}
      </ol>
    </section>
  );
}

// ─── Aide : variables et fonctions ───────────────────────────────────────────

function AideFormule({ periodicites, onInserer }: { periodicites: Periodicite[]; onInserer?: (texte: string) => void }) {
  const [filtre, setFiltre] = useState("");
  const f = filtre.trim().toLowerCase();

  const variables = VARIABLES_COMPTEURS.filter(
    (v) =>
      (periodicites.length === 0 || periodicites.every((p) => v.periodicites.includes(p))) &&
      (!f || v.nom.toLowerCase().includes(f) || v.libelle.toLowerCase().includes(f))
  );
  const fonctions = Object.entries(FONCTIONS_FORMULE).filter(([nom, d]) => !f || nom.toLowerCase().includes(f) || d.description.toLowerCase().includes(f));

  const Element = onInserer ? "button" : "div";

  return (
    <aside className="min-w-0 space-y-3 lg:max-h-[70vh] lg:overflow-y-auto lg:border-l lg:border-border lg:pl-5" aria-label="Aide à la saisie">
      <input
        type="search"
        value={filtre}
        onChange={(e) => setFiltre(e.target.value)}
        placeholder="Chercher une variable ou fonction…"
        aria-label="Chercher dans l'aide"
        className={cn(fieldClass, "h-8 text-xs")}
      />

      <div className="space-y-1.5">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Variables {periodicites.length > 1 && <span className="normal-case tracking-normal">(communes aux périodicités cochées)</span>}
        </h3>
        {variables.length === 0 && <p className="text-xs text-muted-foreground">Aucune variable.</p>}
        {variables.map((v) => (
          <Element
            key={v.nom}
            {...(onInserer ? { type: "button" as const, onClick: () => onInserer(v.nom) } : {})}
            title={`${v.regle}\nSource : ${v.source}`}
            className={cn(
              "block w-full rounded-md border border-transparent px-2 py-1.5 text-left",
              onInserer && "hover:border-border hover:bg-muted"
            )}
          >
            <span className="block font-mono text-xs font-medium text-primary">{v.nom}</span>
            <span className="block text-[11px] text-muted-foreground">
              {v.libelle} · {v.unite}
            </span>
          </Element>
        ))}
      </div>

      <div className="space-y-1.5">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Fonctions</h3>
        {fonctions.map(([nom, d]) => (
          <Element
            key={nom}
            {...(onInserer ? { type: "button" as const, onClick: () => onInserer(`${nom}(`) } : {})}
            title={d.description}
            className={cn(
              "block w-full rounded-md border border-transparent px-2 py-1.5 text-left",
              onInserer && "hover:border-border hover:bg-muted"
            )}
          >
            <span className="block font-mono text-xs font-medium">{d.syntaxe}</span>
            <span className="block text-[11px] text-muted-foreground">{d.description}</span>
          </Element>
        ))}
      </div>

      <div className="space-y-1 rounded-md bg-muted/50 p-2 text-[11px] text-muted-foreground">
        <p>
          <strong className="text-foreground">Opérateurs :</strong> + − * / ( ) &gt; &lt; &gt;= &lt;= = != AND OR NOT
        </p>
        <p>Une donnée manquante n&apos;est jamais remplacée par 0 : utilisez COALESCE(variable, 0) si c&apos;est voulu.</p>
      </div>
    </aside>
  );
}
