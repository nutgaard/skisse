import { useEffect, useReducer, type PointerEvent } from "react";
import {
  activeTool,
  createEditor,
  currentInteraction,
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

export const Editor = ({ deps }: { readonly deps: Dependencies }) => {
  const [state, dispatch] = useReducer(update, deps, createEditor);
  const interaction = currentInteraction(state);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => dispatch(keyInput("keyDown", event));
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
      >
        {shapes(state).map(({ id, symbol, bounds }) => (
          <rect key={id} data-symbol={symbol} {...bounds} className="shape" />
        ))}
        {interaction.kind === "creatingShape" && (
          <rect data-symbol={interaction.symbol} {...interaction.bounds} className="shape" />
        )}
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
