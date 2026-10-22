import type { EditorState } from "./editor";

export type Bounds = {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
};

export type ShapeView = {
  readonly id: string;
  readonly symbol: string;
  readonly bounds: Bounds;
};

export const shapes = (state: EditorState): readonly ShapeView[] =>
  Object.values(state.sketch.shapes).map(({ id, symbol, x, y, width, height }) => ({
    id,
    symbol,
    bounds: { x, y, width, height },
  }));
