"use client";

import {
  AlertCircle,
  AlertTriangle,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  Clock,
  Loader2,
  Moon,
  RefreshCw,
  Search,
  Sigma,
  User,
  X,
} from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, Skeleton, fieldClass } from "@/components/ui/card";
import { DatePicker } from "@/components/ui/date-picker";
import { cn } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Employe {
  pin: string;
  nom: string | null;
  prenom: string | null;
  departement?: string | null;
}

interface DepartementOption {
  id: string;
  name: string;
  label?: string;
}

interface Horaire {
  id: string;
  nom: string | null;
  heure_debut: string | null;
  heure_fin: string | null;
  debut_prevu: string | null;
  fin_prevue: string | null;
  heure_entree: string | null;
  heure_sortie: string | null;
  est_nuit: boolean;
  statut: string | null;
}

interface Pointage {
  horodatage: string;
  code: string;
  libelle: string;
}

type Periodicite = "JOUR" | "SEMAINE" | "MOIS";

interface ValeurCompteur {
  id_compteur: string;
  libelle: string;
  actif: boolean;
  periodicite: Periodicite;
  periode_debut: string;
  periode_fin: string;
  unite: string;
  valeur: number | null;
  statut: "OK" | "ERREUR" | "A_RECALCULER" | "NON_CALCULE";
  message: string | null;
  perimee: boolean;
}

interface Detail {
  date: string;
  employe: Employe;
  horaire: Horaire | null;
  pointages: Pointage[];
  valeurs: ValeurCompteur[];
}

// ─── Utilitaires ─────────────────────────────────────────────────────────────

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function dateLocale(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function decaler(iso: string, jours: number) {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + jours);
  return dateLocale(d);
}

const formaterJour = (iso: string, options: Intl.DateTimeFormatOptions = { weekday: "long", day: "numeric", month: "long", year: "numeric" }) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString("fr-FR", options);

const nomComplet = (e: Employe) => [e.nom?.toUpperCase(), e.prenom].filter(Boolean).join(" ") || `Employé ${e.pin}`;

function formaterDuree(minutes: number) {
  const abs = Math.abs(minutes);
  const signe = minutes < 0 ? "−" : "";
  if (abs < 60) return `${signe}${abs.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} min`;
  const h = Math.floor(abs / 60);
  const m = Math.round(abs - h * 60);
  return `${signe}${h} h${m ? ` ${String(m).padStart(2, "0")}` : ""}`;
}

function formaterValeur(v: number, unite: string) {
  if (unite === "minutes") return formaterDuree(v);
  const n = v.toLocaleString("fr-FR", { maximumFractionDigits: 2 }).replace("-", "−");
  if (unite === "pourcentage") return `${n} %`;
  if (unite === "heures") return `${n} h`;
  if (unite === "jours") return `${n} j`;
  return n;
}

const PERIODES: { cle: Periodicite; libelle: string }[] = [
  { cle: "JOUR", libelle: "Journaliers" },
  { cle: "SEMAINE", libelle: "Hebdomadaires" },
  { cle: "MOIS", libelle: "Mensuels" },
];

async function lireReponse(res: Response) {
  try {
    return await res.json();
  } catch {
    return {};
  }
}

// ─── Page ────────────────────────────────────────────────────────────────────

export function DetailJour() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const aujourdhui = dateLocale();

  const pin = searchParams.get("pin") || "";
  const dateParam = searchParams.get("date") || "";
  const date = ISO_DATE.test(dateParam) && dateParam <= aujourdhui ? dateParam : aujourdhui;

  // La réponse est rattachée à la clé (employé, date, version) qui l'a demandée :
  // tant que la clé courante diffère de celle reçue, le chargement est en cours.
  const [version, setVersion] = useState(0);
  const cle = `${pin}|${date}|${version}`;
  const [reponse, setReponse] = useState<{ cle: string; detail: Detail | null; erreur: string | null } | null>(null);
  const [erreurAction, setErreurAction] = useState<string | null>(null);
  const [calcul, setCalcul] = useState(false);

  const chargement = Boolean(pin) && reponse?.cle !== cle;
  const erreur = erreurAction ?? (reponse?.cle === cle ? reponse.erreur : null);
  const actualiser = useCallback(() => setVersion((v) => v + 1), []);

  const changer = useCallback(
    (maj: { pin?: string; date?: string }) => {
      const p = new URLSearchParams(searchParams.toString());
      if (maj.pin !== undefined) p.set("pin", maj.pin);
      if (maj.date !== undefined) p.set("date", maj.date);
      router.replace(`${pathname}?${p}`, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  useEffect(() => {
    if (!pin) return;
    let annule = false;
    (async () => {
      let suite: { detail: Detail | null; erreur: string | null };
      try {
        const res = await fetch(`/api/employes/${encodeURIComponent(pin)}/detail-jour?date=${date}`, { cache: "no-store" });
        const data = await lireReponse(res);
        suite = res.ok ? { detail: data, erreur: null } : { detail: null, erreur: data.error || "Impossible de charger le détail." };
      } catch {
        suite = { detail: null, erreur: "Erreur réseau : impossible de charger le détail." };
      }
      // Une sélection plus récente a remplacé celle-ci : réponse ignorée
      if (!annule) setReponse((precedente) => ({ cle, ...suite, detail: suite.detail ?? (suite.erreur ? null : precedente?.detail ?? null) }));
    })();
    return () => {
      annule = true;
    };
  }, [pin, date, cle]);

  async function calculer() {
    setCalcul(true);
    setErreurAction(null);
    try {
      const res = await fetch("/api/compteurs/recalculer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, pins: [pin] }),
      });
      const data = await lireReponse(res);
      if (!res.ok) {
        setErreurAction(data.error || "Calcul impossible.");
        return;
      }
      actualiser();
    } catch {
      setErreurAction("Erreur réseau : calcul impossible.");
    } finally {
      setCalcul(false);
    }
  }

  // Pendant un rechargement, l'ancien détail reste affiché (atténué) s'il concerne la même sélection
  const detail = reponse?.detail ?? null;
  const affiche = detail && detail.employe.pin === pin && detail.date === date ? detail : null;
  const aRecalculer = affiche?.valeurs.some((v) => v.statut === "NON_CALCULE" || v.statut === "A_RECALCULER" || v.perimee);

  return (
    <main className="mx-auto w-full max-w-7xl space-y-6 px-4 py-6 sm:px-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Détail jour</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Pointages, horaire affecté et compteurs d&apos;un employé pour une journée de travail.
        </p>
      </div>

      {/* Sélection employé + date */}
      <Card className="grid gap-4 p-4 md:grid-cols-[minmax(0,1fr)_auto]">
        <div className="space-y-1.5">
          <span className="text-xs font-medium">Employé</span>
          <SelecteurEmploye pin={pin} employe={affiche?.employe ?? null} onChoisir={(p) => changer({ pin: p })} />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="detail-date" className="text-xs font-medium">
            Date
          </label>
          <div className="flex items-center gap-1.5">
            <Button variant="outline" onClick={() => changer({ date: decaler(date, -1) })} aria-label="Jour précédent" className="px-2.5">
              <ChevronLeft className="size-4" />
            </Button>
            <div className="w-44">
              <DatePicker id="detail-date" value={date} max={aujourdhui} onChange={(v) => v && changer({ date: v })} />
            </div>
            <Button
              variant="outline"
              onClick={() => changer({ date: decaler(date, 1) })}
              disabled={date >= aujourdhui}
              aria-label="Jour suivant"
              className="px-2.5"
            >
              <ChevronRight className="size-4" />
            </Button>
            {date !== aujourdhui && (
              <Button variant="ghost" onClick={() => changer({ date: aujourdhui })} className="hidden px-2.5 sm:inline-flex">
                Aujourd&apos;hui
              </Button>
            )}
          </div>
        </div>
      </Card>

      {erreur && (
        <div role="alert" className="flex items-start gap-2 rounded-md border border-danger/20 bg-danger/10 p-3 text-sm text-danger">
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>{erreur}</span>
        </div>
      )}

      {!pin ? (
        <Card className="px-4 py-12 text-center text-sm text-muted-foreground">
          <User className="mx-auto mb-2 size-6 opacity-60" aria-hidden="true" />
          Choisissez un employé pour afficher sa journée.
        </Card>
      ) : !affiche ? (
        chargement ? <Chargement /> : null
      ) : (
        <div className={cn("space-y-6 transition-opacity", chargement && "opacity-60")} aria-busy={chargement}>
          {/* En-tête employé / jour */}
          <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold">
                {nomComplet(affiche.employe)} <span className="font-mono text-sm font-normal text-muted-foreground">#{affiche.employe.pin}</span>
              </h2>
              {affiche.employe.departement && <p className="text-sm text-muted-foreground">{affiche.employe.departement}</p>}
            </div>
            <p className="text-sm font-medium first-letter:uppercase">{formaterJour(affiche.date)}</p>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <CarteHoraire horaire={affiche.horaire} />
            <CartePointages pointages={affiche.pointages} date={affiche.date} />
          </div>

          <CarteCompteurs
            valeurs={affiche.valeurs}
            aRecalculer={Boolean(aRecalculer)}
            calcul={calcul}
            onCalculer={calculer}
            onActualiser={actualiser}
            chargement={chargement}
          />

          <HistoriqueCompteurs
            pin={pin}
            date={date}
            version={version}
            compteursDuJour={affiche.valeurs.filter((v) => v.periodicite === "JOUR")}
            onChoisirJour={(jour) => changer({ date: jour })}
          />
        </div>
      )}
    </main>
  );
}

function Chargement() {
  return (
    <div className="space-y-6" aria-label="Chargement">
      <Skeleton className="h-7 w-72" />
      <div className="grid gap-6 lg:grid-cols-2">
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
      </div>
      <Skeleton className="h-48" />
    </div>
  );
}

// ─── Sélecteur d'employé ─────────────────────────────────────────────────────

function SelecteurEmploye({ pin, employe, onChoisir }: { pin: string; employe: Employe | null; onChoisir: (pin: string) => void }) {
  const listeId = useId();
  const [texte, setTexte] = useState("");
  const [ouvert, setOuvert] = useState(false);
  const [actif, setActif] = useState(-1);
  const [resultats, setResultats] = useState<Employe[]>([]);
  const [recherche, setRecherche] = useState(false);
  const [departements, setDepartements] = useState<DepartementOption[]>([]);
  const [deptId, setDeptId] = useState("all");
  const requete = useRef(0);
  const avecDept = deptId !== "all";

  useEffect(() => {
    let annule = false;
    fetch("/api/presence/departements")
      .then((res) => res.json())
      .then((data) => {
        if (!annule && Array.isArray(data)) setDepartements(data);
      })
      .catch(() => {});
    return () => {
      annule = true;
    };
  }, []);

  useEffect(() => {
    const q = texte.trim();
    const id = ++requete.current;
    const t = setTimeout(async () => {
      if (!q && !avecDept) {
        setResultats([]);
        return;
      }
      setRecherche(true);
      try {
        const params = new URLSearchParams();
        if (q) params.set("q", q);
        if (avecDept) params.set("deptId", deptId);
        const res = await fetch(`/api/employes?${params}`);
        const data = await lireReponse(res);
        if (id === requete.current) setResultats(res.ok ? data.employes || [] : []);
      } finally {
        if (id === requete.current) setRecherche(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [texte, deptId, avecDept]);

  function choisir(e: Employe) {
    onChoisir(e.pin);
    setTexte("");
    setOuvert(false);
    setActif(-1);
  }

  function surTouche(ev: React.KeyboardEvent<HTMLInputElement>) {
    if (ev.key === "ArrowDown") {
      ev.preventDefault();
      setOuvert(true);
      setActif((a) => Math.min(a + 1, resultats.length - 1));
    } else if (ev.key === "ArrowUp") {
      ev.preventDefault();
      setActif((a) => Math.max(a - 1, 0));
    } else if (ev.key === "Enter" && ouvert && resultats[actif]) {
      ev.preventDefault();
      choisir(resultats[actif]);
    } else if (ev.key === "Escape") {
      setOuvert(false);
    }
  }

  const libelleCourant = employe ? `${nomComplet(employe)} (#${employe.pin})` : pin ? `Matricule ${pin}` : "";

  const listeVisible = ouvert && (texte.trim() !== "" || avecDept);

  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <select
        value={deptId}
        onChange={(e) => {
          setDeptId(e.target.value);
          setActif(-1);
          setOuvert(true);
        }}
        aria-label="Filtrer par département"
        title="Filtrer les employés par département"
        className={cn(fieldClass, "sm:w-56 sm:shrink-0")}
      >
        <option value="all">Tous les départements</option>
        {departements.map((d) => (
          <option key={d.id} value={d.id}>
            {d.label || d.name}
          </option>
        ))}
      </select>
    <div className="relative min-w-0 flex-1">
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
      <input
        role="combobox"
        aria-expanded={listeVisible}
        aria-controls={listeId}
        aria-autocomplete="list"
        aria-activedescendant={actif >= 0 ? `${listeId}-${actif}` : undefined}
        aria-label="Rechercher un employé"
        value={texte}
        onChange={(e) => {
          setTexte(e.target.value);
          setOuvert(true);
          setActif(-1);
        }}
        onFocus={() => setOuvert(true)}
        onBlur={() => setTimeout(() => setOuvert(false), 150)}
        onKeyDown={surTouche}
        placeholder={libelleCourant || "Matricule, nom ou prénom…"}
        maxLength={100}
        className={cn(fieldClass, "pl-9", libelleCourant && "placeholder:text-foreground")}
      />
      {texte && (
        <button
          type="button"
          onClick={() => setTexte("")}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
          aria-label="Effacer la recherche"
        >
          <X className="size-4" />
        </button>
      )}
      {listeVisible && (
        <ul
          id={listeId}
          role="listbox"
          className="absolute z-30 mt-1 max-h-72 w-full overflow-y-auto rounded-md border border-border bg-surface py-1 shadow-lg"
        >
          {recherche && resultats.length === 0 ? (
            <li className="px-3 py-2 text-sm text-muted-foreground">Recherche…</li>
          ) : resultats.length === 0 ? (
            <li className="px-3 py-2 text-sm text-muted-foreground">Aucun employé trouvé.</li>
          ) : (
            resultats.map((e, i) => (
              <li
                key={e.pin}
                id={`${listeId}-${i}`}
                role="option"
                aria-selected={i === actif}
                onMouseDown={(ev) => {
                  ev.preventDefault();
                  choisir(e);
                }}
                onMouseEnter={() => setActif(i)}
                className={cn("flex cursor-pointer items-center justify-between gap-3 px-3 py-2 text-sm", i === actif && "bg-muted")}
              >
                <span className="truncate">{nomComplet(e)}</span>
                <span className="shrink-0 font-mono text-xs text-muted-foreground">#{e.pin}</span>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
    </div>
  );
}

// ─── Horaire ─────────────────────────────────────────────────────────────────

const heure = (iso: string | null) => (iso ? iso.slice(11, 16) : null);

function CarteHoraire({ horaire }: { horaire: Horaire | null }) {
  return (
    <Card className="p-4">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <CalendarClock className="size-4 text-primary" aria-hidden="true" />
        Horaire du jour
      </h3>
      {!horaire ? (
        <p className="text-sm text-muted-foreground">Aucun horaire affecté pour cette journée.</p>
      ) : (
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          <dt className="text-muted-foreground">Horaire</dt>
          <dd className="flex flex-wrap items-center gap-2 font-medium">
            {horaire.nom ?? "Horaire inconnu"}
            {horaire.est_nuit && (
              <span className="inline-flex items-center gap-1 rounded-full bg-indigo-500/10 px-2 py-0.5 text-xs font-medium text-indigo-700 dark:text-indigo-300">
                <Moon className="size-3" aria-hidden="true" />
                Nuit (J+1)
              </span>
            )}
          </dd>
          <dt className="text-muted-foreground">Code</dt>
          <dd className="truncate font-mono text-xs leading-5" title={horaire.id}>
            {horaire.id}
          </dd>
          <dt className="text-muted-foreground">Prévu</dt>
          <dd>
            {heure(horaire.debut_prevu) ?? horaire.heure_debut ?? "—"} → {heure(horaire.fin_prevue) ?? horaire.heure_fin ?? "—"}
          </dd>
          <dt className="text-muted-foreground">Réel</dt>
          <dd>
            {heure(horaire.heure_entree) ?? "—"} → {heure(horaire.heure_sortie) ?? <span className="text-warning">sortie non pointée</span>}
          </dd>
        </dl>
      )}
    </Card>
  );
}

// ─── Pointages ───────────────────────────────────────────────────────────────

function CartePointages({ pointages, date }: { pointages: Pointage[]; date: string }) {
  return (
    <Card className="p-4">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <Clock className="size-4 text-primary" aria-hidden="true" />
        Pointages
        <span className="font-normal text-muted-foreground">({pointages.length})</span>
      </h3>
      {pointages.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucun pointage pour cette journée.</p>
      ) : (
        <ol className="space-y-1.5">
          {pointages.map((p, i) => {
            const jour = p.horodatage.slice(0, 10);
            const entree = p.code === "E" || p.code === "PE" || p.code === "HSE";
            return (
              <li key={`${p.horodatage}-${i}`} className="flex items-center gap-3 text-sm">
                <span
                  className={cn(
                    "inline-flex w-10 justify-center rounded px-1.5 py-0.5 text-xs font-semibold",
                    entree ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : "bg-muted text-muted-foreground"
                  )}
                  title={p.libelle}
                >
                  {p.code}
                </span>
                <span className="font-mono">{p.horodatage.slice(11, 16)}</span>
                <span className="text-muted-foreground">{p.libelle}</span>
                {jour !== date && (
                  <span className="ml-auto text-xs text-muted-foreground">{formaterJour(jour, { day: "numeric", month: "short" })}</span>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </Card>
  );
}

// ─── Compteurs ───────────────────────────────────────────────────────────────

function CarteCompteurs({
  valeurs,
  aRecalculer,
  calcul,
  chargement,
  onCalculer,
  onActualiser,
}: {
  valeurs: ValeurCompteur[];
  aRecalculer: boolean;
  calcul: boolean;
  chargement: boolean;
  onCalculer: () => void;
  onActualiser: () => void;
}) {
  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border p-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Sigma className="size-4 text-primary" aria-hidden="true" />
          Compteurs
        </h3>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onActualiser} disabled={chargement} aria-label="Actualiser" className="px-2.5">
            <RefreshCw className={cn("size-4", chargement && "animate-spin")} aria-hidden="true" />
          </Button>
          <Button variant={aRecalculer ? "primary" : "outline"} onClick={onCalculer} disabled={calcul || valeurs.length === 0}>
            {calcul ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Sigma className="size-4" aria-hidden="true" />}
            {aRecalculer ? "Calculer" : "Recalculer"}
          </Button>
        </div>
      </div>

      {valeurs.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-muted-foreground">Aucun compteur actif.</p>
      ) : (
        <div className="divide-y divide-border">
          {PERIODES.map(({ cle, libelle }) => {
            const lignes = valeurs.filter((v) => v.periodicite === cle);
            if (lignes.length === 0) return null;
            const { periode_debut: debut, periode_fin: fin } = lignes[0];
            return (
              <section key={cle} aria-label={`Compteurs ${libelle.toLowerCase()}`} className="py-3">
                <div className="flex items-baseline justify-between gap-2 px-4 pb-2 text-xs">
                  <span className="font-semibold uppercase tracking-wider text-muted-foreground">{libelle}</span>
                  <span className="text-muted-foreground">
                    {cle === "JOUR"
                      ? formaterJour(debut, { day: "numeric", month: "short" })
                      : cle === "MOIS"
                        ? formaterJour(debut, { month: "long", year: "numeric" })
                        : `du ${formaterJour(debut, { day: "numeric", month: "short" })} au ${formaterJour(fin, { day: "numeric", month: "short" })}`}
                  </span>
                </div>
                {/* Bande horizontale : défilement au doigt, à la molette (Maj) ou au clavier */}
                <ul
                  tabIndex={0}
                  aria-label={`${libelle} : ${lignes.length} compteur(s), défilement horizontal`}
                  className="flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:thin] focus-visible:outline-2 focus-visible:outline-ring"
                >
                  {lignes.map((v) => (
                    <CarteValeur key={`${v.id_compteur}-${cle}`} v={v} />
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </Card>
  );
}

function CarteValeur({ v }: { v: ValeurCompteur }) {
  const ok = v.statut === "OK" && v.valeur !== null;
  return (
    <li
      className={cn(
        "flex w-44 shrink-0 snap-start flex-col justify-between gap-2 rounded-lg border bg-surface p-3",
        v.statut === "ERREUR" ? "border-warning/40" : "border-border",
        !v.actif && "opacity-70"
      )}
      title={v.statut === "ERREUR" ? v.message ?? undefined : undefined}
    >
      <div className="min-w-0">
        <div className="truncate text-xs font-medium" title={v.libelle}>
          {v.libelle}
        </div>
        <div className="flex items-center gap-1.5 font-mono text-[10px] text-muted-foreground">
          {v.id_compteur}
          {!v.actif && <span className="rounded bg-muted px-1 font-sans">Inactif</span>}
        </div>
      </div>
      {ok ? (
        <span className={cn("font-mono text-xl font-semibold tabular-nums leading-none", v.valeur! < 0 && "text-danger")}>
          {formaterValeur(v.valeur!, v.unite)}
        </span>
      ) : v.statut === "ERREUR" ? (
        <span className="flex items-start gap-1 text-[11px] leading-tight text-warning">
          <AlertTriangle className="mt-px size-3 shrink-0" aria-hidden="true" />
          <span className="line-clamp-2">{v.message ?? "Non calculable"}</span>
        </span>
      ) : (
        <span className="text-xs text-muted-foreground">Non calculé</span>
      )}
      {v.perimee && <span className="text-[10px] leading-tight text-warning">Formule modifiée : à recalculer</span>}
    </li>
  );
}

// ─── Historique des jours précédents ─────────────────────────────────────────

interface ValeurHistorique {
  jour: string;
  id_compteur: string;
  libelle: string;
  unite: string;
  valeur: number | null;
  statut: "OK" | "ERREUR" | "A_RECALCULER";
  message: string | null;
  perimee: boolean;
}

const DUREES_HISTORIQUE = [7, 14, 30];

function HistoriqueCompteurs({
  pin,
  date,
  version,
  compteursDuJour,
  onChoisirJour,
}: {
  pin: string;
  date: string;
  version: number;
  compteursDuJour: ValeurCompteur[];
  onChoisirJour: (jour: string) => void;
}) {
  const [jours, setJours] = useState(7);
  const debut = decaler(date, -(jours - 1));
  const cle = `${pin}|${debut}|${date}|${version}`;
  const [reponse, setReponse] = useState<{ cle: string; valeurs: ValeurHistorique[]; erreur: string | null } | null>(null);
  const chargement = reponse?.cle !== cle;

  useEffect(() => {
    let annule = false;
    (async () => {
      let suite: { valeurs: ValeurHistorique[]; erreur: string | null };
      try {
        const res = await fetch(`/api/employes/${encodeURIComponent(pin)}/compteurs?debut=${debut}&fin=${date}`, { cache: "no-store" });
        const data = await lireReponse(res);
        suite = res.ok ? { valeurs: data.valeurs || [], erreur: null } : { valeurs: [], erreur: data.error || "Historique indisponible." };
      } catch {
        suite = { valeurs: [], erreur: "Erreur réseau : historique indisponible." };
      }
      if (!annule) setReponse({ cle, ...suite });
    })();
    return () => {
      annule = true;
    };
  }, [pin, debut, date, cle]);

  // Colonnes : compteurs journaliers actuels, puis ceux présents seulement dans l'historique
  const valeurs = reponse?.valeurs ?? [];
  const colonnes: { id: string; libelle: string }[] = [];
  for (const c of [...compteursDuJour, ...valeurs]) {
    if (!colonnes.some((x) => x.id === c.id_compteur)) colonnes.push({ id: c.id_compteur, libelle: c.libelle });
  }
  const parCase = new Map(valeurs.map((v) => [`${v.jour}|${v.id_compteur}`, v]));
  const lignes = Array.from({ length: jours }, (_, i) => decaler(date, -i));

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border p-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <CalendarClock className="size-4 text-primary" aria-hidden="true" />
          Historique des compteurs journaliers
          {chargement && <Loader2 className="size-3.5 animate-spin text-muted-foreground" aria-hidden="true" />}
        </h3>
        <div className="flex rounded-md border border-border p-0.5" role="group" aria-label="Période de l'historique">
          {DUREES_HISTORIQUE.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setJours(n)}
              aria-pressed={jours === n}
              className={cn(
                "rounded px-2.5 py-1 text-xs font-medium transition-colors",
                jours === n ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              {n} j
            </button>
          ))}
        </div>
      </div>

      {reponse?.erreur && reponse.cle === cle ? (
        <p role="alert" className="px-4 py-6 text-sm text-danger">
          {reponse.erreur}
        </p>
      ) : colonnes.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-muted-foreground">Aucun compteur journalier.</p>
      ) : (
        <div className={cn("overflow-x-auto transition-opacity", chargement && "opacity-60")}>
          <table className="w-full min-w-max border-collapse text-left text-sm">
            <thead className="bg-muted text-xs text-muted-foreground">
              <tr>
                <th scope="col" className="sticky left-0 z-10 bg-muted px-4 py-2.5 font-medium">
                  Jour
                </th>
                {colonnes.map((c) => (
                  <th key={c.id} scope="col" className="max-w-40 px-4 py-2.5 text-right font-medium" title={`${c.libelle} (${c.id})`}>
                    <span className="block truncate">{c.libelle}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {lignes.map((jour) => {
                const courant = jour === date;
                return (
                  <tr key={jour} className={cn(courant ? "bg-primary/5" : "hover:bg-muted/40")}>
                    <th scope="row" className={cn("sticky left-0 z-10 px-4 py-2 font-normal", courant ? "bg-[color-mix(in_srgb,var(--primary)_5%,var(--surface))]" : "bg-surface")}>
                      <button
                        type="button"
                        onClick={() => onChoisirJour(jour)}
                        disabled={courant}
                        className={cn("whitespace-nowrap text-left first-letter:uppercase", courant ? "font-semibold" : "hover:text-primary hover:underline")}
                        title={courant ? "Jour affiché" : "Afficher ce jour"}
                      >
                        {formaterJour(jour, { weekday: "short", day: "numeric", month: "short" })}
                      </button>
                    </th>
                    {colonnes.map((c) => (
                      <CaseHistorique key={c.id} v={parCase.get(`${jour}|${c.id}`)} />
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="border-t border-border px-4 py-2 text-[11px] text-muted-foreground">
        « · » non calculé · « ! » non calculable (survolez pour le détail) · cliquez sur un jour pour l&apos;afficher.
      </p>
    </Card>
  );
}

function CaseHistorique({ v }: { v?: ValeurHistorique }) {
  if (!v) {
    return (
      <td className="px-4 py-2 text-right text-muted-foreground" title="Non calculé">
        ·
      </td>
    );
  }
  if (v.statut !== "OK" || v.valeur === null) {
    return (
      <td className="px-4 py-2 text-right text-warning" title={v.message ?? "Non calculable"}>
        !
      </td>
    );
  }
  return (
    <td
      className={cn("whitespace-nowrap px-4 py-2 text-right font-mono tabular-nums", v.valeur < 0 && "text-danger", v.perimee && "italic text-muted-foreground")}
      title={v.perimee ? "Calculé avec une ancienne version de la formule" : undefined}
    >
      {formaterValeur(v.valeur, v.unite)}
    </td>
  );
}
