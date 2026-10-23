import type { Bounds, Point } from "./geometry";

/** Which part of the Sketch is on screen: the Sketch point at the screen's top-left corner, and the zoom. */
export type Viewport = { readonly x: number; readonly y: number; readonly zoom: number };

export type Size = { readonly width: number; readonly height: number };

export const initialViewport: Viewport = { x: 0, y: 0, zoom: 1 };

/** The Sketch point shown at `screen`, a point in screen pixels. */
export const toSketch = (viewport: Viewport, screen: Point): Point => ({
  x: viewport.x + screen.x / viewport.zoom,
  y: viewport.y + screen.y / viewport.zoom,
});

const minimumZoom = 0.1;

const maximumZoom = 8;

const limitZoom = (zoom: number): number => Math.max(minimumZoom, Math.min(maximumZoom, zoom));

/** Zooms by `factor`, within the zoom limits, keeping the Sketch point shown at `screen` where it is. */
export const zoomAround = (viewport: Viewport, screen: Point, factor: number): Viewport => {
  const zoom = limitZoom(viewport.zoom * factor);
  const anchor = toSketch(viewport, screen);
  return { x: anchor.x - screen.x / zoom, y: anchor.y - screen.y / zoom, zoom };
};

/** Moves the view by `distance` screen pixels, so the Sketch moves the other way. */
export const panBy = (viewport: Viewport, distance: Point): Viewport => ({
  ...viewport,
  ...toSketch(viewport, distance),
});

/**
 * Pans so the Sketch point `grabbed` is shown under the pointer, which is now over the Sketch point `pointer` (in
 * this viewport's Sketch coordinates).
 */
export const keepUnderPointer = (viewport: Viewport, grabbed: Point, pointer: Point): Viewport => ({
  ...viewport,
  x: viewport.x + grabbed.x - pointer.x,
  y: viewport.y + grabbed.y - pointer.y,
});

const centreOf = (screenSize: Size): Point => ({ x: screenSize.width / 2, y: screenSize.height / 2 });

/** Back to 100%, keeping the Sketch point at the centre of the screen where it is. */
export const resetZoom = (viewport: Viewport, screenSize: Size): Viewport =>
  zoomAround(viewport, centreOf(screenSize), 1 / viewport.zoom);

// Space, in screen pixels, kept free around the Shapes when zooming to fit.
const fitMargin = 50;

/** Zooms and pans so that `content` fills the screen, less a margin, and sits at its centre. */
export const fit = (screenSize: Size, content: Bounds): Viewport => {
  const zoom = limitZoom(
    Math.min((screenSize.width - 2 * fitMargin) / content.width, (screenSize.height - 2 * fitMargin) / content.height),
  );
  const centre = centreOf(screenSize);
  return {
    x: content.x + content.width / 2 - centre.x / zoom,
    y: content.y + content.height / 2 - centre.y / zoom,
    zoom,
  };
};
