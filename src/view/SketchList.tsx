import { useRef, useState, type KeyboardEvent } from "react";
import type { SketchEntry, SketchId } from "../store/sketch-store";

type SketchListProps = {
  readonly entries: readonly SketchEntry[];
  readonly openId: SketchId;
  readonly onCreate: () => void;
  readonly onOpen: (id: SketchId) => void;
  readonly onRename: (id: SketchId, name: string) => void;
  readonly onDelete: (id: SketchId) => void;
};

// The name field shown while renaming. Enter or leaving the field keeps the new name, Escape keeps the old one.
// It finishes only once, so the blur that can follow Enter or Escape changes nothing.
const RenameField = ({
  entry,
  onDone,
}: {
  readonly entry: SketchEntry;
  /** Gets the new name, or `undefined` when renaming was cancelled. */
  readonly onDone: (name: string | undefined) => void;
}) => {
  const done = useRef(false);
  const finish = (name: string | undefined) => {
    if (done.current) return;
    done.current = true;
    onDone(name);
  };
  // A blank name keeps the old one.
  const commit = (typed: string) => {
    const name = typed.trim();
    finish(name === "" ? undefined : name);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") commit(event.currentTarget.value);
    if (event.key === "Escape") finish(undefined);
  };
  return (
    <input
      aria-label="Sketch name"
      defaultValue={entry.name}
      autoFocus
      onFocus={(event) => event.currentTarget.select()}
      onKeyDown={onKeyDown}
      onBlur={(event) => commit(event.currentTarget.value)}
    />
  );
};

export const SketchList = ({ entries, openId, onCreate, onOpen, onRename, onDelete }: SketchListProps) => {
  const [expanded, setExpanded] = useState(false);
  const [renaming, setRenaming] = useState<SketchId | undefined>(undefined);
  const openName = entries.find(({ id }) => id === openId)?.name;

  const finishRenaming = (id: SketchId) => (name: string | undefined) => {
    setRenaming(undefined);
    if (name !== undefined) onRename(id, name);
  };

  const confirmDelete = ({ id, name }: SketchEntry) => {
    if (window.confirm(`Delete "${name}"? This can't be undone.`)) onDelete(id);
  };

  return (
    <div className="sketches">
      <div className="sketches-bar">
        <button type="button" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
          Sketches
        </button>
        <span className="sketch-name">{openName}</span>
      </div>
      {expanded && (
        <div className="sketch-list" role="region" aria-label="Sketch list">
          <button type="button" onClick={onCreate}>
            New sketch
          </button>
          <ul>
            {entries.map((entry) => (
              <li key={entry.id} aria-current={entry.id === openId}>
                {renaming === entry.id ? (
                  <RenameField entry={entry} onDone={finishRenaming(entry.id)} />
                ) : (
                  <button type="button" className="sketch-open" onClick={() => onOpen(entry.id)}>
                    {entry.name}
                  </button>
                )}
                <button type="button" aria-label={`Rename ${entry.name}`} onClick={() => setRenaming(entry.id)}>
                  Rename
                </button>
                <button type="button" aria-label={`Delete ${entry.name}`} onClick={() => confirmDelete(entry)}>
                  Delete
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};
