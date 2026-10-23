import type { Sketch } from "../engine";
import type { SketchEntry, SketchId, SketchStore } from "./sketch-store";

const listKey = "skisse:sketches";
const sketchKey = (id: SketchId) => `skisse:sketch:${id}`;
const lastOpenedKey = "skisse:last-opened";

// Anything missing or unreadable counts as not there.
const read = <T>(storage: Storage, key: string): T | undefined => {
  try {
    const text = storage.getItem(key);
    return text === null ? undefined : (JSON.parse(text) as T);
  } catch {
    return undefined;
  }
};

const write = (storage: Storage, key: string, value: unknown) => storage.setItem(key, JSON.stringify(value));

// "Sketch 1", "Sketch 2" and so on, skipping names already in the list.
const newName = (entries: readonly SketchEntry[], number = entries.length + 1): string =>
  entries.some(({ name }) => name === `Sketch ${number}`) ? newName(entries, number + 1) : `Sketch ${number}`;

/** A Sketch store on top of the browser's local storage. */
export const browserSketchStore = (storage: Storage = localStorage): SketchStore => {
  const list = (): readonly SketchEntry[] => read<readonly SketchEntry[]>(storage, listKey) ?? [];
  const exists = (id: SketchId) => list().some((entry) => entry.id === id);
  return {
    list,
    create: (sketch) => {
      const entries = list();
      const entry: SketchEntry = { id: crypto.randomUUID(), name: newName(entries) };
      write(storage, sketchKey(entry.id), sketch);
      write(storage, listKey, [...entries, entry]);
      return entry;
    },
    load: (id) => (exists(id) ? read<Sketch>(storage, sketchKey(id)) : undefined),
    save: (id, sketch) => {
      if (exists(id)) write(storage, sketchKey(id), sketch);
    },
    rename: (id, name) =>
      write(storage, listKey, list().map((entry) => (entry.id === id ? { ...entry, name } : entry))),
    delete: (id) => {
      write(storage, listKey, list().filter((entry) => entry.id !== id));
      storage.removeItem(sketchKey(id));
    },
    lastOpened: () => storage.getItem(lastOpenedKey) ?? undefined,
    rememberOpened: (id) => storage.setItem(lastOpenedKey, id),
  };
};
