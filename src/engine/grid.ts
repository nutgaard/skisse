export const gridSize = 10;

export function snapToGrid(value: number): number {
  return Math.round(value / gridSize) * gridSize;
}

// The next grid line from `value` in `direction` (-1 or 1), skipping the line `value` is on.
export function nextGridLine(value: number, direction: number): number {
  return direction > 0
    ? Math.floor(value / gridSize) * gridSize + gridSize
    : Math.ceil(value / gridSize) * gridSize - gridSize;
}
