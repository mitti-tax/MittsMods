import { createContext, useContext } from "react";
import type { Platform } from "../api/client";

export const PlatformsContext = createContext<Platform[]>([]);

export function usePlatform(id: number | undefined): Platform | undefined {
  return useContext(PlatformsContext).find((p) => p.id === id);
}
