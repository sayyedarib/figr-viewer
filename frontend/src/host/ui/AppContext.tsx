import { createContext, useContext, useSyncExternalStore, type ReactNode } from "react";
import { useStore } from "zustand";
import { useShallow } from "zustand/react/shallow";
import type { AppServices } from "../app/services";
import type { AppState } from "../state/types";

const ServicesContext = createContext<AppServices | null>(null);

export function ServicesProvider({ services, children }: { services: AppServices; children: ReactNode }) {
  return <ServicesContext.Provider value={services}>{children}</ServicesContext.Provider>;
}

export function useServices(): AppServices {
  const s = useContext(ServicesContext);
  if (!s) throw new Error("useServices outside ServicesProvider");
  return s;
}

/** Subscribe to a slice of app state. */
export function useAppState<T>(selector: (s: AppState) => T): T {
  return useStore(useServices().store, selector);
}

/** Subscribe to a derived object/array compared shallowly. */
export function useAppShallow<T>(selector: (s: AppState) => T): T {
  return useStore(useServices().store, useShallow(selector));
}

/** Re-render when the dev menu arms a fault, so render-time fault sites fire immediately. */
export function useFaultTick() {
  const { faults } = useServices();
  return useSyncExternalStore(faults.subscribe, faults.getVersion);
}
