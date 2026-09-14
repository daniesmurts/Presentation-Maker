// Keeping a slide selection pointing at the slides it was made on.
//
// Slides live as a JSONB array with no stable ids, so a selection is a set
// of INDICES — and the viewer can move, delete and insert slides underneath
// it. Left alone through an edit, a selection still looks right on screen
// while silently addressing different slides: tick 3 and 7, delete slide 5,
// and «Скачать выбранные» hands you slides 3 and 8. So every structural
// edit remaps the set, with exactly the semantics the server applies
// (services/talks.ts's applySlideMove is splice-out-then-splice-in, NOT a
// swap). Written before selection has a UI (TODO A.4, CLAUDE.md §8 step 2):
// it is the same index arithmetic the editor needs.

/** After the slide at `from` is spliced out and re-inserted at `to`. */
export function remapAfterMove(selected: Set<number>, from: number, to: number): Set<number> {
  if (from === to) return selected
  const next = new Set<number>()
  for (const i of selected) {
    if (i === from) { next.add(to); continue }
    // Only the slides BETWEEN the two positions shift, in the direction
    // opposite to the moved slide's travel.
    if (from < to && i > from && i <= to)      next.add(i - 1)
    else if (to < from && i >= to && i < from) next.add(i + 1)
    else                                       next.add(i)
  }
  return next
}

/** After the slide at `removed` is deleted. It leaves the selection with it. */
export function remapAfterDelete(selected: Set<number>, removed: number): Set<number> {
  const next = new Set<number>()
  for (const i of selected) {
    if (i === removed) continue
    next.add(i > removed ? i - 1 : i)
  }
  return next
}

/** After a new slide is inserted directly below `afterIdx`. It starts
 *  unselected — the user chose the slides they had, not this one. */
export function remapAfterInsert(selected: Set<number>, afterIdx: number): Set<number> {
  const next = new Set<number>()
  for (const i of selected) next.add(i > afterIdx ? i + 1 : i)
  return next
}

/** Deck order, 1-based — what the URL and the file name speak. */
export function toSlideNumbers(selected: Set<number>): number[] {
  return [...selected].sort((a, b) => a - b).map((i) => i + 1)
}

/** Everything between two clicks, inclusive — shift-click over a 40-slide
 *  deck instead of forty clicks. */
export function rangeBetween(anchor: number, target: number): number[] {
  const [lo, hi] = anchor <= target ? [anchor, target] : [target, anchor]
  return Array.from({ length: hi - lo + 1 }, (_, k) => lo + k)
}
