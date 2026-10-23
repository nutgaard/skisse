import { useCallback, useState } from "react";
import type { Dependencies, Sketch } from "../engine";
import { openFirst, openNewSketch, type OpenSketch } from "../store/open-sketch";
import type { SketchId, SketchStore } from "../store/sketch-store";
import { Editor } from "./Editor";
import { SketchList } from "./SketchList";

type AppProps = {
  readonly deps: Dependencies;
  readonly store: SketchStore;
  /** The Sketch open at start. */
  readonly opened: OpenSketch;
};

export const App = ({ deps, store, opened }: AppProps) => {
  const [open, setOpen] = useState(opened);
  const [entries, setEntries] = useState(store.list);
  const openId = open.id;

  const show = (next: OpenSketch) => {
    setOpen(next);
    setEntries(store.list());
  };

  const onSave = useCallback((sketch: Sketch) => store.save(openId, sketch), [store, openId]);

  // Deleting the open Sketch opens another one. The store ignores the closing Editor's last save, so that can't bring
  // the deleted Sketch back.
  const onDelete = (id: SketchId) => {
    store.delete(id);
    if (id === openId) show(openFirst(store, store.list().map((entry) => entry.id)));
    else setEntries(store.list());
  };

  return (
    <>
      <Editor key={openId} deps={deps} sketch={open.sketch} onSave={onSave} />
      <SketchList
        entries={entries}
        openId={openId}
        onCreate={() => show(openNewSketch(store))}
        onOpen={(id) => {
          if (id !== openId) show(openFirst(store, [id]));
        }}
        onRename={(id, name) => {
          store.rename(id, name);
          setEntries(store.list());
        }}
        onDelete={onDelete}
      />
    </>
  );
};
