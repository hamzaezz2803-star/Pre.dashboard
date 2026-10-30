"use client";

import {
  AlertCircle,
  AlertTriangle,
  Building2,
  Check,
  ChevronDown,
  ChevronRight,
  Edit2,
  KeyRound,
  Loader2,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  UserCheck,
  UserPlus,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, fieldClass } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface UserDepartment {
  id: string;
  name: string;
}

interface User {
  id: number;
  username: string;
  full_name: string | null;
  role: "super_admin" | "admin";
  active: boolean;
  created_at: string;
  updated_at: string;
  departements?: UserDepartment[];
}

interface SousDepartmentItem {
  id: string;
  code: string;
  name: string;
  parent_id: string;
  niveau: number;
  chemin: string;
}

interface ParentDepartmentTree {
  id: string;
  code?: string;
  name: string;
  nb_sous_departements: number;
  sous_departements?: SousDepartmentItem[];
}

interface CurrentUser {
  id?: number;
  username: string;
  full_name: string | null;
  role: string;
}

function HighlightedText({ text, query }: { text: string; query: string }) {
  const q = query.trim().toLowerCase();
  if (!q) return <span>{text}</span>;
  const lower = text.toLowerCase();
  const idx = lower.indexOf(q);
  if (idx === -1) return <span>{text}</span>;
  const before = text.slice(0, idx);
  const match = text.slice(idx, idx + q.length);
  const after = text.slice(idx + q.length);
  return (
    <span>
      {before}
      <mark className="bg-amber-300 dark:bg-amber-500/80 text-foreground font-semibold px-0.5 rounded-xs">
        {match}
      </mark>
      {after}
    </span>
  );
}

function formatDate(dateStr: string): string {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Sélecteur hiérarchique de départements parents avec carte latérale alignée sur la ligne */
function DepartementSelector({
  departements,
  selectedIds,
  onChange,
  disabled = false,
}: {
  departements: ParentDepartmentTree[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
}) {
  const [recherche, setRecherche] = useState("");
  const [activeParentId, setActiveParentId] = useState<string | null>(null);
  const [cardCoords, setCardCoords] = useState<{ top: number; left: number } | null>(null);

  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const cardRef = useRef<HTMLDivElement | null>(null);

  const q = recherche.trim().toLowerCase();

  // Filtrage : un parent est affiché si son nom/code matche OU si un de ses sous-départements matche
  const filteredParents = useMemo(() => {
    return departements.filter((p) => {
      if (!q) return true;
      const parentMatches =
        p.name.toLowerCase().includes(q) ||
        (p.code && p.code.toLowerCase().includes(q));
      if (parentMatches) return true;

      const subMatches = (p.sous_departements || []).some(
        (sd) =>
          sd.name.toLowerCase().includes(q) ||
          (sd.code && sd.code.toLowerCase().includes(q))
      );
      return subMatches;
    });
  }, [departements, q]);

  const selectedSet = new Set(selectedIds.map(String));

  // Calcul du positionnement de la carte latérale alignée sur la ligne du parent
  const updateCardPosition = useCallback((parentId: string) => {
    const el = rowRefs.current[parentId];
    if (!el) return;

    const rect = el.getBoundingClientRect();
    const cardWidth = 320;
    const cardHeight = 240;

    let left = rect.right + 12;
    // Si la carte dépasse à droite de l'écran, tenter à gauche de la modale ou ajuster
    if (left + cardWidth > window.innerWidth - 12) {
      if (rect.left - cardWidth - 12 > 12) {
        left = rect.left - cardWidth - 12;
      } else {
        left = Math.max(12, window.innerWidth - cardWidth - 12);
      }
    }

    let top = rect.top;
    if (top + cardHeight > window.innerHeight - 12) {
      top = Math.max(12, window.innerHeight - cardHeight - 12);
    }

    setCardCoords({ top, left });
  }, []);

  // Déplacement / synchronisation de position de la carte active
  useEffect(() => {
    if (activeParentId) {
      updateCardPosition(activeParentId);
    } else {
      setCardCoords(null);
    }
  }, [activeParentId, updateCardPosition]);

  // Écoute des redimensionnements et scrolls
  useEffect(() => {
    if (!activeParentId) return;
    const handleReposition = () => updateCardPosition(activeParentId);
    window.addEventListener("resize", handleReposition);
    window.addEventListener("scroll", handleReposition, true);
    return () => {
      window.removeEventListener("resize", handleReposition);
      window.removeEventListener("scroll", handleReposition, true);
    };
  }, [activeParentId, updateCardPosition]);

  // Fermeture par touche Échap
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setActiveParentId(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Fermeture par clic en dehors
  useEffect(() => {
    if (!activeParentId) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (cardRef.current && cardRef.current.contains(target)) return;
      const isInsideAnyRow = Object.values(rowRefs.current).some(
        (el) => el && el.contains(target)
      );
      if (isInsideAnyRow) return;
      setActiveParentId(null);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [activeParentId]);

  // Si l'utilisateur tape un mot clé correspondant à un sous-département (ex: "sousprod"),
  // faire apparaître le parent et ouvrir automatiquement sa carte avec mise en surbrillance !
  useEffect(() => {
    if (!q) return;
    const matchSubParent = departements.find((p) =>
      (p.sous_departements || []).some(
        (sd) =>
          sd.name.toLowerCase().includes(q) ||
          (sd.code && sd.code.toLowerCase().includes(q))
      )
    );
    if (matchSubParent) {
      setActiveParentId(matchSubParent.id);
    }
  }, [q, departements]);

  function toggleCheck(id: string, e?: React.MouseEvent) {
    if (disabled) return;
    e?.stopPropagation();
    const strId = String(id);
    if (selectedSet.has(strId)) {
      onChange(selectedIds.filter((x) => String(x) !== strId));
    } else {
      onChange([...selectedIds, strId]);
    }
    setActiveParentId(strId);
  }

  function handleRowClick(id: string) {
    if (disabled) return;
    // Cliquer sur la ligne ouvre ou ferme la carte latérale
    setActiveParentId((prev) => (prev === id ? null : id));
  }

  function selectAll() {
    if (disabled) return;
    const toAdd = filteredParents.map((d) => String(d.id));
    const merged = Array.from(new Set([...selectedIds.map(String), ...toAdd]));
    onChange(merged);
  }

  function deselectAll() {
    if (disabled) return;
    if (!q) {
      onChange([]);
    } else {
      const toRemove = new Set(filteredParents.map((d) => String(d.id)));
      onChange(selectedIds.filter((id) => !toRemove.has(String(id))));
    }
  }

  const activeParent = departements.find((p) => String(p.id) === String(activeParentId)) || null;

  return (
    <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-3.5 relative">
      {/* En-tête : compteur des parents et actions rapides */}
      <div className="flex flex-wrap items-center justify-between gap-1.5">
        <label className="text-xs font-semibold flex items-center gap-1.5 text-foreground">
          <Building2 className="size-3.5 text-primary" aria-hidden="true" />
          Départements attribués ({selectedIds.length}/{departements.length} parents)
        </label>
        <div className="flex items-center gap-2 text-[11px]">
          <button
            type="button"
            disabled={disabled || departements.length === 0}
            onClick={selectAll}
            className="text-primary hover:underline font-medium disabled:opacity-50 cursor-pointer"
          >
            Tout sélectionner
          </button>
          <span className="text-muted-foreground">•</span>
          <button
            type="button"
            disabled={disabled || selectedIds.length === 0}
            onClick={deselectAll}
            className="text-muted-foreground hover:text-foreground hover:underline disabled:opacity-50 cursor-pointer"
          >
            Tout désélectionner
          </button>
        </div>
      </div>

      {/* Barre de recherche avec support des sous-départements */}
      <div className="relative">
        <Search className="size-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <input
          type="text"
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          placeholder="Rechercher un parent ou sous-département (ex: WHARF, sousprod)..."
          disabled={disabled}
          className="w-full pl-8 pr-7 py-1.5 text-xs rounded-md border border-border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-muted-foreground"
        />
        {recherche && (
          <button
            type="button"
            onClick={() => setRecherche("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
            aria-label="Effacer la recherche"
          >
            <X className="size-3" />
          </button>
        )}
      </div>

      {/* Liste à cocher : UNIQUEMENT les départements parents */}
      <div className="max-h-52 overflow-y-auto rounded-md border border-border bg-background divide-y divide-border/40 p-1">
        {departements.length === 0 ? (
          <p className="p-3 text-center text-xs text-muted-foreground">
            Chargement ou aucun département parent disponible.
          </p>
        ) : filteredParents.length === 0 ? (
          <p className="p-3 text-center text-xs text-muted-foreground">
            Aucun département correspondant à « {recherche} ».
          </p>
        ) : (
          filteredParents.map((p) => {
            const isChecked = selectedSet.has(String(p.id));
            const isActive = activeParentId === String(p.id);
            const hasSubMatch =
              Boolean(q) &&
              !(p.name.toLowerCase().includes(q) || (p.code && p.code.toLowerCase().includes(q))) &&
              (p.sous_departements || []).some(
                (sd) =>
                  sd.name.toLowerCase().includes(q) ||
                  (sd.code && sd.code.toLowerCase().includes(q))
              );

            return (
              <div
                key={p.id}
                ref={(el) => {
                  rowRefs.current[p.id] = el;
                }}
                onClick={() => handleRowClick(p.id)}
                className={cn(
                  "flex items-center gap-2 px-2.5 py-1.5 rounded text-xs cursor-pointer select-none transition-colors",
                  isActive
                    ? "bg-primary/15 ring-1 ring-primary/40 font-medium text-foreground"
                    : isChecked
                    ? "bg-primary/10 text-foreground font-medium"
                    : "hover:bg-muted/50 text-foreground/80"
                )}
              >
                <input
                  type="checkbox"
                  checked={isChecked}
                  disabled={disabled}
                  onClick={(e) => e.stopPropagation()}
                  onChange={() => toggleCheck(p.id)}
                  className="size-3.5 rounded border-border text-primary focus:ring-primary cursor-pointer shrink-0"
                />

                <span className="flex-1 truncate">
                  <HighlightedText text={p.name} query={recherche} />
                  {hasSubMatch && (
                    <span className="ml-1.5 text-[10px] text-amber-600 dark:text-amber-400 italic">
                      (correspondance sous-dép.)
                    </span>
                  )}
                </span>

                {p.code && (
                  <span className="font-mono text-[10px] text-muted-foreground px-1.5 py-0.5 bg-muted rounded border border-border/50 shrink-0">
                    <HighlightedText text={p.code} query={recherche} />
                  </span>
                )}

                {/* Badge N sous-dép. */}
                {p.nb_sous_departements > 0 && (
                  <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 shrink-0">
                    {p.nb_sous_departements} sous-dép.
                  </span>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Carte latérale volante (flottante) alignée sur la ligne du parent sélectionné */}
      {activeParent && cardCoords && (
        <div
          ref={cardRef}
          style={{
            position: "fixed",
            top: `${cardCoords.top}px`,
            left: `${cardCoords.left}px`,
            maxHeight: "calc(100vh - 40px)",
          }}
          className="z-[70] w-72 sm:w-80 rounded-lg border border-border bg-surface p-3.5 shadow-2xl space-y-2.5 animate-in fade-in slide-in-from-left-2 backdrop-blur-xs"
        >
          {/* En-tête de la carte */}
          <div className="flex items-center justify-between gap-2 border-b border-border pb-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <Building2 className="size-4 text-primary shrink-0" />
              <span className="font-semibold text-xs text-foreground truncate">
                {activeParent.name}
              </span>
              {activeParent.code && (
                <span className="font-mono text-[10px] text-muted-foreground px-1 bg-muted rounded shrink-0">
                  {activeParent.code}
                </span>
              )}
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                {activeParent.nb_sous_departements} sous-dép.
              </span>
              <button
                type="button"
                onClick={() => setActiveParentId(null)}
                className="text-muted-foreground hover:text-foreground p-0.5 rounded transition-colors cursor-pointer"
                title="Fermer la carte (ou appuyer sur Échap)"
                aria-label="Fermer la carte"
              >
                <X className="size-3.5" />
              </button>
            </div>
          </div>

          {/* Arbre indenté des sous-départements (lecture seule) */}
          {activeParent.sous_departements && activeParent.sous_departements.length > 0 ? (
            <div className="max-h-60 overflow-y-auto space-y-1 pr-1">
              {activeParent.sous_departements.map((sd) => {
                const isMatched =
                  Boolean(q) &&
                  (sd.name.toLowerCase().includes(q) ||
                    (sd.code && sd.code.toLowerCase().includes(q)));

                const paddingLeft =
                  sd.niveau === 1 ? "pl-1" : sd.niveau === 2 ? "pl-4" : "pl-7";

                return (
                  <div
                    key={sd.id}
                    className={cn(
                      "flex items-center gap-1.5 py-1 text-xs rounded transition-colors",
                      paddingLeft,
                      isMatched
                        ? "bg-amber-100 dark:bg-amber-950/60 font-semibold px-1 text-amber-900 dark:text-amber-200 border border-amber-300 dark:border-amber-700"
                        : "text-foreground/85 hover:text-foreground"
                    )}
                  >
                    <span className="text-muted-foreground font-mono select-none">↳</span>
                    {sd.code && (
                      <span className="font-mono text-[10px] text-muted-foreground px-1 bg-muted rounded border border-border/40 shrink-0">
                        <HighlightedText text={sd.code} query={recherche} />
                      </span>
                    )}
                    <span className="truncate">
                      <HighlightedText text={sd.name} query={recherche} />
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground italic py-3 text-center bg-muted/20 rounded">
              Aucun sous-département
            </p>
          )}

          <div className="pt-1.5 border-t border-border/50 text-[10px] text-muted-foreground flex items-center justify-between">
            <span>Lecture seule</span>
            <span className="text-[9px] text-muted-foreground/80">Échap pour fermer</span>
          </div>
        </div>
      )}

      {/* Message d'état (alerte si 0 sélectionné, confirmation si > 0) */}
      {selectedIds.length === 0 ? (
        <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-2 text-[11px] text-amber-700 dark:text-amber-300">
          <AlertTriangle className="size-4 shrink-0 mt-0.5" aria-hidden="true" />
          <div>
            <span className="font-semibold">Aucun département affecté :</span>{" "}
            cet administrateur ne verra aucune donnée tant qu&apos;un département parent ne lui sera pas attribué.
          </div>
        </div>
      ) : (
        <p className="text-[11px] text-muted-foreground flex items-center gap-1">
          <span className="text-emerald-600 dark:text-emerald-400 font-bold">✓</span>
          Tous les sous-départements de l&apos;arbre sont calculés et inclus automatiquement côté serveur.
        </p>
      )}
    </div>
  );
}

export function UserManagement({ currentUser }: { currentUser?: CurrentUser }) {
  const [users, setUsers] = useState<User[]>([]);
  const [allDepartements, setAllDepartements] = useState<ParentDepartmentTree[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Modales
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editModalUser, setEditModalUser] = useState<User | null>(null);
  const [resetPwdUser, setResetPwdUser] = useState<User | null>(null);
  const [deleteModalUser, setDeleteModalUser] = useState<User | null>(null);

  // Formulaires
  const [createForm, setCreateForm] = useState({
    username: "",
    full_name: "",
    role: "admin" as "admin" | "super_admin",
    password: "",
    departement_ids: [] as string[],
  });
  const [editForm, setEditForm] = useState({
    full_name: "",
    role: "admin" as "admin" | "super_admin",
    active: true,
    departement_ids: [] as string[],
  });
  const [newPassword, setNewPassword] = useState("");
  const [actionPending, setActionPending] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  async function loadUsers() {
    setLoading(true);
    setError(null);
    try {
      const [resUsers, resDepts] = await Promise.all([
        fetch("/api/admin/users"),
        fetch("/api/departements/arbre"),
      ]);

      if (!resUsers.ok) {
        const data = await resUsers.json().catch(() => ({}));
        throw new Error(data.error || "Impossible de charger la liste des utilisateurs.");
      }
      const dataUsers = await resUsers.json();
      setUsers(dataUsers);

      if (resDepts.ok) {
        const dataDepts = await resDepts.json();
        setAllDepartements(dataDepts.parents || []);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erreur de chargement.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    async function init() {
      try {
        const [resUsers, resDepts] = await Promise.all([
          fetch("/api/admin/users"),
          fetch("/api/departements/arbre"),
        ]);

        if (!resUsers.ok) {
          const data = await resUsers.json().catch(() => ({}));
          throw new Error(data.error || "Impossible de charger la liste des utilisateurs.");
        }
        const dataUsers = await resUsers.json();
        if (!cancelled) setUsers(dataUsers);

        if (resDepts.ok) {
          const dataDepts = await resDepts.json();
          if (!cancelled) setAllDepartements(dataDepts.parents || []);
        }
      } catch (err: unknown) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Erreur de chargement.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    init();
    return () => {
      cancelled = true;
    };
  }, []);

  function showSuccess(msg: string) {
    setSuccessMessage(msg);
    setTimeout(() => setSuccessMessage(null), 4000);
  }

  // Création
  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setActionPending(true);
    setModalError(null);

    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(createForm),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || "Échec de la création de l'utilisateur.");
      }

      setCreateModalOpen(false);
      setCreateForm({ username: "", full_name: "", role: "admin", password: "", departement_ids: [] });
      const msg = data.avertissement
        ? `L'utilisateur "${data.username}" a été créé. Attention : ${data.avertissement}`
        : `L'utilisateur "${data.username}" a été créé avec succès.`;
      showSuccess(msg);
      await loadUsers();
    } catch (err: unknown) {
      setModalError(err instanceof Error ? err.message : "Erreur inattendue.");
    } finally {
      setActionPending(false);
    }
  }

  // Modification
  function openEditModal(user: User) {
    setEditModalUser(user);

    // Résolution : si l'admin avait précédemment un sous-département affecté, on remonte à son parent de niveau 1
    const subToParentMap = new Map<string, string>();
    for (const p of allDepartements) {
      subToParentMap.set(String(p.id), String(p.id));
      if (p.sous_departements) {
        for (const sd of p.sous_departements) {
          subToParentMap.set(String(sd.id), String(p.id));
        }
      }
    }

    const parentIds = Array.from(
      new Set(
        (user.departements || [])
          .map((d) => subToParentMap.get(String(d.id)) || String(d.id))
          .filter((id) => allDepartements.some((p) => String(p.id) === id))
      )
    );

    setEditForm({
      full_name: user.full_name || "",
      role: user.role,
      active: user.active,
      departement_ids: parentIds,
    });
    setModalError(null);
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editModalUser) return;
    setActionPending(true);
    setModalError(null);

    try {
      const res = await fetch(`/api/admin/users/${editModalUser.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editForm),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || "Échec de la mise à jour.");
      }

      setEditModalUser(null);
      const msg = data.avertissement
        ? `L'utilisateur "${data.username}" a été mis à jour. Attention : ${data.avertissement}`
        : `L'utilisateur "${data.username}" a été mis à jour.`;
      showSuccess(msg);
      await loadUsers();
    } catch (err: unknown) {
      setModalError(err instanceof Error ? err.message : "Erreur inattendue.");
    } finally {
      setActionPending(false);
    }
  }

  // Réinitialisation mot de passe
  function openResetPwdModal(user: User) {
    setResetPwdUser(user);
    setNewPassword("");
    setModalError(null);
  }

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault();
    if (!resetPwdUser) return;
    setActionPending(true);
    setModalError(null);

    try {
      const res = await fetch(`/api/admin/users/${resetPwdUser.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: newPassword }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || "Échec de la réinitialisation.");
      }

      setResetPwdUser(null);
      setNewPassword("");
      showSuccess(`Le mot de passe de "${resetPwdUser.username}" a été réinitialisé.`);
    } catch (err: unknown) {
      setModalError(err instanceof Error ? err.message : "Erreur inattendue.");
    } finally {
      setActionPending(false);
    }
  }

  // Suppression
  function openDeleteModal(user: User) {
    setDeleteModalUser(user);
    setModalError(null);
  }

  async function handleDelete() {
    if (!deleteModalUser) return;
    setActionPending(true);
    setModalError(null);

    try {
      const res = await fetch(`/api/admin/users/${deleteModalUser.id}`, {
        method: "DELETE",
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || "Échec de la suppression.");
      }

      showSuccess(`L'utilisateur "${deleteModalUser.username}" a été supprimé.`);
      setDeleteModalUser(null);
      await loadUsers();
    } catch (err: unknown) {
      setModalError(err instanceof Error ? err.message : "Erreur inattendue.");
    } finally {
      setActionPending(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-7xl space-y-6 px-4 py-6 sm:px-6">
      {/* En-tête */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Gestion des comptes</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Gérez les accès utilisateurs, leurs rôles et leurs identifiants.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={loadUsers} disabled={loading} aria-label="Rafraîchir la liste">
            <RefreshCw className={cn("size-4", loading && "animate-spin")} aria-hidden="true" />
            <span className="hidden sm:inline">Actualiser</span>
          </Button>
          <Button
            onClick={() => {
              setModalError(null);
              setCreateForm({
                username: "",
                full_name: "",
                role: "admin",
                password: "",
                departement_ids: [],
              });
              setCreateModalOpen(true);
            }}
          >
            <UserPlus className="size-4" aria-hidden="true" />
            <span>Créer un utilisateur</span>
          </Button>
        </div>
      </div>

      {/* Message de succès */}
      {successMessage && (
        <div
          role="status"
          className="flex items-center gap-2 rounded-md border border-emerald-500/20 bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-400"
        >
          <Check className="size-4 shrink-0" aria-hidden="true" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* Message d'erreur global */}
      {error && (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-md border border-danger/20 bg-danger/10 p-3 text-sm text-danger"
        >
          <AlertCircle className="size-4 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      {/* Tableau des utilisateurs */}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-left text-sm">
            <thead className="bg-muted text-xs text-muted-foreground border-b border-border">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">
                  Identifiant
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Nom complet
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Rôle
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Périmètre (Départements)
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Statut
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Date de création
                </th>
                <th scope="col" className="px-4 py-3 font-medium text-right">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading && users.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                    <Loader2 className="size-5 animate-spin mx-auto mb-2 text-primary" aria-hidden="true" />
                    Chargement des utilisateurs…
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                    Aucun utilisateur trouvé.
                  </td>
                </tr>
              ) : (
                users.map((u) => {
                  const isCurrent = currentUser?.username === u.username;
                  const depts = u.departements || [];
                  return (
                    <tr key={u.id} className="hover:bg-muted/40 transition-colors">
                      <td className="px-4 py-3 font-medium">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs">{u.username}</span>
                          {isCurrent && (
                            <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                              Vous
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{u.full_name || "-"}</td>
                      <td className="px-4 py-3">
                        {u.role === "super_admin" ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                            <ShieldCheck className="size-3.5" aria-hidden="true" />
                            Super Admin
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-foreground">
                            <UserCheck className="size-3.5 text-muted-foreground" aria-hidden="true" />
                            Admin
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {u.role === "super_admin" ? (
                          <span className="inline-flex items-center gap-1 text-muted-foreground font-medium">
                            <ShieldCheck className="size-3.5 text-primary" aria-hidden="true" />
                            Tous les départements
                          </span>
                        ) : depts.length === 0 ? (
                          <span
                            className="inline-flex items-center gap-1 rounded-md bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-400 border border-amber-500/20"
                            title="Cet admin ne possède aucun département affecté : il ne verra aucune donnée"
                          >
                            <AlertTriangle className="size-3 shrink-0" aria-hidden="true" />
                            Aucun département (0)
                          </span>
                        ) : (
                          <div
                            className="inline-flex flex-wrap items-center gap-1.5 cursor-default"
                            title={`Départements autorisés : ${depts.map((d) => d.name).join(", ")}`}
                          >
                            <span className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                              <Building2 className="size-3" aria-hidden="true" />
                              {depts.length === 1 ? depts[0].name : `${depts.length} départements`}
                            </span>
                            {depts.length > 1 && (
                              <span className="text-[11px] text-muted-foreground">
                                ({depts.slice(0, 2).map((d) => d.name).join(", ")}
                                {depts.length > 2 ? "…" : ""})
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {u.active ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                            <span className="size-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
                            Actif
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-danger/10 px-2 py-0.5 text-xs font-medium text-danger">
                            <span className="size-1.5 rounded-full bg-danger" aria-hidden="true" />
                            Inactif
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground tabular-nums">
                        {formatDate(u.created_at)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex items-center gap-1">
                          <Button
                            variant="ghost"
                            className="size-8 p-0"
                            title="Modifier"
                            onClick={() => openEditModal(u)}
                            aria-label={`Modifier l'utilisateur ${u.username}`}
                          >
                            <Edit2 className="size-4" aria-hidden="true" />
                          </Button>
                          <Button
                            variant="ghost"
                            className="size-8 p-0"
                            title="Réinitialiser le mot de passe"
                            onClick={() => openResetPwdModal(u)}
                            aria-label={`Réinitialiser le mot de passe de ${u.username}`}
                          >
                            <KeyRound className="size-4" aria-hidden="true" />
                          </Button>
                          <Button
                            variant="ghost"
                            className="size-8 p-0 text-danger hover:bg-danger/10 hover:text-danger"
                            title="Supprimer"
                            disabled={isCurrent}
                            onClick={() => openDeleteModal(u)}
                            aria-label={`Supprimer l'utilisateur ${u.username}`}
                          >
                            <Trash2 className="size-4" aria-hidden="true" />
                          </Button>
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

      {/* Modal Créer */}
      {createModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-lg border border-border bg-surface p-6 shadow-xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h2 className="text-lg font-semibold tracking-tight flex items-center gap-2">
                <UserPlus className="size-5 text-primary" aria-hidden="true" />
                Créer un utilisateur
              </h2>
              <button
                type="button"
                onClick={() => setCreateModalOpen(false)}
                className="text-muted-foreground hover:text-foreground"
                aria-label="Fermer"
              >
                <X className="size-5" />
              </button>
            </div>

            {modalError && (
              <div
                role="alert"
                className="flex items-center gap-2 rounded-md border border-danger/20 bg-danger/10 p-2.5 text-xs text-danger"
              >
                <AlertCircle className="size-4 shrink-0" aria-hidden="true" />
                <span>{modalError}</span>
              </div>
            )}

            <form onSubmit={handleCreate} className="space-y-4">
              <div className="space-y-1">
                <label htmlFor="create-username" className="text-xs font-medium">
                  Identifiant *
                </label>
                <input
                  id="create-username"
                  required
                  autoFocus
                  value={createForm.username}
                  onChange={(e) => setCreateForm({ ...createForm, username: e.target.value })}
                  placeholder="ex: jdupont"
                  className={fieldClass}
                />
              </div>

              <div className="space-y-1">
                <label htmlFor="create-fullname" className="text-xs font-medium">
                  Nom complet
                </label>
                <input
                  id="create-fullname"
                  value={createForm.full_name}
                  onChange={(e) => setCreateForm({ ...createForm, full_name: e.target.value })}
                  placeholder="ex: Jean Dupont"
                  className={fieldClass}
                />
              </div>

              <div className="space-y-1">
                <label htmlFor="create-role" className="text-xs font-medium">
                  Rôle *
                </label>
                <select
                  id="create-role"
                  value={createForm.role}
                  onChange={(e) => setCreateForm({ ...createForm, role: e.target.value as "admin" | "super_admin" })}
                  className={fieldClass}
                >
                  <option value="admin">Administrateur (Consultation, filtres, exports restreints au périmètre)</option>
                  <option value="super_admin">Super Administrateur (Tous les droits et départements)</option>
                </select>
              </div>

              {/* Périmètre de départements : visible uniquement pour le rôle admin */}
              {createForm.role === "admin" && (
                <DepartementSelector
                  departements={allDepartements}
                  selectedIds={createForm.departement_ids}
                  onChange={(ids) => setCreateForm({ ...createForm, departement_ids: ids })}
                  disabled={actionPending}
                />
              )}

              <div className="space-y-1">
                <label htmlFor="create-password" className="text-xs font-medium">
                  Mot de passe provisoire * (min. 6 caractères)
                </label>
                <input
                  id="create-password"
                  type="password"
                  required
                  minLength={6}
                  value={createForm.password}
                  onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
                  placeholder="••••••••"
                  className={fieldClass}
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
                <Button variant="outline" type="button" onClick={() => setCreateModalOpen(false)}>
                  Annuler
                </Button>
                <Button type="submit" disabled={actionPending}>
                  {actionPending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
                  Créer
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Modifier */}
      {editModalUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-lg border border-border bg-surface p-6 shadow-xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h2 className="text-lg font-semibold tracking-tight flex items-center gap-2">
                <Edit2 className="size-5 text-primary" aria-hidden="true" />
                Modifier l&apos;utilisateur ({editModalUser.username})
              </h2>
              <button
                type="button"
                onClick={() => setEditModalUser(null)}
                className="text-muted-foreground hover:text-foreground"
                aria-label="Fermer"
              >
                <X className="size-5" />
              </button>
            </div>

            {modalError && (
              <div
                role="alert"
                className="flex items-center gap-2 rounded-md border border-danger/20 bg-danger/10 p-2.5 text-xs text-danger"
              >
                <AlertCircle className="size-4 shrink-0" aria-hidden="true" />
                <span>{modalError}</span>
              </div>
            )}

            <form onSubmit={handleEdit} className="space-y-4">
              <div className="space-y-1">
                <label htmlFor="edit-fullname" className="text-xs font-medium">
                  Nom complet
                </label>
                <input
                  id="edit-fullname"
                  value={editForm.full_name}
                  onChange={(e) => setEditForm({ ...editForm, full_name: e.target.value })}
                  placeholder="ex: Jean Dupont"
                  className={fieldClass}
                />
              </div>

              <div className="space-y-1">
                <label htmlFor="edit-role" className="text-xs font-medium">
                  Rôle
                </label>
                <select
                  id="edit-role"
                  value={editForm.role}
                  disabled={currentUser?.username === editModalUser.username}
                  onChange={(e) => setEditForm({ ...editForm, role: e.target.value as "admin" | "super_admin" })}
                  className={fieldClass}
                >
                  <option value="admin">Administrateur</option>
                  <option value="super_admin">Super Administrateur</option>
                </select>
                {currentUser?.username === editModalUser.username && (
                  <p className="text-[11px] text-muted-foreground">
                    Vous ne pouvez pas modifier votre propre rôle.
                  </p>
                )}
              </div>

              {/* Périmètre de départements : visible uniquement pour le rôle admin */}
              {editForm.role === "admin" && (
                <DepartementSelector
                  departements={allDepartements}
                  selectedIds={editForm.departement_ids}
                  onChange={(ids) => setEditForm({ ...editForm, departement_ids: ids })}
                  disabled={actionPending}
                />
              )}

              <div className="flex items-center gap-2 pt-2">
                <input
                  id="edit-active"
                  type="checkbox"
                  checked={editForm.active}
                  disabled={currentUser?.username === editModalUser.username}
                  onChange={(e) => setEditForm({ ...editForm, active: e.target.checked })}
                  className="size-4 rounded border-border text-primary focus:ring-primary"
                />
                <label htmlFor="edit-active" className="text-sm font-medium cursor-pointer">
                  Compte actif
                </label>
              </div>
              {currentUser?.username === editModalUser.username && (
                <p className="text-[11px] text-muted-foreground">
                  Vous ne pouvez pas désactiver votre propre compte.
                </p>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
                <Button variant="outline" type="button" onClick={() => setEditModalUser(null)}>
                  Annuler
                </Button>
                <Button type="submit" disabled={actionPending}>
                  {actionPending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
                  Enregistrer
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Réinitialiser mot de passe */}
      {resetPwdUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-lg border border-border bg-surface p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h2 className="text-lg font-semibold tracking-tight flex items-center gap-2">
                <KeyRound className="size-5 text-primary" aria-hidden="true" />
                Réinitialiser le mot de passe
              </h2>
              <button
                type="button"
                onClick={() => setResetPwdUser(null)}
                className="text-muted-foreground hover:text-foreground"
                aria-label="Fermer"
              >
                <X className="size-5" />
              </button>
            </div>

            <p className="text-sm text-muted-foreground">
              Définissez un nouveau mot de passe pour l&apos;utilisateur{" "}
              <strong className="text-foreground">{resetPwdUser.username}</strong>.
            </p>

            {modalError && (
              <div
                role="alert"
                className="flex items-center gap-2 rounded-md border border-danger/20 bg-danger/10 p-2.5 text-xs text-danger"
              >
                <AlertCircle className="size-4 shrink-0" aria-hidden="true" />
                <span>{modalError}</span>
              </div>
            )}

            <form onSubmit={handleResetPassword} className="space-y-4">
              <div className="space-y-1">
                <label htmlFor="reset-password" className="text-xs font-medium">
                  Nouveau mot de passe * (min. 6 caractères)
                </label>
                <input
                  id="reset-password"
                  type="password"
                  required
                  autoFocus
                  minLength={6}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="••••••••"
                  className={fieldClass}
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
                <Button variant="outline" type="button" onClick={() => setResetPwdUser(null)}>
                  Annuler
                </Button>
                <Button type="submit" disabled={actionPending || newPassword.length < 6}>
                  {actionPending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
                  Mettre à jour
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Supprimer avec confirmation */}
      {deleteModalUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-lg border border-border bg-surface p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h2 className="text-lg font-semibold tracking-tight flex items-center gap-2 text-danger">
                <Trash2 className="size-5" aria-hidden="true" />
                Confirmation de suppression
              </h2>
              <button
                type="button"
                onClick={() => setDeleteModalUser(null)}
                className="text-muted-foreground hover:text-foreground"
                aria-label="Fermer"
              >
                <X className="size-5" />
              </button>
            </div>

            <p className="text-sm text-foreground">
              Êtes-vous sûr de vouloir supprimer définitivement l&apos;utilisateur{" "}
              <strong className="font-mono text-danger">{deleteModalUser.username}</strong> ?
            </p>
            <p className="text-xs text-muted-foreground">
              Cette action est irréversible. L&apos;utilisateur ne pourra plus se connecter au tableau de bord.
            </p>

            {modalError && (
              <div
                role="alert"
                className="flex items-center gap-2 rounded-md border border-danger/20 bg-danger/10 p-2.5 text-xs text-danger"
              >
                <AlertCircle className="size-4 shrink-0" aria-hidden="true" />
                <span>{modalError}</span>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
              <Button variant="outline" type="button" onClick={() => setDeleteModalUser(null)}>
                Annuler
              </Button>
              <Button
                type="button"
                className="bg-danger text-white hover:bg-danger/90"
                onClick={handleDelete}
                disabled={actionPending}
              >
                {actionPending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
                Confirmer la suppression
              </Button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
