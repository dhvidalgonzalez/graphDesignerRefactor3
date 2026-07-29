import { createContext, useCallback, useContext, useRef, useSyncExternalStore } from "react";

const EditorContext = createContext(null);

export function EditorProvider({ store, children }) {
  return <EditorContext.Provider value={store}>{children}</EditorContext.Provider>;
}

export function useEditorStore() {
  const store = useContext(EditorContext);
  if (!store) throw new Error("useEditorStore debe utilizarse dentro de EditorProvider.");
  return store;
}

export function useEditorActions() {
  return useEditorStore().actions;
}

export function shallowEqual(a, b) {
  if (Object.is(a, b)) return true;
  if (!a || !b || typeof a !== "object" || typeof b !== "object") return false;
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every((key) => Object.is(a[key], b[key]));
}

export function useEditorSelector(selector, equality = Object.is) {
  const store = useEditorStore();
  const selectorRef = useRef(selector);
  const equalityRef = useRef(equality);
  const cacheRef = useRef({ initialized: false, value: undefined });
  selectorRef.current = selector;
  equalityRef.current = equality;

  const getSnapshot = useCallback(() => {
    const next = selectorRef.current(store.getState());
    if (cacheRef.current.initialized && equalityRef.current(cacheRef.current.value, next)) {
      return cacheRef.current.value;
    }
    cacheRef.current = { initialized: true, value: next };
    return next;
  }, [store]);

  return useSyncExternalStore(store.subscribe, getSnapshot, getSnapshot);
}
