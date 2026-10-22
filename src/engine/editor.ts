export type Point = { readonly x: number; readonly y: number };

export type Bounds = {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
};

export type Modifiers = {
  readonly shift: boolean;
  readonly alt: boolean;
  readonly ctrl: boolean;
  readonly meta: boolean;
};

export type SymbolId = "rectangle";

export type Tool = "select" | SymbolId;

export type PointerInput = {
  readonly type: "pointerDown" | "pointerMove" | "pointerUp";
  readonly position: Point;
  readonly button: number;
  readonly modifiers: Modifiers;
};

export type KeyInput = {
  readonly type: "keyDown" | "keyUp";
  readonly key: string;
  readonly modifiers: Modifiers;
};

export type Input = { readonly type: "selectTool"; readonly tool: Tool } | PointerInput | KeyInput;

export type TextMeasurer = (text: string, fontSize: number) => number;

export type ShapeId = string;

/** Turns the editor's running sequence number into a Shape ID. Must give a different ID for every number. */
export type IdGenerator = (sequence: number) => ShapeId;

export type Dependencies = {
  readonly measureText: TextMeasurer;
  readonly generateId: IdGenerator;
};

export type SymbolShape = {
  readonly id: ShapeId;
  readonly symbol: SymbolId;
  readonly bounds: Bounds;
};

export type Sketch = {
  readonly shapes: Readonly<Record<ShapeId, SymbolShape>>;
};

type Interaction =
  | { readonly kind: "idle" }
  | { readonly kind: "creatingShape"; readonly symbol: SymbolId; readonly origin: Point };

export type EditorState = {
  readonly deps: Dependencies;
  readonly sketch: Sketch;
  readonly tool: Tool;
  readonly interaction: Interaction;
  readonly nextIdSequence: number;
};

export const createEditor = (deps: Dependencies): EditorState => ({
  deps,
  sketch: { shapes: {} },
  tool: "select",
  interaction: { kind: "idle" },
  nextIdSequence: 1,
});

const boundsBetween = (a: Point, b: Point): Bounds => ({
  x: Math.min(a.x, b.x),
  y: Math.min(a.y, b.y),
  width: Math.abs(b.x - a.x),
  height: Math.abs(b.y - a.y),
});

const addShape = (sketch: Sketch, shape: SymbolShape): Sketch => ({
  ...sketch,
  shapes: { ...sketch.shapes, [shape.id]: shape },
});

const createShape = (state: EditorState, symbol: SymbolId, bounds: Bounds): EditorState => {
  const shape: SymbolShape = { id: state.deps.generateId(state.nextIdSequence), symbol, bounds };
  return { ...state, sketch: addShape(state.sketch, shape), nextIdSequence: state.nextIdSequence + 1 };
};

export const update = (state: EditorState, input: Input): EditorState => {
  switch (input.type) {
    case "selectTool":
      return { ...state, tool: input.tool };
    case "pointerDown":
      return state.tool === "select"
        ? state
        : { ...state, interaction: { kind: "creatingShape", symbol: state.tool, origin: input.position } };
    case "pointerMove":
      return state;
    case "pointerUp": {
      if (state.interaction.kind !== "creatingShape") return state;
      const { symbol, origin } = state.interaction;
      const idle: EditorState = { ...state, interaction: { kind: "idle" } };
      return createShape(idle, symbol, boundsBetween(origin, input.position));
    }
    case "keyDown":
    case "keyUp":
      return state;
  }
};
