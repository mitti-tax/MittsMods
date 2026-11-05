import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The app calls the API by full URL (VITE_API_URL), so the dev server needs no proxy
export default defineConfig({
  plugins: [react()],
  base: "/games/",
});
