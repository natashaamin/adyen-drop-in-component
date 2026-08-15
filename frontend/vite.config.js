import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
    plugins: [react()],
    server: {
        // Must match the origin registered as an "Allowed origin" for the
        // Adyen client key, since the Drop-in calls Adyen directly from the browser.
        port: 8080
    }
});
