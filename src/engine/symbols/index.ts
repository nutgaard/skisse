import { cloud } from "./cloud";
import { cylinder } from "./cylinder";
import { diamond } from "./diamond";
import { documentSymbol } from "./document";
import { ellipse } from "./ellipse";
import { horizontalCylinder } from "./horizontal-cylinder";
import { person } from "./person";
import { rectangle } from "./rectangle";
import { roundedRectangle } from "./rounded-rectangle";
import type { SymbolDefinition } from "./symbol";
import { text } from "./text";

/**
 * Every Symbol the editor can draw, keyed by Symbol ID, in toolbar order. Adding a Symbol means adding its definition
 * here: the tools, the toolbar and the rest of the editor pick it up from this list.
 */
export const builtInSymbols = {
  rectangle,
  roundedRectangle,
  ellipse,
  diamond,
  cylinder,
  horizontalCylinder,
  document: documentSymbol,
  cloud,
  person,
  text,
} as const satisfies Readonly<Record<string, SymbolDefinition>>;

/** The ID of a Symbol. It is stored with each Shape, so an ID must never change once Sketches use it. */
export type SymbolId = keyof typeof builtInSymbols;

export const symbolIds = Object.keys(builtInSymbols) as readonly SymbolId[];

export const symbolDefinition = (id: SymbolId): SymbolDefinition => builtInSymbols[id];

export type { SymbolDefinition } from "./symbol";
