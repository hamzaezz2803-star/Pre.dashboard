"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Clock,
  Plus,
  Pencil,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Moon,
  Sun,
  Sunrise,
  Sunset,
  AlertTriangle,
  RotateCcw,
  Sliders,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export interface HoraireItem {
  id: number;
  code: string;
  nom: string;
  heure_debut: string;
  heure_fin: string;
  est_nuit: boolean;
  description?: string;
  created_at?: string;
}

export function HorairesParametrage() {
  const [horaires, setHoraires] = useState<HoraireItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // État du formulaire
  const [editingId, setEditingId] = useState<number | null>(null);
  const [code, setCode] = useState("H001");
  const [nom, setNom] = useState("Matin");
  const [heureDebut, setHeureDebut] = useState("08:00");
  const [heureFin, setHeureFin] = useState("16:00");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // État de la modal de suppression
  const [deletingItem, setDeletingItem] = useState<HoraireItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  const chargerHoraires = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/horaires");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur de chargement");
      setHoraires(data.horaires || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erreur inattendue");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    fetch("/api/horaires")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (active && data) {
          setHoraires(data.horaires || []);
        }
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : "Erreur inattendue");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  // Détection automatique si l'horaire traverse minuit
  const estNuitDetecte = (() => {
    if (!heureDebut || !heureFin) return false;
    const [hD, mD] = heureDebut.split(":").map(Number);
    const [hF, mF] = heureFin.split(":").map(Number);
    return hF * 60 + mF <= hD * 60 + mD;
  })();

  const resetForm = () => {
    setEditingId(null);
    setCode("H001");
    setNom("Matin");
    setHeureDebut("08:00");
    setHeureFin("16:00");
    setDescription("");
  };

  const handleEdit = (item: HoraireItem) => {
    setEditingId(item.id);
    setCode(item.code);
    setNom(item.nom);
    setHeureDebut(item.heure_debut);
    setHeureFin(item.heure_fin);
    setDescription(item.description || "");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const method = editingId ? "PUT" : "POST";
      const payload = {
        id: editingId,
        code: code.trim().toUpperCase(),
        nom: nom.trim(),
        heure_debut: heureDebut,
        heure_fin: heureFin,
        description: description.trim(),
      };

      const res = await fetch("/api/horaires", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur lors de l'enregistrement");

      setSuccess(editingId ? "Horaire mis à jour avec succès." : "Nouvel horaire enregistré avec succès.");
      resetForm();
      chargerHoraires();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erreur inattendue");
    } finally {
      setSubmitting(false);
    }
  };

  const confirmDelete = async () => {
    if (!deletingItem) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/horaires?id=${deletingItem.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur lors de la suppression");

      setSuccess(`L'horaire ${deletingItem.code} (${deletingItem.nom}) a été supprimé.`);
      setDeletingItem(null);
      if (editingId === deletingItem.id) resetForm();
      chargerHoraires();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erreur lors de la suppression");
    } finally {
      setDeleting(false);
    }
  };

  // Pré-remplissage rapide des modèles de test
  const appliquerTemplate = (templateCode: "H001" | "H002" | "H003") => {
    if (templateCode === "H001") {
      setCode("H001");
      setNom("Matin");
      setHeureDebut("08:00");
      setHeureFin("16:00");
      setDescription("Poste du matin standard (08h00 - 16h00)");
    } else if (templateCode === "H002") {
      setCode("H002");
      setNom("Après-midi");
      setHeureDebut("14:00");
      setHeureFin("22:00");
      setDescription("Poste d'après-midi standard (14h00 - 22h00)");
    } else if (templateCode === "H003") {
      setCode("H003");
      setNom("Nuit");
      setHeureDebut("22:00");
      setHeureFin("06:00");
      setDescription("Poste de nuit traversant minuit (22h00 - 06h00 le lendemain)");
    }
  };

  return (
    <div className="w-full space-y-6 px-3 py-5 sm:px-5 lg:px-6">
      {/* En-tête */}
      <div className="flex flex-col gap-1 border-b border-border pb-4">
        <div className="flex items-center gap-2.5">
          <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Sliders className="size-5" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
              Saisie des paramétrages horaires
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground">
              Configuration des créneaux de service pour l&apos;affectation horaire automatique des présences.
            </p>
          </div>
        </div>
      </div>

      {/* Messages d'alerte */}
      {success && (
        <div className="flex items-center gap-2 rounded-lg bg-emerald-500/10 p-3.5 text-xs sm:text-sm font-medium text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">
          <CheckCircle2 className="size-4 shrink-0" />
          <span>{success}</span>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-danger-soft p-3.5 text-xs sm:text-sm font-medium text-danger border border-danger/20">
          <AlertCircle className="size-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Formulaire de saisie professionnelle */}
      <Card className="p-5 sm:p-6 border-border">
        <div className="flex items-center justify-between border-b border-border pb-3 mb-4 flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Clock className="size-4 text-primary" />
            <h2 className="text-sm sm:text-base font-semibold text-foreground">
              {editingId ? "Modification de l'horaire" : "Création d'un nouvel horaire"}
            </h2>
          </div>

          {/* Raccourcis modèles de test */}
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-muted-foreground hidden sm:inline">Modèles de test :</span>
            <button
              type="button"
              onClick={() => appliquerTemplate("H001")}
              className="px-2 py-1 rounded bg-muted hover:bg-primary/10 hover:text-primary transition-colors font-mono"
            >
              H001 Matin
            </button>
            <button
              type="button"
              onClick={() => appliquerTemplate("H002")}
              className="px-2 py-1 rounded bg-muted hover:bg-primary/10 hover:text-primary transition-colors font-mono"
            >
              H002 Après-midi
            </button>
            <button
              type="button"
              onClick={() => appliquerTemplate("H003")}
              className="px-2 py-1 rounded bg-muted hover:bg-primary/10 hover:text-primary transition-colors font-mono"
            >
              H003 Nuit (J+1)
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Code horaire */}
            <div>
              <label className="block text-xs font-semibold text-foreground mb-1">
                Code horaire <span className="text-danger">*</span>
              </label>
              <input
                type="text"
                required
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="Ex: H001"
                className="w-full rounded-md border border-border bg-surface px-3 py-2 text-xs sm:text-sm font-mono text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary uppercase"
              />
            </div>

            {/* Libellé horaire */}
            <div>
              <label className="block text-xs font-semibold text-foreground mb-1">
                Libellé horaire <span className="text-danger">*</span>
              </label>
              <input
                type="text"
                required
                value={nom}
                onChange={(e) => setNom(e.target.value)}
                placeholder="Ex: Matin, Après-midi, Nuit"
                className="w-full rounded-md border border-border bg-surface px-3 py-2 text-xs sm:text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            {/* Heure de début */}
            <div>
              <label className="block text-xs font-semibold text-foreground mb-1">
                Heure de début <span className="text-danger">*</span>
              </label>
              <input
                type="time"
                required
                value={heureDebut}
                onChange={(e) => setHeureDebut(e.target.value)}
                className="w-full rounded-md border border-border bg-surface px-3 py-2 text-xs sm:text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            {/* Heure de fin */}
            <div>
              <label className="block text-xs font-semibold text-foreground mb-1">
                Heure de fin <span className="text-danger">*</span>
              </label>
              <input
                type="time"
                required
                value={heureFin}
                onChange={(e) => setHeureFin(e.target.value)}
                className="w-full rounded-md border border-border bg-surface px-3 py-2 text-xs sm:text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>

          {/* Indicateur visuel d'horaire de nuit */}
          {estNuitDetecte && (
            <div className="flex items-center gap-2 rounded-lg bg-indigo-500/10 p-3 text-xs font-medium text-indigo-700 dark:text-indigo-400 border border-indigo-500/20">
              <Moon className="size-4 shrink-0 text-indigo-500" />
              <span>
                <strong>Service de nuit détecté :</strong> Cet horaire commence à {heureDebut} et se termine le lendemain à {heureFin} (traverse minuit J+1).
              </span>
            </div>
          )}

          {/* Description optionnelle */}
          <div>
            <label className="block text-xs font-semibold text-foreground mb-1">
              Description / Notes d&apos;affectation
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ex: Poste opérationnel sur site industriel Phosboucraâ"
              className="w-full rounded-md border border-border bg-surface px-3 py-2 text-xs sm:text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            {editingId && (
              <Button type="button" variant="outline" onClick={resetForm} disabled={submitting}>
                Annuler
              </Button>
            )}
            <Button type="submit" disabled={submitting} className="min-w-32">
              {editingId ? (
                <>
                  <Pencil className="size-3.5 mr-1.5" />
                  {submitting ? "Mise à jour..." : "Mettre à jour"}
                </>
              ) : (
                <>
                  <Plus className="size-3.5 mr-1.5" />
                  {submitting ? "Enregistrement..." : "Enregistrer l'horaire"}
                </>
              )}
            </Button>
          </div>
        </form>
      </Card>

      {/* Tableau des horaires configurés */}
      <Card className="border-border">
        <div className="flex items-center justify-between border-b border-border p-3.5 sm:p-4">
          <div>
            <h3 className="text-sm sm:text-base font-semibold text-foreground">
              Horaires actuellement configurés
            </h3>
            <p className="text-xs text-muted-foreground">
              {horaires.length} {horaires.length > 1 ? "horaires actifs" : "horaire actif"} pour l&apos;affectation dynamique.
            </p>
          </div>

          <Button variant="outline" onClick={chargerHoraires} disabled={loading} className="h-8 text-xs">
            <RotateCcw className={cn("size-3.5 mr-1.5", loading && "animate-spin")} />
            Actualiser
          </Button>
        </div>

        <div className="overflow-x-auto w-full">
          <table className="w-full border-collapse text-left text-xs sm:text-sm">
            <thead className="bg-muted text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2.5 font-medium">Code</th>
                <th className="px-3 py-2.5 font-medium">Libellé</th>
                <th className="px-3 py-2.5 font-medium text-center">Début</th>
                <th className="px-3 py-2.5 font-medium text-center">Fin</th>
                <th className="px-3 py-2.5 font-medium text-center">Type de poste</th>
                <th className="px-3 py-2.5 font-medium">Description</th>
                <th className="px-3 py-2.5 font-medium text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && horaires.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-xs text-muted-foreground">
                    Chargement des horaires configurés...
                  </td>
                </tr>
              ) : horaires.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-xs text-muted-foreground">
                    Aucun horaire paramétré. Utilisez le formulaire ci-dessus pour en ajouter.
                  </td>
                </tr>
              ) : (
                horaires.map((item) => {
                  const isNight = item.est_nuit;
                  return (
                    <tr
                      key={item.id}
                      className={cn(
                        "border-t border-border hover:bg-muted/40 transition-colors",
                        editingId === item.id && "bg-primary/5"
                      )}
                    >
                      {/* Code */}
                      <td className="px-3 py-2.5 font-mono font-bold text-xs text-foreground">
                        <span className="inline-flex items-center rounded px-2 py-0.5 bg-muted font-mono font-bold">
                          {item.code}
                        </span>
                      </td>

                      {/* Libellé */}
                      <td className="px-3 py-2.5 font-medium text-foreground">
                        <div className="flex items-center gap-1.5">
                          {item.nom.toLowerCase().includes("matin") ? (
                            <Sunrise className="size-3.5 text-amber-500" />
                          ) : item.nom.toLowerCase().includes("midi") ? (
                            <Sunset className="size-3.5 text-orange-500" />
                          ) : isNight ? (
                            <Moon className="size-3.5 text-indigo-500" />
                          ) : (
                            <Sun className="size-3.5 text-emerald-500" />
                          )}
                          <span>{item.nom}</span>
                        </div>
                      </td>

                      {/* Heure début */}
                      <td className="px-3 py-2.5 text-center font-mono text-xs tabular-nums text-foreground font-semibold">
                        {item.heure_debut}
                      </td>

                      {/* Heure fin */}
                      <td className="px-3 py-2.5 text-center font-mono text-xs tabular-nums text-foreground font-semibold">
                        {item.heure_fin}
                        {isNight && (
                          <span className="ml-1 text-[10px] text-indigo-600 dark:text-indigo-400 font-bold">
                            (+1)
                          </span>
                        )}
                      </td>

                      {/* Type de poste */}
                      <td className="px-3 py-2.5 text-center">
                        {isNight ? (
                          <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold bg-indigo-500/15 text-indigo-700 dark:text-indigo-400 border border-indigo-500/20">
                            <Moon className="size-3" />
                            Nuit (traverse minuit)
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">
                            <Sun className="size-3" />
                            Journée
                          </span>
                        )}
                      </td>

                      {/* Description */}
                      <td className="px-3 py-2.5 text-xs text-muted-foreground max-w-xs truncate" title={item.description}>
                        {item.description || "-"}
                      </td>

                      {/* Actions */}
                      <td className="px-3 py-2.5 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleEdit(item)}
                            className="p-1.5 rounded-md text-muted-foreground hover:text-primary hover:bg-muted transition-colors cursor-pointer"
                            title="Modifier cet horaire"
                          >
                            <Pencil className="size-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeletingItem(item)}
                            className="p-1.5 rounded-md text-muted-foreground hover:text-danger hover:bg-danger-soft transition-colors cursor-pointer"
                            title="Supprimer cet horaire"
                          >
                            <Trash2 className="size-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Boîte de dialogue modale de confirmation de suppression */}
      {deletingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <Card className="w-full max-w-md p-6 space-y-4 shadow-xl border-border bg-surface">
            <div className="flex items-center gap-3 text-danger">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-danger-soft">
                <AlertTriangle className="size-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-foreground">Confirmation de suppression</h3>
                <p className="text-xs text-muted-foreground">Cette action est irréversible.</p>
              </div>
            </div>

            <p className="text-sm text-foreground">
              Êtes-vous sûr de vouloir supprimer l&apos;horaire{" "}
              <strong className="font-mono text-primary">{deletingItem.code}</strong> (
              <em>{deletingItem.nom}</em> : {deletingItem.heure_debut} - {deletingItem.heure_fin}) ?
            </p>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
              <Button
                type="button"
                variant="outline"
                onClick={() => setDeletingItem(null)}
                disabled={deleting}
              >
                Annuler
              </Button>
              <Button
                type="button"
                onClick={confirmDelete}
                disabled={deleting}
                className="bg-danger text-white hover:bg-danger/90"
              >
                {deleting ? "Suppression..." : "Confirmer la suppression"}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
