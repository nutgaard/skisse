import type { ReactNode } from "react";

/** One of a few values to choose, as a button: what it shows, such as a short name, and what it does in full. */
export type Choice<T> = { readonly value: T; readonly content: ReactNode; readonly title: string };

type ChoicesProps<T> = {
  readonly choices: readonly Choice<T>[];
  /** The value chosen, or `undefined` when none is, such as when the selected Shapes differ. */
  readonly chosen: T | undefined;
  readonly onChoose: (value: T) => void;
  /** Whether there is nothing to choose for, such as no Label to align with nothing selected. */
  readonly disabled?: boolean;
};

/**
 * A button for each choice. They keep the focus where it is, so they change a Label being edited without finishing the
 * editing.
 */
export function Choices<T extends string>({ choices, chosen, onChoose, disabled = false }: ChoicesProps<T>) {
  return choices.map((choice) => (
    <button
      key={choice.value}
      type="button"
      aria-pressed={choice.value === chosen}
      aria-label={choice.title}
      title={choice.title}
      disabled={disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => onChoose(choice.value)}
    >
      {choice.content}
    </button>
  ));
}
