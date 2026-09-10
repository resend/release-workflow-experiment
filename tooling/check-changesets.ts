import { execFileSync } from "node:child_process";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const [base, head] = process.argv.slice(2);

function git(...args: string[]) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

function parse(content: string) {
  const fm = content.split("---")[1] ?? "";
  const bump = fm.match(/npm:release-workflow-experiment:\s*(patch|minor|major)/)?.[1];
  const targets = fm.match(/^backport-to:\s*\[([^\]]*)\]/m)?.[1].split(",").map((s) => s.trim()).filter(Boolean) ?? [];
  return { bump, targets };
}

const files = git("diff", "--name-only", `${base}...${head}`).split("\n").filter(Boolean);
const changesets = files.filter((f) => f.startsWith(".tegami/") && f.endsWith(".md") && !f.endsWith("README.md"));
const codeChanged = files.some((f) => !f.startsWith(".tegami/"));
const errors: string[] = [];

for (const file of changesets) {
  let content: string;
  try {
    content = git("show", `${head}:${file}`);
  } catch {
    continue;
  }
  const { bump, targets } = parse(content);
  if (targets.length === 0) continue;
  if (!codeChanged) errors.push(`${file}: backport-to needs the code change in the same PR, this PR only touches .tegami/`);
  for (const target of targets) {
    const isLine = /^\d+\.\d+$/.test(target);
    const isMajor = /^\d+$/.test(target);
    if (!isLine && !isMajor) errors.push(`${file}: "${target}" is not a release line, use X.Y for a patch or X for a minor`);
    else if (bump === "patch" && !isLine) errors.push(`${file}: a patch can only backport to an X.Y line, got "${target}"`);
    else if (bump === "minor" && !isMajor) errors.push(`${file}: a minor can only backport to a major, got "${target}"`);
    else if (bump === "major") errors.push(`${file}: a major cannot be backported`);
  }
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log(`${changesets.length} changeset(s) checked`);
