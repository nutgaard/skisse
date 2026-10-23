export const gridSize = 10;

export const snapToGrid = (value: number): number => Math.round(value / gridSize) * gridSize;

// The next grid line from `value` in `direction` (-1 or 1), skipping the line `value` is on.
export const nextGridLine = (value: number, direction: number): number =>
  direction > 0 ? Math.floor(value / gridSize) * gridSize + gridSize : Math.ceil(value / gridSize) * gridSize - gridSize;
