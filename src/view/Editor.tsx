import { useEffect, useId, useReducer, useRef, type PointerEvent } from "react";
import {
  activeTool,
  canRedo,
  canUndo,
  createEditor,
  currentInteraction,
  gridSize,
  pansOnPress,
  resizeHandles,
  selection,
  shapes,
  sketch,
  update,
  viewport,
  type Dependencies,
  type KeyInput,
  type PointerInput,
  type Size,
  type Sketch,
  type Tool,
  type Viewport,
  type WheelInput,
} from "../engine";
import { useAutosave } from "./autosave";

const tools: readonly { readonly tool: Tool; readonly label: string }[] = [
  { tool: "select", label: "Select" },
  { tool: "pan", label: "Pan" },
  { tool: "rectangle", label: "Rectangle" },
];

const modifiersOf = (event: KeyboardEvent | PointerEvent | WheelEvent) => ({
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

// Pixels per line, for a wheel that scrolls by lines rather than pixels.
const lineHeight = 16;

const wheelInput = (event: WheelEvent, screenSize: Size): WheelInput => {
  const scale =
    event.deltaMode === WheelEvent.DOM_DELTA_LINE
      ? lineHeight
      : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
        ? screenSize.height
        : 1;
  return {
    type: "wheel",
    position: { x: event.clientX, y: event.clientY },
    delta: { x: event.deltaX * scale, y: event.deltaY * scale },
    modifiers: modifiersOf(event),
  };
};

// Safari reports a trackpad pinch as gesture events, with the scale since the pinch started. Other browsers report it
// as a wheel event with ctrl held.
type GestureEvent = UIEvent & { readonly scale: number; readonly clientX: number; readonly clientY: number };

const released: KeyInput = { type: "keyUp", key: " ", modifiers: { shift: false, alt: false, ctrl: false, meta: false } };

// Size, in screen pixels, of the square drawn for each resize handle.
const handleSize = 8;

// Cmd/Ctrl+A is select all in the editor, so the browser must not also select the page's text.
const isSelectAll = (event: KeyboardEvent) => (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "a";

// Keys typed into a text field, such as when renaming a Sketch, are not editor shortcuts.
const isTyping = (event: KeyboardEvent) => event.target instanceof HTMLInputElement;

// Space pans, so it must not also press the focused toolbar button or scroll the page.
const isSpace = (event: KeyboardEvent) => event.key === " ";

// Grid lines closer together than this, in screen pixels, are left out, leaving only every tenth line.
const minimumGridSpacing = 8;

/** The grid, drawn in screen pixels so its lines stay thin at any zoom, lined up with the Sketch's grid. */
const Grid = ({ viewport }: { readonly viewport: Viewport }) => {
  const id = useId();
  const origin = { x: -viewport.x * viewport.zoom, y: -viewport.y * viewport.zoom };
  const steps = [gridSize * viewport.zoom, gridSize * 10 * viewport.zoom].filter((step) => step >= minimumGridSpacing);
  return (
    <>
      <defs>
        {steps.map((step, index) => (
          <pattern
            key={index}
            id={`${id}-${index}`}
            className={index === 0 ? "grid-minor" : "grid-major"}
            x={origin.x}
            y={origin.y}
            width={step}
            height={step}
            patternUnits="userSpaceOnUse"
          >
            <path d={`M 0 0.5 H ${step} M 0.5 0 V ${step}`} />
          </pattern>
        ))}
      </defs>
      {steps.map((_, index) => (
        <rect key={index} width="100%" height="100%" fill={`url(#${id}-${index})`} className="grid" />
      ))}
    </>
  );
};

type EditorProps = {
  readonly deps: Dependencies;
  /** The Sketch to open. A different Sketch needs a new Editor, so its undo history starts afresh. */
  readonly initialSketch: Sketch;
  readonly onSave: (sketch: Sketch) => void;
};

export const Editor = ({ deps, initialSketch, onSave }: EditorProps) => {
  const [state, dispatch] = useReducer(update, undefined, () => createEditor(deps, initialSketch));
  const svgRef = useRef<SVGSVGElement>(null);
  const interaction = currentInteraction(state);
  const selected = new Set(selection(state));
  const view = viewport(state);

  useAutosave(sketch(state), onSave);

  const screenSize = (): Size => {
    const { width, height } = svgRef.current?.getBoundingClientRect() ?? { width: 0, height: 0 };
    return { width, height };
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTyping(event)) return;
      if (isSelectAll(event) || isSpace(event)) event.preventDefault();
      dispatch(keyInput("keyDown", event));
    };
    // Releases still reach the editor, so a modifier let go while typing doesn't stay held.
    const onKeyUp = (event: KeyboardEvent) => {
      if (!isTyping(event) && isSpace(event)) event.preventDefault();
      dispatch(keyInput("keyUp", event));
    };
    // Keys let go while the window is in the background never reach it, so space must not stay held.
    const onBlur = () => dispatch(released);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, []);

  // Wheel and gesture listeners are added directly, as React's are passive and can't stop the browser zooming the page.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    let pinchScale: number | undefined;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      // Safari may also report its pinch as wheel events, which the gesture events already cover.
      if (pinchScale === undefined) dispatch(wheelInput(event, screenSize()));
    };
    const onGestureStart = (event: Event) => {
      event.preventDefault();
      pinchScale = 1;
    };
    const onGestureChange = (event: Event) => {
      event.preventDefault();
      const { scale, clientX, clientY } = event as GestureEvent;
      dispatch({ type: "pinch", position: { x: clientX, y: clientY }, scale: scale / (pinchScale ?? 1) });
      pinchScale = scale;
    };
    const onGestureEnd = (event: Event) => {
      event.preventDefault();
      pinchScale = undefined;
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    svg.addEventListener("gesturestart", onGestureStart);
    svg.addEventListener("gesturechange", onGestureChange);
    svg.addEventListener("gestureend", onGestureEnd);
    return () => {
      svg.removeEventListener("wheel", onWheel);
      svg.removeEventListener("gesturestart", onGestureStart);
      svg.removeEventListener("gesturechange", onGestureChange);
      svg.removeEventListener("gestureend", onGestureEnd);
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
        ref={svgRef}
        className="sketch"
        data-pans={pansOnPress(state) || undefined}
        data-panning={interaction.kind === "panning" || undefined}
        onPointerDown={onPointer("pointerDown")}
        onPointerMove={onPointer("pointerMove")}
        onPointerUp={onPointer("pointerUp")}
        onPointerCancel={onPointer("pointerCancel")}
      >
        <Grid viewport={view} />
        <g transform={`scale(${view.zoom}) translate(${-view.x} ${-view.y})`}>
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
              x={position.x - handleSize / view.zoom / 2}
              y={position.y - handleSize / view.zoom / 2}
              width={handleSize / view.zoom}
              height={handleSize / view.zoom}
              className="resize-handle"
            />
          ))}
          {interaction.kind === "marqueeSelecting" && <rect {...interaction.bounds} className="selection-box" />}
        </g>
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
        <span className="toolbar-separator" />
        <button type="button" onClick={() => dispatch({ type: "zoomToFit", screenSize: screenSize() })}>
          Zoom to fit
        </button>
        <button
          type="button"
          aria-label="Reset zoom to 100%"
          title="Reset zoom to 100%"
          onClick={() => dispatch({ type: "resetZoom", screenSize: screenSize() })}
        >
          {Math.round(view.zoom * 100)}%
        </button>
      </div>
    </>
  );
};
