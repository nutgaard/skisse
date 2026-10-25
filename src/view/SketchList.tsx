import { useRef, useState, type ChangeEvent, type KeyboardEvent } from "react";
import { importJson, type ImportedSketch } from "../engine";
import type { SketchEntry, SketchId } from "../store/sketch-store";

type SketchListProps = {
  readonly entries: readonly SketchEntry[];
  readonly openId: SketchId;
  readonly onCreate: () => void;
  /** Gets a Sketch imported from a file, and the file's name without its extension, unless that is blank. */
  readonly onImport: (imported: ImportedSketch, name: string | undefined) => void;
  readonly onOpen: (id: SketchId) => void;
  readonly onRename: (id: SketchId, name: string) => void;
  readonly onDelete: (id: SketchId) => void;
};

// The name field shown while renaming. Enter or leaving the field keeps the new name, Escape keeps the old one.
// It finishes only once, so the blur that can follow Enter or Escape changes nothing.
function RenameField({
  entry,
  onDone,
}: {
  readonly entry: SketchEntry;
  /** Gets the new name, or `undefined` when renaming was cancelled. */
  readonly onDone: (name: string | undefined) => void;
}) {
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
}

// The name of a Sketch imported from the file `fileName`: the file's name without its extension, unless that's blank.
function importedName(fileName: string): string | undefined {
  const name = fileName.replace(/\.json$/i, "").trim();
  return name === "" ? undefined : name;
}

export function SketchList({ entries, openId, onCreate, onImport, onOpen, onRename, onDelete }: SketchListProps) {
  const [expanded, setExpanded] = useState(false);
  const [renaming, setRenaming] = useState<SketchId | undefined>(undefined);
  // Why the last file chosen for import wasn't imported, until another one is chosen or the list is closed.
  const [importError, setImportError] = useState<string | undefined>(undefined);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const openName = entries.find(({ id }) => id === openId)?.name;

  const finishRenaming = (id: SketchId) => (name: string | undefined) => {
    setRenaming(undefined);
    if (name !== undefined) onRename(id, name);
  };

  const confirmDelete = ({ id, name }: SketchEntry) => {
    if (window.confirm(`Delete "${name}"? This can't be undone.`)) onDelete(id);
  };

  const importFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    // Cleared, so choosing the same file again imports it again.
    input.value = "";
    if (!file) return;
    setImportError(undefined);
    const text = await file.text().catch(() => undefined);
    const imported = text === undefined ? { error: "The file couldn't be read." } : importJson(text);
    if ("error" in imported) setImportError(imported.error);
    else onImport(imported, importedName(file.name));
  };

  const toggle = () => {
    setExpanded(!expanded);
    setImportError(undefined);
  };

  return (
    <div className="sketches">
      <div className="sketches-bar">
        <button type="button" aria-expanded={expanded} onClick={toggle}>
          Sketches
        </button>
        <span className="sketch-name">{openName}</span>
      </div>
      {expanded && (
        <div className="sketch-list" role="region" aria-label="Sketch list">
          <div className="sketch-list-actions">
            <button type="button" onClick={onCreate}>
              New sketch
            </button>
            <button type="button" onClick={() => fileInputRef.current?.click()}>
              Import sketch
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              hidden
              onChange={(event) => void importFile(event)}
            />
          </div>
          {importError && (
            <p role="alert" className="sketch-import-error">
              {importError}
            </p>
          )}
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
}
