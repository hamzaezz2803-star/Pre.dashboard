"use client";

import { Calendar, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { formatDateFr, isValidISODate, parseISODate, toISODate } from "@/lib/dates";
import { fieldClass } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const MONTH_NAMES = [
  "Janvier",
  "Février",
  "Mars",
  "Avril",
  "Mai",
  "Juin",
  "Juillet",
  "Août",
  "Septembre",
  "Octobre",
  "Novembre",
  "Décembre",
];

const WEEKDAYS = ["Lu", "Ma", "Me", "Je", "Ve", "Sa", "Di"];

interface DatePickerProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  min?: string;
  max?: string;
  placeholder?: string;
  disabled?: boolean;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
}

export function DatePicker({
  id,
  value,
  onChange,
  min,
  max,
  placeholder = "Sélectionner une date",
  disabled = false,
  "aria-invalid": ariaInvalid,
  "aria-describedby": ariaDescribedBy,
}: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const popoverId = useId();

  // Date de référence pour le mois actuellement affiché dans le calendrier
  const initialDate = useMemo(() => {
    return isValidISODate(value) ? parseISODate(value) : new Date();
  }, [value]);

  const [viewYear, setViewYear] = useState<number>(initialDate.getFullYear());
  const [viewMonth, setViewMonth] = useState<number>(initialDate.getMonth());

  const [prevValue, setPrevValue] = useState(value);
  if (value !== prevValue) {
    setPrevValue(value);
    if (isValidISODate(value)) {
      const d = parseISODate(value);
      setViewYear(d.getFullYear());
      setViewMonth(d.getMonth());
    }
  }

  // Fermer le popover au clic à l'extérieur ou touche Escape
  useEffect(() => {
    if (!open) return;

    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  // Navigation mois précédent
  function prevMonth() {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
  }

  // Navigation mois suivant
  function nextMonth() {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
  }

  // Génération de la grille des jours (avec lundi comme premier jour)
  const calendarDays = useMemo(() => {
    const days: Array<{
      date: string;
      dayNumber: number;
      isCurrentMonth: boolean;
      isSelected: boolean;
      isToday: boolean;
      isDisabled: boolean;
    }> = [];

    const todayStr = toISODate(new Date());

    // Premier jour du mois
    const firstDay = new Date(viewYear, viewMonth, 1);
    // getDay(): 0=dimanche, 1=lundi... -> conversion pour que 0=lundi, 6=dimanche
    const startDayIndex = (firstDay.getDay() + 6) % 7;

    // Nombre de jours dans le mois
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

    // Jours du mois précédent pour combler la première semaine
    const daysInPrevMonth = new Date(viewYear, viewMonth, 0).getDate();
    for (let i = startDayIndex - 1; i >= 0; i--) {
      const d = daysInPrevMonth - i;
      const prevDate = new Date(viewYear, viewMonth - 1, d);
      const isoStr = toISODate(prevDate);
      days.push({
        date: isoStr,
        dayNumber: d,
        isCurrentMonth: false,
        isSelected: isoStr === value,
        isToday: isoStr === todayStr,
        isDisabled: Boolean((min && isoStr < min) || (max && isoStr > max)),
      });
    }

    // Jours du mois courant
    for (let d = 1; d <= daysInMonth; d++) {
      const currDate = new Date(viewYear, viewMonth, d);
      const isoStr = toISODate(currDate);
      days.push({
        date: isoStr,
        dayNumber: d,
        isCurrentMonth: true,
        isSelected: isoStr === value,
        isToday: isoStr === todayStr,
        isDisabled: Boolean((min && isoStr < min) || (max && isoStr > max)),
      });
    }

    // Jours du mois suivant pour compléter les 35 ou 42 cellules
    const remaining = (7 - (days.length % 7)) % 7;
    for (let d = 1; d <= remaining; d++) {
      const nextDate = new Date(viewYear, viewMonth + 1, d);
      const isoStr = toISODate(nextDate);
      days.push({
        date: isoStr,
        dayNumber: d,
        isCurrentMonth: false,
        isSelected: isoStr === value,
        isToday: isoStr === todayStr,
        isDisabled: Boolean((min && isoStr < min) || (max && isoStr > max)),
      });
    }

    return days;
  }, [viewYear, viewMonth, value, min, max]);

  function handleSelect(dateStr: string) {
    onChange(dateStr);
    setOpen(false);
  }

  function handleToday() {
    const todayStr = toISODate(new Date());
    if ((min && todayStr < min) || (max && todayStr > max)) return;
    onChange(todayStr);
    const d = parseISODate(todayStr);
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
    setOpen(false);
  }

  return (
    <div ref={containerRef} className="relative w-full">
      {/* Bouton déclencheur simulant l'input */}
      <button
        id={id}
        type="button"
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? popoverId : undefined}
        aria-describedby={ariaDescribedBy}
        onClick={() => setOpen((prev) => !prev)}
        className={cn(
          fieldClass,
          "flex items-center justify-between text-left cursor-pointer transition-all hover:border-primary/50 focus:border-primary",
          ariaInvalid && "border-danger text-danger",
          open && "ring-2 ring-primary border-transparent"
        )}
      >
        <span className="flex items-center gap-2 truncate">
          <Calendar className="size-4 text-primary shrink-0" aria-hidden="true" />
          <span className={cn(value ? "font-medium text-foreground" : "text-muted-foreground")}>
            {value && isValidISODate(value) ? formatDateFr(value) : placeholder}
          </span>
        </span>
        <ChevronDown
          className={cn(
            "size-4 text-muted-foreground transition-transform shrink-0",
            open && "rotate-180 text-primary"
          )}
          aria-hidden="true"
        />
      </button>

      {/* Popover Calendrier Moderne */}
      {open && (
        <div
          id={popoverId}
          role="dialog"
          aria-modal="true"
          aria-label="Sélecteur de date"
          className="absolute left-0 z-50 mt-1.5 w-[290px] rounded-xl border border-border bg-surface p-3 shadow-xl backdrop-blur-md animate-in fade-in zoom-in-95 duration-100"
        >
          {/* En-tête mois / année avec flèches */}
          <div className="flex items-center justify-between pb-2 border-b border-border/60">
            <button
              type="button"
              onClick={prevMonth}
              aria-label="Mois précédent"
              className="flex size-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              <ChevronLeft className="size-4" />
            </button>

            <span className="text-sm font-semibold text-foreground tracking-tight">
              {MONTH_NAMES[viewMonth]} {viewYear}
            </span>

            <button
              type="button"
              onClick={nextMonth}
              aria-label="Mois suivant"
              className="flex size-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>

          {/* Jours de la semaine */}
          <div className="grid grid-cols-7 pt-2.5 pb-1 text-center text-[11px] font-semibold text-muted-foreground/80">
            {WEEKDAYS.map((wd) => (
              <div key={wd} className="py-1">
                {wd}
              </div>
            ))}
          </div>

          {/* Grille des jours */}
          <div className="grid grid-cols-7 gap-1 text-sm">
            {calendarDays.map((cd) => {
              return (
                <button
                  key={cd.date}
                  type="button"
                  disabled={cd.isDisabled}
                  onClick={() => handleSelect(cd.date)}
                  className={cn(
                    "relative flex size-8 items-center justify-center rounded-lg text-xs font-medium transition-all",
                    cd.isCurrentMonth ? "text-foreground" : "text-muted-foreground/35",
                    cd.isDisabled && "opacity-30 cursor-not-allowed hover:bg-transparent",
                    !cd.isDisabled && !cd.isSelected && "hover:bg-muted cursor-pointer active:scale-95",
                    cd.isSelected &&
                      "bg-primary text-primary-foreground font-semibold shadow-xs hover:bg-primary-hover",
                    cd.isToday && !cd.isSelected && "font-bold text-primary ring-1 ring-primary/40"
                  )}
                >
                  {cd.dayNumber}
                  {cd.isToday && !cd.isSelected && (
                    <span className="absolute bottom-1 size-1 rounded-full bg-primary" />
                  )}
                </button>
              );
            })}
          </div>

          {/* Raccourci rapide */}
          <div className="mt-2.5 flex items-center justify-between border-t border-border/60 pt-2 text-xs">
            <button
              type="button"
              onClick={handleToday}
              className="font-medium text-primary hover:text-primary-hover transition-colors"
            >
              Aujourd&apos;hui
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              Fermer
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
