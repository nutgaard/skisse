import { useEffect, useReducer, type PointerEvent } from "react";
import {
  activeTool,
  createEditor,
  currentInteraction,
  resizeHandles,
  selection,
  shapes,
  update,
  type Dependencies,
  type KeyInput,
  type PointerInput,
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

export const Editor = ({ deps }: { readonly deps: Dependencies }) => {
  const [state, dispatch] = useReducer(update, deps, createEditor);
  const interaction = currentInteraction(state);
  const selected = new Set(selection(state));

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isSelectAll(event)) event.preventDefault();
      dispatch(keyInput("keyDown", event));
    };
    const onKeyUp = (event: KeyboardEvent) => dispatch(keyInput("keyUp", event));
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  const onPointerDown = (event: PointerEvent<SVGSVGElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    dispatch(pointerInput("pointerDown", event));
  };

  return (
    <>
      <svg
        className="sketch"
        onPointerDown={onPointerDown}
        onPointerMove={(event) => dispatch(pointerInput("pointerMove", event))}
        onPointerUp={(event) => dispatch(pointerInput("pointerUp", event))}
        onPointerCancel={(event) => dispatch(pointerInput("pointerCancel", event))}
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
        {interaction.kind === "selectingBox" && <rect {...interaction.bounds} className="selection-box" />}
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
      </div>
    </>
  );
};
