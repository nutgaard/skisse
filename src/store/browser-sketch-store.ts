import type { Sketch, Viewport } from "../engine";
import type { SketchEntry, SketchId, SketchStore } from "./sketch-store";

const listKey = "skisse:sketches";
function sketchKey(id: SketchId) {
  return `skisse:sketch:${id}`;
}
function viewportKey(id: SketchId) {
  return `skisse:viewport:${id}`;
}
const lastOpenedKey = "skisse:last-opened";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

// Only a rough check that stored data has the right shape, so data that is damaged or was written by something else
// counts as not there instead of breaking the app at start.
function isSketch(value: unknown): value is Sketch {
  return isObject(value) && isObject(value.shapes);
}

function isViewport(value: unknown): value is Viewport {
  return (
    isObject(value) &&
    Number.isFinite(value.x) &&
    Number.isFinite(value.y) &&
    typeof value.zoom === "number" &&
    Number.isFinite(value.zoom) &&
    value.zoom > 0
  );
}

function isEntryList(value: unknown): value is readonly SketchEntry[] {
  return (
    Array.isArray(value) &&
    value.every((entry) => isObject(entry) && typeof entry.id === "string" && typeof entry.name === "string")
  );
}

// Anything missing or unreadable counts as not there.
function read<T>(key: string, isValid: (value: unknown) => value is T): T | undefined {
  try {
    const text = localStorage.getItem(key);
    const value: unknown = text === null ? undefined : JSON.parse(text);
    return isValid(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

function write(key: string, value: unknown) {
  return localStorage.setItem(key, JSON.stringify(value));
}

// "Sketch 1", "Sketch 2" and so on, skipping names already in the list.
function newName(entries: readonly SketchEntry[], number = entries.length + 1): string {
  return entries.some(({ name }) => name === `Sketch ${number}`) ? newName(entries, number + 1) : `Sketch ${number}`;
}

// `name`, or if a Sketch in the list has it already, "name (2)", "name (3)" and so on.
function freeName(entries: readonly SketchEntry[], name: string, number = 1): string {
  const candidate = number === 1 ? name : `${name} (${number})`;
  return entries.some((entry) => entry.name === candidate) ? freeName(entries, name, number + 1) : candidate;
}

/** A Sketch store on top of the browser's local storage. */
export function browserSketchStore(): SketchStore {
  const list = (): readonly SketchEntry[] => read(listKey, isEntryList) ?? [];
  const exists = (id: SketchId) => list().some((entry) => entry.id === id);
  return {
    list,
    create: (sketch, name) => {
      const entries = list();
      const entry: SketchEntry = { id: crypto.randomUUID(), name: name === undefined ? newName(entries) : freeName(entries, name) };
      write(sketchKey(entry.id), sketch);
      write(listKey, [...entries, entry]);
      return entry;
    },
    load: (id) => (exists(id) ? read(sketchKey(id), isSketch) : undefined),
    save: (id, sketch) => {
      if (exists(id)) write(sketchKey(id), sketch);
    },
    rename: (id, name) => write(listKey, list().map((entry) => (entry.id === id ? { ...entry, name } : entry))),
    loadViewport: (id) => (exists(id) ? read(viewportKey(id), isViewport) : undefined),
    saveViewport: (id, viewport) => {
      if (exists(id)) write(viewportKey(id), viewport);
    },
    delete: (id) => {
      write(listKey, list().filter((entry) => entry.id !== id));
      localStorage.removeItem(sketchKey(id));
      localStorage.removeItem(viewportKey(id));
    },
    lastOpened: () => localStorage.getItem(lastOpenedKey) ?? undefined,
    rememberOpened: (id) => localStorage.setItem(lastOpenedKey, id),
  };
}
