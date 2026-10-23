import { useCallback, useEffect, useReducer, useRef, type PointerEvent } from "react";
import {
  activeTool,
  canRedo,
  canUndo,
  createEditor,
  currentInteraction,
  resizeHandles,
  selection,
  shapes,
  sketch,
  update,
  type Dependencies,
  type KeyInput,
  type PointerInput,
  type Sketch,
  type Tool,
} from "../engine";

const tools: readonly { readonly tool: Tool; readonly label: string }[] = [
  { tool: "select", label: "Select" },
  { tool: "rectangle", label: "Rectangle" },
];

const modifiersOf = (event: KeyboardEvent | PointerEvent) => ({
  shift: event.shiftKey,
  alt: event.altKey,
  ctrl: event.ctrlKey,
  meta: event.metaKey,
});

const pointerInput = (type: PointerInput["type"], event: PointerEvent): PointerInput => ({
  type,
  position: { x: event.clientX, y: event.clientY },
  button: event.button,
  modifiers: modifiersOf(event),
});

const keyInput = (type: KeyInput["type"], event: KeyboardEvent): KeyInput => ({
  type,
  key: event.key,
  modifiers: modifiersOf(event),
});

// Size, in screen pixels, of the square drawn for each resize handle.
const handleSize = 8;

// Cmd/Ctrl+A is select all in the editor, so the browser must not also select the page's text.
const isSelectAll = (event: KeyboardEvent) => (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "a";

// Keys typed into a text field, such as when renaming a Sketch, are not editor shortcuts.
const isTyping = (event: KeyboardEvent) => event.target instanceof HTMLInputElement;

// How long, in milliseconds, the Sketch must stay unchanged before it is saved.
const autosaveDelay = 300;

// Saves the Sketch shortly after each change, and straight away when the Editor closes or the page is left, so a
// change made just before is never lost.
const useAutosave = (current: Sketch, save: (sketch: Sketch) => void) => {
  const saved = useRef(current);
  const unsaved = useRef<Sketch | undefined>(undefined);

  const flush = useCallback(() => {
    if (unsaved.current === undefined) return;
    save(unsaved.current);
    saved.current = unsaved.current;
    unsaved.current = undefined;
  }, [save]);

  useEffect(() => {
    unsaved.current = current === saved.current ? undefined : current;
    const timer = setTimeout(flush, autosaveDelay);
    return () => clearTimeout(timer);
  }, [current, flush]);

  useEffect(() => {
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [flush]);
};

type EditorProps = {
  readonly deps: Dependencies;
  /** The Sketch to open. A different Sketch needs a new Editor, so its undo history starts afresh. */
  readonly sketch: Sketch;
  readonly onSave: (sketch: Sketch) => void;
};

export const Editor = ({ deps, sketch: opened, onSave }: EditorProps) => {
  const [state, dispatch] = useReducer(update, undefined, () => createEditor(deps, opened));
  const interaction = currentInteraction(state);
  const selected = new Set(selection(state));

  useAutosave(sketch(state), onSave);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTyping(event)) return;
      if (isSelectAll(event)) event.preventDefault();
      dispatch(keyInput("keyDown", event));
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (!isTyping(event)) dispatch(keyInput("keyUp", event));
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  // Only the first finger or the mouse drives the editor, so a second touch can't take over a gesture.
  const onPointer = (type: PointerInput["type"]) => (event: PointerEvent<SVGSVGElement>) => {
    if (!event.isPrimary) return;
    if (type === "pointerDown") event.currentTarget.setPointerCapture(event.pointerId);
    dispatch(pointerInput(type, event));
  };

  return (
    <>
      <svg
        className="sketch"
        onPointerDown={onPointer("pointerDown")}
        onPointerMove={onPointer("pointerMove")}
        onPointerUp={onPointer("pointerUp")}
        onPointerCancel={onPointer("pointerCancel")}
      >
        {shapes(state).map(({ id, symbol, bounds }) => (
          <rect key={id} data-symbol={symbol} {...bounds} className="shape" />
        ))}
        {interaction.kind === "creatingShape" && (
          <rect data-symbol={interaction.symbol} {...interaction.bounds} className="shape" />
        )}
        {shapes(state)
          .filter(({ id }) => selected.has(id))
          .map(({ id, bounds }) => (
            <rect key={id} data-selected={id} {...bounds} className="selection-outline" />
          ))}
        {resizeHandles(state).map(({ handle, position }) => (
          <rect
            key={handle}
            data-handle={handle}
            x={position.x - handleSize / 2}
            y={position.y - handleSize / 2}
            width={handleSize}
            height={handleSize}
            className="resize-handle"
          />
        ))}
        {interaction.kind === "marqueeSelecting" && <rect {...interaction.bounds} className="selection-box" />}
      </svg>
      <div className="toolbar" role="toolbar">
        {tools.map(({ tool, label }) => (
          <button
            key={tool}
            type="button"
            aria-pressed={activeTool(state) === tool}
            onClick={() => dispatch({ type: "selectTool", tool })}
          >
            {label}
          </button>
        ))}
        <span className="toolbar-separator" />
        <button type="button" disabled={!canUndo(state)} onClick={() => dispatch({ type: "undo" })}>
          Undo
        </button>
        <button type="button" disabled={!canRedo(state)} onClick={() => dispatch({ type: "redo" })}>
          Redo
        </button>
      </div>
    </>
  );
};
