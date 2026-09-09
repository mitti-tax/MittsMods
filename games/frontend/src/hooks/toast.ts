import { createContext, useContext } from "react";

export type ToastType = "success" | "error" | "info";

export interface ToastApi {
  showToast: (message: string, type?: ToastType) => void;
}

export const ToastContext = createContext<ToastApi>({ showToast: () => {} });

export function useToast(): ToastApi {
  return useContext(ToastContext);
}
