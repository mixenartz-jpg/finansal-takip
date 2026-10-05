import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// eslint-config-next 16 doğrudan flat config verir. Eski FlatCompat
// köprüsü `plugins.react` döngüsünde JSON.stringify ile çöküyordu.
export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([".next/**", "node_modules/**", "coverage/**", "playwright-report/**", "test-results/**"]),
]);
