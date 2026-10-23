import { useCallback, useState } from "react";
import type { Dependencies, Sketch } from "../engine";
import { deleteSketch, openFirst, openNew, type OpenSketch } from "../store/open-sketch";
import type { SketchStore } from "../store/sketch-store";
import { Editor } from "./Editor";
import { SketchList } from "./SketchList";

type AppProps = {
  readonly deps: Dependencies;
  readonly store: SketchStore;
  readonly openAtStart: OpenSketch;
};

export function App({ deps, store, openAtStart }: AppProps) {
  const [current, setCurrent] = useState(openAtStart);
  const [entries, setEntries] = useState(store.list);
  const openId = current.id;
  const openName = entries.find(({ id }) => id === openId)?.name ?? "Sketch";

  // Shows `next` and the Sketch list as the store now has it.
  const show = (next: OpenSketch) => {
    setCurrent(next);
    setEntries(store.list());
  };

  const onSave = useCallback((sketch: Sketch) => store.save(openId, sketch), [store, openId]);

  return (
    <>
      <Editor key={openId} deps={deps} name={openName} initialSketch={current.sketch} onSave={onSave} />
      <SketchList
        entries={entries}
        openId={openId}
        onCreate={() => show(openNew(store))}
        onOpen={(id) => {
          if (id !== openId) show(openFirst(store, [id]));
        }}
        onRename={(id, name) => {
          store.rename(id, name);
          setEntries(store.list());
        }}
        // The store ignores the closing Editor's last save, so that can't bring a deleted open Sketch back.
        onDelete={(id) => show(deleteSketch(store, id, current))}
      />
    </>
  );
}
