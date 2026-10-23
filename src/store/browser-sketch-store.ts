import type { Sketch } from "../engine";
import type { SketchEntry, SketchId, SketchStore } from "./sketch-store";

const listKey = "skisse:sketches";
const sketchKey = (id: SketchId) => `skisse:sketch:${id}`;
const lastOpenedKey = "skisse:last-opened";

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

// Only a rough check that stored data has the right shape, so data that is damaged or was written by something else
// counts as not there instead of breaking the app at start.
const isSketch = (value: unknown): value is Sketch => isObject(value) && isObject(value.shapes);

const isEntryList = (value: unknown): value is readonly SketchEntry[] =>
  Array.isArray(value) &&
  value.every((entry) => isObject(entry) && typeof entry.id === "string" && typeof entry.name === "string");

// Anything missing or unreadable counts as not there.
const read = <T>(key: string, isValid: (value: unknown) => value is T): T | undefined => {
  try {
    const text = localStorage.getItem(key);
    const value: unknown = text === null ? undefined : JSON.parse(text);
    return isValid(value) ? value : undefined;
  } catch {
    return undefined;
  }
};

const write = (key: string, value: unknown) => localStorage.setItem(key, JSON.stringify(value));

// "Sketch 1", "Sketch 2" and so on, skipping names already in the list.
const newName = (entries: readonly SketchEntry[], number = entries.length + 1): string =>
  entries.some(({ name }) => name === `Sketch ${number}`) ? newName(entries, number + 1) : `Sketch ${number}`;

/** A Sketch store on top of the browser's local storage. */
export const browserSketchStore = (): SketchStore => {
  const list = (): readonly SketchEntry[] => read(listKey, isEntryList) ?? [];
  const exists = (id: SketchId) => list().some((entry) => entry.id === id);
  return {
    list,
    create: (sketch) => {
      const entries = list();
      const entry: SketchEntry = { id: crypto.randomUUID(), name: newName(entries) };
      write(sketchKey(entry.id), sketch);
      write(listKey, [...entries, entry]);
      return entry;
    },
    load: (id) => (exists(id) ? read(sketchKey(id), isSketch) : undefined),
    save: (id, sketch) => {
      if (exists(id)) write(sketchKey(id), sketch);
    },
    rename: (id, name) => write(listKey, list().map((entry) => (entry.id === id ? { ...entry, name } : entry))),
    delete: (id) => {
      write(listKey, list().filter((entry) => entry.id !== id));
      localStorage.removeItem(sketchKey(id));
    },
    lastOpened: () => localStorage.getItem(lastOpenedKey) ?? undefined,
    rememberOpened: (id) => localStorage.setItem(lastOpenedKey, id),
  };
};
