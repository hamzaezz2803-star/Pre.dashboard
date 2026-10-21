"use client";

import { Search, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import type { EmployeeSuggestion } from "@/lib/types";
import { fieldClass } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/** Suggestions (emp_code, nom, prénom) lues côté serveur dans v_presence_jour. */
async function searchEmployees(query: string): Promise<EmployeeSuggestion[]> {
  const q = query.trim();
  if (!q) return [];
  try {
    const res = await fetch(`/api/presence/personnel?q=${encodeURIComponent(q)}`);
    if (!res.ok) return [];
    const data: unknown = await res.json();
    return Array.isArray(data) ? (data as EmployeeSuggestion[]) : [];
  } catch {
    return [];
  }
}

interface Props {
  /** Valeur appliquée (issue de l'URL) */
  value: string;
  onCommit: (value: string) => void;
}

export function EmployeeSearch({ value, onCommit }: Props) {
  const listId = useId();
  const [text, setText] = useState(value);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [suggestions, setSuggestions] = useState<EmployeeSuggestion[]>([]);
  const commitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestId = useRef(0);

  // Resynchronise le champ si l'URL change depuis l'extérieur (retour arrière, réinitialisation).
  const [lastValue, setLastValue] = useState(value);
  if (value !== lastValue) {
    setLastValue(value);
    setText(value);
  }

  useEffect(() => {
    return () => {
      if (commitTimer.current) clearTimeout(commitTimer.current);
    };
  }, []);

  function scheduleCommit(next: string) {
    if (commitTimer.current) clearTimeout(commitTimer.current);
    commitTimer.current = setTimeout(() => onCommit(next.trim()), 400);
  }

  function commitNow(next: string) {
    if (commitTimer.current) clearTimeout(commitTimer.current);
    onCommit(next.trim());
  }

  function handleChange(next: string) {
    setText(next);
    setActive(-1);
    scheduleCommit(next);
    const id = ++requestId.current;
    if (!next.trim()) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    searchEmployees(next).then((res) => {
      if (id !== requestId.current) return;
      setSuggestions(res);
      setOpen(res.length > 0);
    });
  }

  function select(s: EmployeeSuggestion) {
    const label = `${s.prenom} ${s.nom}`;
    setText(label);
    setOpen(false);
    setActive(-1);
    commitNow(label);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (suggestions.length) {
        setOpen(true);
        setActive((a) => (a + 1) % suggestions.length);
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (suggestions.length) {
        setActive((a) => (a <= 0 ? suggestions.length - 1 : a - 1));
      }
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (open && active >= 0) select(suggestions[active]);
      else {
        setOpen(false);
        commitNow(text);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div className="relative">
      <Search
        className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden="true"
      />
      <input
        id="filter-search"
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
        autoComplete="off"
        placeholder="Nom, prénom ou identifiant"
        className={cn(fieldClass, "pl-9 pr-9")}
        value={text}
        onChange={(e) => handleChange(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onFocus={() => suggestions.length > 0 && setOpen(true)}
      />
      {text && (
        <button
          type="button"
          aria-label="Effacer la recherche"
          className="absolute right-1.5 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          onClick={() => {
            setText("");
            setSuggestions([]);
            setOpen(false);
            commitNow("");
          }}
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      )}
      {open && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-30 mt-1 max-h-64 w-full overflow-auto rounded-md border border-border bg-surface py-1 shadow-md"
        >
          {suggestions.map((s, i) => (
            <li
              key={s.id}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => {
                e.preventDefault();
                select(s);
              }}
              onMouseEnter={() => setActive(i)}
              className={cn(
                "flex cursor-pointer items-center justify-between px-3 py-2 text-sm",
                i === active && "bg-muted",
              )}
            >
              <span>
                {s.prenom} {s.nom}
              </span>
              <span className="font-mono text-xs text-muted-foreground">{s.id}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
