// React viene del UMD cargado desde cdnjs (window.React).
const R = (window as any).React;
export default R;
export const {
  Children, Component, Fragment, StrictMode, Suspense, createContext, createElement, forwardRef, isValidElement, memo,
  useCallback, useContext, useEffect, useId, useLayoutEffect, useMemo, useReducer, useRef, useState, useSyncExternalStore,
  useTransition, useDeferredValue,
} = R;
