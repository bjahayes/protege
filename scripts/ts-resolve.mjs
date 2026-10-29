// Lets the tests load Protégé's own TypeScript modules, which import each other without the
// ".ts" ending (as the Next build expects): a relative import that doesn't resolve is retried
// with ".ts" added. Used as: node --import ./scripts/ts-resolve.mjs …
import { register } from "node:module";

register("./ts-resolve-hooks.mjs", import.meta.url);
