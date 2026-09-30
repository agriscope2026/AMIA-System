import { useCallback, useReducer } from "react";
import type { SetStateAction } from "react";

export type UndoRedoState<T> = {
  past: T[];
  current: T;
  future: T[];
};

export type UndoRedoAction<T> =
  | { type: "set"; value: SetStateAction<T> }
  | { type: "undo" }
  | { type: "redo" };

export function financeGridHistoryReducer<T>(
  state: UndoRedoState<T>,
  action: UndoRedoAction<T>,
): UndoRedoState<T> {
  const limit = 100;
  if (action.type === "undo") {
    if (state.past.length === 0) return state;
    return {
      past: state.past.slice(0, -1),
      current: state.past[state.past.length - 1],
      future: [state.current, ...state.future],
    };
  }
  if (action.type === "redo") {
    if (state.future.length === 0) return state;
    return {
      past: [...state.past, state.current].slice(-limit),
      current: state.future[0],
      future: state.future.slice(1),
    };
  }
  const next = typeof action.value === "function"
    ? (action.value as (previous: T) => T)(state.current)
    : action.value;
  if (Object.is(state.current, next)) return state;
  return {
    past: [...state.past, state.current].slice(-limit),
    current: next,
    future: [],
  };
}

export function useUndoRedo<T>(initialValue: T) {
  const [history, dispatch] = useReducer(financeGridHistoryReducer<T>, {
    past: [],
    current: initialValue,
    future: [],
  });
  const set = useCallback((value: SetStateAction<T>) => dispatch({ type: "set", value }), []);
  const undo = useCallback(() => dispatch({ type: "undo" }), []);
  const redo = useCallback(() => dispatch({ type: "redo" }), []);

  return [history.current, set, undo, redo, history.past.length > 0, history.future.length > 0] as const;
}
