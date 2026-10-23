import { symbolDefinition, symbolIds, type SymbolId } from "./symbols";

export type Tool = "select" | "pan" | SymbolId;

export type ToolInfo = {
  readonly tool: Tool;
  readonly name: string;
  /** The single key that selects the tool. */
  readonly shortcut: string;
  /** The Symbol the tool draws, for the tools that draw one. */
  readonly symbol?: SymbolId;
};

/** Every tool, in toolbar order: select, pan, then one per Symbol. */
export const tools: readonly ToolInfo[] = [
  { tool: "select", name: "Select", shortcut: "v" },
  { tool: "pan", name: "Pan", shortcut: "h" },
  ...symbolIds.map((id) => ({
    tool: id,
    name: symbolDefinition(id).name,
    shortcut: symbolDefinition(id).shortcut,
    symbol: id,
  })),
];

/** The tool whose shortcut is `key`, ignoring case, so shift and caps lock don't matter. */
export const toolOfShortcut = (key: string): Tool | undefined =>
  tools.find(({ shortcut }) => shortcut === key.toLowerCase())?.tool;
