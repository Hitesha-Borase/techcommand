import { createHash } from "node:crypto";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, relative } from "node:path";

// Identifies application inputs, not a manually maintained release number or a
// pre-commit Git HEAD. Never reads environment files, local data or credentials.
export function telemetryRelease(root) {
  const files = [];
  function visit(path) {
    if (!existsSync(path)) return;
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      if (entry.name.startsWith(".")) continue;
      const file = join(path, entry.name);
      if (entry.isDirectory()) visit(file);
      else if (entry.isFile()) files.push(file);
    }
  }
  for (const directory of ["app", "components", "lib", "worker", "build", "public", "db", "drizzle", "scripts"]) visit(join(root, directory));
  for (const file of ["package.json", "package-lock.json", "vite.config.ts", "next.config.ts", "tsconfig.json", "postcss.config.mjs", ".openai/hosting.json"]) {
    if (existsSync(join(root, file))) files.push(join(root, file));
  }
  const hash = createHash("sha256");
  for (const file of files.sort()) {
    const content = readFileSync(file);
    hash.update(`${relative(root, file)}\0${content.length}\0`); hash.update(content);
  }
  return `source-${hash.digest("hex").slice(0, 24)}`;
}
