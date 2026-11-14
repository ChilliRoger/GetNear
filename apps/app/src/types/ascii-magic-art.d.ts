// ascii-magic-art ships plain ES modules without type declarations.
declare module "ascii-magic-art/runtime/player.js" {
  export function play(
    pre: HTMLElement,
    mod: unknown,
    opts?: { speed?: number; still?: boolean; maxFps?: number; look?: Record<string, unknown> },
  ): () => void;
}
declare module "ascii-magic-art/runtime/canvas.js" {
  export const CELL_W: number;
}
declare module "ascii-magic-art/pieces/harbour-neon-skyline.js" {
  const piece: unknown;
  export default piece;
  export const meta: unknown;
}
