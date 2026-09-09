/**
 * personLabel.ts — the one place that decides what to call someone we may not
 * name.
 *
 * This was written twice — `labelFor` in memorialArcs.ts and `authorLabel` in
 * webPrayers.ts — with identical logic. Two copies of a privacy fallback is one
 * that can drift, and the drift would be silent: a blank display name rendering
 * as an empty gap where a person's name belongs, on one surface but not the
 * other.
 *
 * The server already decides WHETHER a name may be shown — a label arrives null
 * when the person has not consented to web display or chose anonymity. This
 * decides only how to render the absence.
 */

/** What an unnamed person is called throughout the web surface. */
export const UNNAMED = 'Someone';

/**
 * Render a possibly-absent name.
 *
 * Whitespace counts as absent. A profile whose display_name is "   " must not
 * produce an empty gap where a person's name should be — it is indistinguishable
 * from a rendering bug and reads as one.
 */
export function personLabel(name: string | null | undefined): string {
  const trimmed = name?.trim();
  return trimmed ? trimmed : UNNAMED;
}
