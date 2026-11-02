/**
 * Moteur de formules des compteurs dynamiques.
 *
 * Interpréteur d'expressions sécurisé : analyse lexicale, analyse syntaxique
 * (arbre d'expression), contrôle des types puis évaluation. Aucune exécution de
 * code : ni `eval`, ni `new Function`, ni SQL construit depuis la formule.
 * Seuls les opérateurs, fonctions et variables déclarés ici sont acceptés.
 *
 * Syntaxe :
 *   - nombres (`12`, `3.5`), variables (`DUREE_TRAVAILLEE_MIN`), parenthèses
 *   - arithmétique : `+ - * /` (et `-` unaire)
 *   - comparaisons : `> < >= <= = == != <>`
 *   - logique : `AND OR NOT`, booléens `TRUE FALSE`
 *   - fonctions : IF, MIN, MAX, ABS, ROUND, FLOOR, CEIL, COALESCE
 * Les noms de variables et de fonctions ne tiennent pas compte de la casse.
 */

// ─── Limites (protection contre les formules abusives) ───────────────────────

export const LIMITES_FORMULE = {
  longueurMax: 2000,
  profondeurMax: 40,
  noeudsMax: 500,
} as const;

// ─── Erreurs ─────────────────────────────────────────────────────────────────

export type CodeErreurFormule =
  | "FORMULE_VIDE"
  | "FORMULE_TROP_LONGUE"
  | "FORMULE_TROP_COMPLEXE"
  | "SYNTAXE"
  | "VARIABLE_INCONNUE"
  | "FONCTION_INCONNUE"
  | "NOMBRE_ARGUMENTS"
  | "TYPE"
  | "DIVISION_PAR_ZERO"
  | "DONNEE_MANQUANTE"
  | "VALEUR_INVALIDE";

export class ErreurFormule extends Error {
  readonly code: CodeErreurFormule;
  /** Position (0-based) dans la formule, si connue. */
  readonly position: number | null;

  constructor(code: CodeErreurFormule, message: string, position: number | null = null) {
    super(message);
    this.name = "ErreurFormule";
    this.code = code;
    this.position = position;
  }
}

// ─── Analyse lexicale ────────────────────────────────────────────────────────

type Jeton =
  | { type: "nombre"; valeur: number; pos: number }
  | { type: "ident"; valeur: string; pos: number }
  | { type: "op"; valeur: string; pos: number }
  | { type: "fin"; pos: number };

const OPERATEURS = [">=", "<=", "==", "!=", "<>", "+", "-", "*", "/", ">", "<", "=", "(", ")", ","];

function analyserJetons(source: string): Jeton[] {
  const jetons: Jeton[] = [];
  let i = 0;

  while (i < source.length) {
    const c = source[i];

    if (/\s/.test(c)) {
      i++;
      continue;
    }

    if (/[0-9.]/.test(c)) {
      const m = /^(\d+(\.\d+)?|\.\d+)/.exec(source.slice(i));
      if (!m) throw new ErreurFormule("SYNTAXE", `Nombre invalide à la position ${i + 1}.`, i);
      jetons.push({ type: "nombre", valeur: Number(m[0]), pos: i });
      i += m[0].length;
      if (i < source.length && /[A-Za-z_0-9.]/.test(source[i])) {
        throw new ErreurFormule("SYNTAXE", `Nombre invalide à la position ${i + 1}.`, i);
      }
      continue;
    }

    if (/[A-Za-z_]/.test(c)) {
      const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(source.slice(i))!;
      jetons.push({ type: "ident", valeur: m[0].toUpperCase(), pos: i });
      i += m[0].length;
      continue;
    }

    const op = OPERATEURS.find((o) => source.startsWith(o, i));
    if (op) {
      jetons.push({ type: "op", valeur: op, pos: i });
      i += op.length;
      continue;
    }

    throw new ErreurFormule("SYNTAXE", `Caractère non autorisé « ${c} » à la position ${i + 1}.`, i);
  }

  jetons.push({ type: "fin", pos: source.length });
  return jetons;
}

// ─── Arbre d'expression ──────────────────────────────────────────────────────

export type Noeud =
  | { type: "nombre"; valeur: number; pos: number }
  | { type: "booleen"; valeur: boolean; pos: number }
  | { type: "variable"; nom: string; pos: number }
  | { type: "unaire"; op: "-" | "NOT"; arg: Noeud; pos: number }
  | { type: "binaire"; op: string; gauche: Noeud; droite: Noeud; pos: number }
  | { type: "appel"; nom: string; args: Noeud[]; pos: number };

// Priorités : OR < AND < comparaisons < + - < * / < unaires
const PRIORITES: Record<string, number> = {
  OR: 1,
  AND: 2,
  "=": 3, "==": 3, "!=": 3, "<>": 3, ">": 3, "<": 3, ">=": 3, "<=": 3,
  "+": 4, "-": 4,
  "*": 5, "/": 5,
};

const COMPARAISONS = new Set(["=", "==", "!=", "<>", ">", "<", ">=", "<="]);

class Analyseur {
  private i = 0;
  private noeuds = 0;
  private readonly jetons: Jeton[];

  constructor(jetons: Jeton[]) {
    this.jetons = jetons;
  }

  analyser(): Noeud {
    const racine = this.expression(0, 0);
    const reste = this.jetons[this.i];
    if (reste.type !== "fin") {
      throw new ErreurFormule("SYNTAXE", `Élément inattendu à la position ${reste.pos + 1}.`, reste.pos);
    }
    return racine;
  }

  private compter(profondeur: number, pos: number) {
    this.noeuds++;
    if (this.noeuds > LIMITES_FORMULE.noeudsMax || profondeur > LIMITES_FORMULE.profondeurMax) {
      throw new ErreurFormule("FORMULE_TROP_COMPLEXE", "La formule est trop complexe.", pos);
    }
  }

  private operateurBinaire(): string | null {
    const j = this.jetons[this.i];
    if (j.type === "op" && j.valeur in PRIORITES) return j.valeur;
    if (j.type === "ident" && (j.valeur === "AND" || j.valeur === "OR")) return j.valeur;
    return null;
  }

  private expression(prioriteMin: number, profondeur: number): Noeud {
    let gauche = this.unaire(profondeur);

    for (;;) {
      const op = this.operateurBinaire();
      if (!op || PRIORITES[op] <= prioriteMin) break;
      const pos = this.jetons[this.i].pos;
      this.i++;
      const droite = this.expression(PRIORITES[op], profondeur + 1);
      this.compter(profondeur, pos);
      gauche = { type: "binaire", op, gauche, droite, pos };
    }

    return gauche;
  }

  private unaire(profondeur: number): Noeud {
    const j = this.jetons[this.i];
    if (j.type === "op" && (j.valeur === "-" || j.valeur === "+")) {
      this.i++;
      const arg = this.unaire(profondeur + 1);
      this.compter(profondeur, j.pos);
      return j.valeur === "-" ? { type: "unaire", op: "-", arg, pos: j.pos } : arg;
    }
    if (j.type === "ident" && j.valeur === "NOT") {
      this.i++;
      // NOT porte sur une comparaison entière : NOT A > 1 ⇔ NOT (A > 1)
      const arg = this.expression(PRIORITES.AND, profondeur + 1);
      this.compter(profondeur, j.pos);
      return { type: "unaire", op: "NOT", arg, pos: j.pos };
    }
    return this.primaire(profondeur);
  }

  private primaire(profondeur: number): Noeud {
    const j = this.jetons[this.i];
    this.compter(profondeur, j.pos);

    if (j.type === "nombre") {
      this.i++;
      return { type: "nombre", valeur: j.valeur, pos: j.pos };
    }

    if (j.type === "op" && j.valeur === "(") {
      this.i++;
      const e = this.expression(0, profondeur + 1);
      this.attendre(")");
      return e;
    }

    if (j.type === "ident") {
      if (j.valeur === "AND" || j.valeur === "OR" || j.valeur === "NOT") {
        throw new ErreurFormule("SYNTAXE", `Opérateur ${j.valeur} mal placé à la position ${j.pos + 1}.`, j.pos);
      }
      this.i++;
      if (j.valeur === "TRUE" || j.valeur === "FALSE") {
        return { type: "booleen", valeur: j.valeur === "TRUE", pos: j.pos };
      }
      const suivant = this.jetons[this.i];
      if (suivant.type === "op" && suivant.valeur === "(") {
        this.i++;
        const args: Noeud[] = [];
        if (!this.estOp(")")) {
          do {
            args.push(this.expression(0, profondeur + 1));
          } while (this.consommer(","));
        }
        this.attendre(")");
        return { type: "appel", nom: j.valeur, args, pos: j.pos };
      }
      return { type: "variable", nom: j.valeur, pos: j.pos };
    }

    if (j.type === "fin") {
      throw new ErreurFormule("SYNTAXE", "La formule est incomplète.", j.pos);
    }
    throw new ErreurFormule("SYNTAXE", `« ${j.valeur} » inattendu à la position ${j.pos + 1}.`, j.pos);
  }

  private estOp(v: string): boolean {
    const j = this.jetons[this.i];
    return j.type === "op" && j.valeur === v;
  }

  private consommer(v: string): boolean {
    if (this.estOp(v)) {
      this.i++;
      return true;
    }
    return false;
  }

  private attendre(v: string) {
    if (!this.consommer(v)) {
      const j = this.jetons[this.i];
      throw new ErreurFormule("SYNTAXE", `« ${v} » attendu à la position ${j.pos + 1}.`, j.pos);
    }
  }
}

// ─── Fonctions autorisées ────────────────────────────────────────────────────

type TypeValeur = "nombre" | "booleen";
type Valeur = number | boolean | null;

interface DefinitionFonction {
  description: string;
  syntaxe: string;
  argsMin: number;
  argsMax: number;
}

/** Catalogue des fonctions, exposé pour l'aide de l'éditeur de formules. */
export const FONCTIONS_FORMULE: Record<string, DefinitionFonction> = {
  IF: { syntaxe: "IF(condition, si_vrai, si_faux)", description: "Renvoie si_vrai quand la condition est vraie, sinon si_faux.", argsMin: 3, argsMax: 3 },
  MIN: { syntaxe: "MIN(a, b, ...)", description: "Plus petite des valeurs.", argsMin: 1, argsMax: 50 },
  MAX: { syntaxe: "MAX(a, b, ...)", description: "Plus grande des valeurs.", argsMin: 1, argsMax: 50 },
  ABS: { syntaxe: "ABS(x)", description: "Valeur absolue.", argsMin: 1, argsMax: 1 },
  ROUND: { syntaxe: "ROUND(x, décimales)", description: "Arrondi au plus proche (0 décimale par défaut).", argsMin: 1, argsMax: 2 },
  FLOOR: { syntaxe: "FLOOR(x)", description: "Arrondi à l'entier inférieur.", argsMin: 1, argsMax: 1 },
  CEIL: { syntaxe: "CEIL(x)", description: "Arrondi à l'entier supérieur.", argsMin: 1, argsMax: 1 },
  COALESCE: { syntaxe: "COALESCE(a, b, ...)", description: "Première valeur disponible (non manquante).", argsMin: 1, argsMax: 50 },
};

// ─── Contrôle des types ──────────────────────────────────────────────────────

function nomType(t: TypeValeur): string {
  return t === "nombre" ? "un nombre" : "une condition (vrai/faux)";
}

function exigerType(attendu: TypeValeur, obtenu: TypeValeur, n: Noeud, contexte: string) {
  if (attendu !== obtenu) {
    throw new ErreurFormule("TYPE", `${contexte} attend ${nomType(attendu)} (position ${n.pos + 1}).`, n.pos);
  }
}

function typer(n: Noeud, variables: ReadonlySet<string>): TypeValeur {
  switch (n.type) {
    case "nombre":
      return "nombre";
    case "booleen":
      return "booleen";
    case "variable":
      if (!variables.has(n.nom)) {
        throw new ErreurFormule("VARIABLE_INCONNUE", `Variable inconnue : ${n.nom} (position ${n.pos + 1}).`, n.pos);
      }
      return "nombre";
    case "unaire": {
      const t = typer(n.arg, variables);
      if (n.op === "-") {
        exigerType("nombre", t, n.arg, "Le signe -");
        return "nombre";
      }
      exigerType("booleen", t, n.arg, "NOT");
      return "booleen";
    }
    case "binaire": {
      const g = typer(n.gauche, variables);
      const d = typer(n.droite, variables);
      if (n.op === "AND" || n.op === "OR") {
        exigerType("booleen", g, n.gauche, n.op);
        exigerType("booleen", d, n.droite, n.op);
        return "booleen";
      }
      if (n.op === "=" || n.op === "==" || n.op === "!=" || n.op === "<>") {
        if (g !== d) {
          throw new ErreurFormule("TYPE", `Comparaison entre types différents (position ${n.pos + 1}).`, n.pos);
        }
        return "booleen";
      }
      exigerType("nombre", g, n.gauche, `L'opérateur ${n.op}`);
      exigerType("nombre", d, n.droite, `L'opérateur ${n.op}`);
      return COMPARAISONS.has(n.op) ? "booleen" : "nombre";
    }
    case "appel": {
      const def = Object.hasOwn(FONCTIONS_FORMULE, n.nom) ? FONCTIONS_FORMULE[n.nom] : null;
      if (!def) {
        throw new ErreurFormule("FONCTION_INCONNUE", `Fonction inconnue : ${n.nom} (position ${n.pos + 1}).`, n.pos);
      }
      if (n.args.length < def.argsMin || n.args.length > def.argsMax) {
        throw new ErreurFormule("NOMBRE_ARGUMENTS", `Nombre d'arguments incorrect pour ${def.syntaxe}.`, n.pos);
      }
      const types = n.args.map((a) => typer(a, variables));
      if (n.nom === "IF") {
        exigerType("booleen", types[0], n.args[0], "La condition de IF");
        if (types[1] !== types[2]) {
          throw new ErreurFormule("TYPE", `Les deux résultats de IF doivent être du même type (position ${n.pos + 1}).`, n.pos);
        }
        return types[1];
      }
      if (n.nom === "COALESCE") {
        types.forEach((t, k) => exigerType(types[0], t, n.args[k], "COALESCE"));
        return types[0];
      }
      types.forEach((t, k) => exigerType("nombre", t, n.args[k], n.nom));
      if (n.nom === "ROUND" && n.args.length === 2) {
        const dec = n.args[1];
        if (dec.type !== "nombre" || !Number.isInteger(dec.valeur) || dec.valeur > 10) {
          throw new ErreurFormule("VALEUR_INVALIDE", "Le nombre de décimales de ROUND doit être un entier entre 0 et 10.", dec.pos);
        }
      }
      return "nombre";
    }
  }
}

function collecterVariables(n: Noeud, acc: Set<string>) {
  switch (n.type) {
    case "variable":
      acc.add(n.nom);
      break;
    case "unaire":
      collecterVariables(n.arg, acc);
      break;
    case "binaire":
      collecterVariables(n.gauche, acc);
      collecterVariables(n.droite, acc);
      break;
    case "appel":
      n.args.forEach((a) => collecterVariables(a, acc));
      break;
  }
}

// ─── Compilation (analyse + contrôle) ────────────────────────────────────────

export interface FormuleCompilee {
  source: string;
  arbre: Noeud;
  /** Variables utilisées par la formule, en majuscules. */
  variables: string[];
}

/**
 * Analyse et contrôle une formule. Lève une ErreurFormule si elle est invalide.
 * @param variablesAutorisees noms des variables connues (insensible à la casse)
 */
export function compilerFormule(source: string, variablesAutorisees: Iterable<string>): FormuleCompilee {
  if (typeof source !== "string" || source.trim() === "") {
    throw new ErreurFormule("FORMULE_VIDE", "La formule est vide.");
  }
  if (source.length > LIMITES_FORMULE.longueurMax) {
    throw new ErreurFormule("FORMULE_TROP_LONGUE", `La formule dépasse ${LIMITES_FORMULE.longueurMax} caractères.`);
  }

  const arbre = new Analyseur(analyserJetons(source)).analyser();
  const autorisees = new Set(Array.from(variablesAutorisees, (v) => v.toUpperCase()));
  const type = typer(arbre, autorisees);
  if (type !== "nombre") {
    throw new ErreurFormule("TYPE", "Le résultat de la formule doit être un nombre. Utilisez IF(condition, 1, 0) pour une condition.");
  }

  const variables = new Set<string>();
  collecterVariables(arbre, variables);
  return { source, arbre, variables: [...variables] };
}

// ─── Évaluation ──────────────────────────────────────────────────────────────

/** Valeurs des variables, clés en majuscules ; `null`/absente = donnée manquante. */
export type ContexteFormule = ReadonlyMap<string, number | null> | Record<string, number | null | undefined>;

function lireVariable(contexte: ContexteFormule, nom: string): number | null {
  let v: unknown;
  if (contexte instanceof Map) {
    v = contexte.get(nom);
  } else if (Object.hasOwn(contexte, nom)) {
    v = (contexte as Record<string, unknown>)[nom];
  }
  if (v === null || v === undefined) return null;
  if (typeof v !== "number" || !Number.isFinite(v)) {
    throw new ErreurFormule("VALEUR_INVALIDE", `Valeur invalide pour la variable ${nom}.`);
  }
  return v;
}

function arrondir(x: number, decimales: number): number {
  const f = 10 ** decimales;
  return Math.sign(x) * Math.round((Math.abs(x) + Number.EPSILON) * f) / f;
}

function evaluerNoeud(n: Noeud, ctx: ContexteFormule, manquantes: Set<string>): Valeur {
  switch (n.type) {
    case "nombre":
    case "booleen":
      return n.valeur;

    case "variable": {
      const v = lireVariable(ctx, n.nom);
      if (v === null) manquantes.add(n.nom);
      return v;
    }

    case "unaire": {
      const v = evaluerNoeud(n.arg, ctx, manquantes);
      if (v === null) return null;
      return n.op === "-" ? -(v as number) : !(v as boolean);
    }

    case "binaire": {
      // AND / OR court-circuités : une donnée manquante ne bloque pas si le résultat est déjà connu
      if (n.op === "AND" || n.op === "OR") {
        const g = evaluerNoeud(n.gauche, ctx, manquantes);
        if (n.op === "AND" && g === false) return false;
        if (n.op === "OR" && g === true) return true;
        const d = evaluerNoeud(n.droite, ctx, manquantes);
        if (n.op === "AND" && d === false) return false;
        if (n.op === "OR" && d === true) return true;
        return g === null || d === null ? null : (d as boolean);
      }

      const g = evaluerNoeud(n.gauche, ctx, manquantes);
      const d = evaluerNoeud(n.droite, ctx, manquantes);
      if (g === null || d === null) return null;

      switch (n.op) {
        case "+": return (g as number) + (d as number);
        case "-": return (g as number) - (d as number);
        case "*": return (g as number) * (d as number);
        case "/":
          if (d === 0) throw new ErreurFormule("DIVISION_PAR_ZERO", `Division par zéro (position ${n.pos + 1}).`, n.pos);
          return (g as number) / (d as number);
        case "=":
        case "==": return g === d;
        case "!=":
        case "<>": return g !== d;
        case ">": return (g as number) > (d as number);
        case "<": return (g as number) < (d as number);
        case ">=": return (g as number) >= (d as number);
        case "<=": return (g as number) <= (d as number);
      }
      throw new ErreurFormule("SYNTAXE", `Opérateur inconnu ${n.op}.`, n.pos);
    }

    case "appel": {
      if (n.nom === "IF") {
        // Seule la branche retenue est évaluée
        const c = evaluerNoeud(n.args[0], ctx, manquantes);
        if (c === null) return null;
        return evaluerNoeud(c ? n.args[1] : n.args[2], ctx, manquantes);
      }
      if (n.nom === "COALESCE") {
        // Les variables manquantes remplacées par une valeur de repli ne sont pas des erreurs
        for (const a of n.args) {
          const local = new Set<string>();
          const v = evaluerNoeud(a, ctx, local);
          if (v !== null) return v;
        }
        n.args.forEach((a) => collecterVariables(a, manquantes));
        return null;
      }

      const args = n.args.map((a) => evaluerNoeud(a, ctx, manquantes));
      if (args.some((a) => a === null)) return null;
      const nums = args as number[];

      switch (n.nom) {
        case "MIN": return Math.min(...nums);
        case "MAX": return Math.max(...nums);
        case "ABS": return Math.abs(nums[0]);
        case "ROUND": return arrondir(nums[0], nums[1] ?? 0);
        case "FLOOR": return Math.floor(nums[0]);
        case "CEIL": return Math.ceil(nums[0]);
      }
      throw new ErreurFormule("FONCTION_INCONNUE", `Fonction inconnue : ${n.nom}.`, n.pos);
    }
  }
}

export type ResultatFormule =
  | { ok: true; valeur: number }
  | { ok: false; code: CodeErreurFormule; message: string; position: number | null; variablesManquantes?: string[] };

/**
 * Évalue une formule compilée. Ne renvoie jamais 0 à la place d'une erreur :
 * une donnée manquante ou une division par zéro donne un résultat `ok: false`.
 */
export function evaluerFormule(formule: FormuleCompilee, contexte: ContexteFormule): ResultatFormule {
  const manquantes = new Set<string>();
  try {
    const v = evaluerNoeud(formule.arbre, contexte, manquantes);
    if (v === null) {
      const liste = [...manquantes].sort();
      return {
        ok: false,
        code: "DONNEE_MANQUANTE",
        message: `Donnée manquante : ${liste.join(", ")}.`,
        position: null,
        variablesManquantes: liste,
      };
    }
    if (typeof v !== "number" || !Number.isFinite(v)) {
      return { ok: false, code: "VALEUR_INVALIDE", message: "Le résultat n'est pas un nombre valide.", position: null };
    }
    return { ok: true, valeur: Object.is(v, -0) ? 0 : v };
  } catch (e) {
    if (e instanceof ErreurFormule) {
      return { ok: false, code: e.code, message: e.message, position: e.position };
    }
    throw e;
  }
}

/**
 * Compile puis évalue une formule en une étape (test de formule avant enregistrement).
 * Ne lève jamais d'exception pour une formule invalide.
 */
export function testerFormule(
  source: string,
  variablesAutorisees: Iterable<string>,
  contexte: ContexteFormule
): ResultatFormule {
  try {
    return evaluerFormule(compilerFormule(source, variablesAutorisees), contexte);
  } catch (e) {
    if (e instanceof ErreurFormule) {
      return { ok: false, code: e.code, message: e.message, position: e.position };
    }
    throw e;
  }
}
