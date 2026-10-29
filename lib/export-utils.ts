/** Charge le logo OCP en PNG (data URL) pour l'incruster dans les exports. */
export async function loadLogoPng(): Promise<{ dataUrl: string; width: number; height: number } | null> {
  try {
    const img = new Image();
    img.src = "/assets/logo-ocp-phosboucraa.png";
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0);
    return { dataUrl: canvas.toDataURL("image/png"), width: canvas.width, height: canvas.height };
  } catch {
    return null;
  }
}

/**
 * Libellé des départements concernés par un export, pour les titres et en-têtes.
 *
 * @param noms Départements présents dans les lignes exportées
 * @param perimetre Périmètre de l'admin (null pour un super_admin, accès total)
 * @param max Longueur maximale du libellé (tronqué avec « … » au-delà)
 */
export function libelleDepartements(
  noms: (string | null | undefined)[],
  perimetre?: string[] | null,
  max = 90,
): string {
  const restreint = Array.isArray(perimetre);
  const distincts = [...new Set(noms.map((n) => (n ?? "").trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, "fr"),
  );
  const liste = distincts.length > 0 ? distincts : restreint ? [...(perimetre as string[])] : [];

  // Super_admin sans filtre : inutile de lister tous les départements
  if (!restreint && (liste.length === 0 || liste.length > 5)) return "Tous les départements";
  if (liste.length === 0) return "Aucun département affecté";

  const texte = liste.join(", ");
  return texte.length > max ? `${texte.slice(0, Math.max(0, max - 1)).trimEnd()}…` : texte;
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
