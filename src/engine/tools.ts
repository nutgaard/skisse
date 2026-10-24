import type { Path } from "./path";
import { shapeGeometry } from "./shape-geometry";
import { symbolDefinition, symbolIds, type SymbolId } from "./symbols";

export type Tool = "select" | "pan" | "arrow" | SymbolId;

export type ToolInfo = {
  readonly tool: Tool;
  readonly name: string;
  /** The single key that selects the tool. */
  readonly shortcut: string;
  /** The Symbol the tool draws, for the tools that draw one. */
  readonly symbol?: SymbolId;
};

/** Every tool, in toolbar order: select, pan, Arrow, then one per Symbol. */
export const tools: readonly ToolInfo[] = [
  { tool: "select", name: "Select", shortcut: "v" },
  { tool: "pan", name: "Pan", shortcut: "h" },
  { tool: "arrow", name: "Arrow", shortcut: "a" },
  ...symbolIds.map((id) => ({
    tool: id,
    name: symbolDefinition(id).name,
    shortcut: symbolDefinition(id).shortcut,
    symbol: id,
  })),
];

/** The tool whose shortcut is `key`, ignoring case, so shift and caps lock don't matter. */
export function toolOfShortcut(key: string): Tool | undefined {
  return tools.find(({ shortcut }) => shortcut === key.toLowerCase())?.tool;
}

/** The picture for the Symbol's toolbar button, in a `size` square. */
export function symbolIcon(symbol: SymbolId, size: number): Path {
  const definition = symbolDefinition(symbol);
  if (definition.icon) return definition.icon({ x: 0, y: 0, width: size, height: size });
  const { width, height } = definition.defaultSize;
  const scale = size / Math.max(width, height);
  const box = {
    x: (size - width * scale) / 2,
    y: (size - height * scale) / 2,
    width: width * scale,
    height: height * scale,
  };
  return shapeGeometry(symbol, box).lines;
}
