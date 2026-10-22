export type Point = { readonly x: number; readonly y: number };

export type Modifiers = {
  readonly shift: boolean;
  readonly alt: boolean;
  readonly ctrl: boolean;
  readonly meta: boolean;
};

export type Tool = "select" | "rectangle";

export type Input =
  | { readonly type: "selectTool"; readonly tool: Tool }
  | {
      readonly type: "pointerDown";
      readonly position: Point;
      readonly button: number;
      readonly modifiers: Modifiers;
    }
  | { readonly type: "pointerMove"; readonly position: Point; readonly modifiers: Modifiers }
  | {
      readonly type: "pointerUp";
      readonly position: Point;
      readonly button: number;
      readonly modifiers: Modifiers;
    };

export type TextMeasurer = (text: string, fontSize: number) => number;
export type IdGenerator = () => string;

export type Dependencies = {
  readonly measureText: TextMeasurer;
  readonly generateId: IdGenerator;
};

export type SymbolShape = {
  readonly id: string;
  readonly symbol: "rectangle";
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
};

export type Sketch = {
  readonly shapes: Readonly<Record<string, SymbolShape>>;
};

type Interaction = { readonly kind: "idle" } | { readonly kind: "creatingShape"; readonly origin: Point };

export type EditorState = {
  readonly deps: Dependencies;
  readonly sketch: Sketch;
  readonly tool: Tool;
  readonly interaction: Interaction;
};

export const createEditor = (deps: Dependencies): EditorState => ({
  deps,
  sketch: { shapes: {} },
  tool: "select",
  interaction: { kind: "idle" },
});

const addShape = (sketch: Sketch, shape: SymbolShape): Sketch => ({
  ...sketch,
  shapes: { ...sketch.shapes, [shape.id]: shape },
});

export const update = (state: EditorState, input: Input): EditorState => {
  switch (input.type) {
    case "selectTool":
      return { ...state, tool: input.tool };
    case "pointerDown":
      return state.tool === "rectangle"
        ? { ...state, interaction: { kind: "creatingShape", origin: input.position } }
        : state;
    case "pointerMove":
      return state;
    case "pointerUp": {
      if (state.interaction.kind !== "creatingShape") return state;
      const { origin } = state.interaction;
      const end = input.position;
      const shape: SymbolShape = {
        id: state.deps.generateId(),
        symbol: "rectangle",
        x: Math.min(origin.x, end.x),
        y: Math.min(origin.y, end.y),
        width: Math.abs(end.x - origin.x),
        height: Math.abs(end.y - origin.y),
      };
      return { ...state, sketch: addShape(state.sketch, shape), interaction: { kind: "idle" } };
    }
  }
};
