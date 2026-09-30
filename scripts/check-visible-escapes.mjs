import fs from "node:fs";
import path from "node:path";

const roots = ["app", "components"];
const extensions = new Set([".js", ".jsx", ".ts", ".tsx"]);
const violations = [];

function walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (extensions.has(path.extname(entry.name))) inspect(full);
  }
}

function inspect(file) {
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
  lines.forEach((line, index) => {
    const stripped = line.replace(/(["'`])(?:\\.|(?!\1).)*\1/g, "");
    if (/\\[nrt]/.test(stripped)) violations.push(`${file}:${index + 1}: ${line.trim()}`);
  });
}

roots.forEach(walk);
if (violations.length) {
  console.error("Visible raw escape sequence detected outside a string:");
  console.error(violations.join("\n"));
  process.exit(1);
}
console.log("UI escape check passed");
