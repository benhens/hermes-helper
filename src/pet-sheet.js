// The helper's pet sprite sheet, when there is one. null today: the character is the drawn hand.
// Pēteris is having the pet made (inputs/pb-notes-9nov.md note 3). When it arrives, this becomes
//   { ink: 'data:image/webp;base64,…', fill: 'data:image/webp;base64,…' | null }
// built by a script from the source picture (docs/answers/hhtech-pet.md, For builder). The sheet
// uses the petdex layout: 8 columns × 9 rows of 192 × 208 cells, one row per state (SHEET in
// src/character.js). Each picture is a single-colour mask: only its shape (alpha) counts, because
// the page paints it in the person's theme colours.
export const PET_SHEET = null
