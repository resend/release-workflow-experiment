import { execFileSync } from "node:child_process";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const [before, after] = process.argv.slice(2);

function git(...args: string[]) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

function gh(...args: string[]) {
  return execFileSync("gh", args, { cwd: root, encoding: "utf8" }).trim();
}

function parse(content: string) {
  const fm = content.split("---")[1] ?? "";
  const bump = fm.match(/npm:release-workflow-experiment:\s*(patch|minor|major)/)?.[1];
  const targets = fm.match(/^backport-to:\s*\[([^\]]*)\]/m)?.[1].split(",").map((s) => s.trim()).filter(Boolean) ?? [];
  return { bump, targets };
}

function branchFor(bump: string | undefined, target: string) {
  const isLine = /^\d+\.\d+$/.test(target);
  if (bump === "patch" && isLine) return `release-${target}`;
  if (bump === "minor" && /^\d+$/.test(target)) return `release-${target}`;
  throw new Error(`${bump} bump cannot backport to ${target}`);
}

function highestTag(target: string) {
  const prefix = `release-workflow-experiment@${target}.`;
  const tags = git("tag", "--list", `${prefix}*`, "--sort=-v:refname").split("\n").filter((t) => t && !t.includes("-", prefix.length));
  if (!tags[0]) throw new Error(`no stable tag matching ${prefix}*`);
  return tags[0];
}

function prFor(sha: string) {
  return gh("pr", "list", "--search", sha, "--state", "merged", "--json", "number,author", "--jq", ".[0] | \"\\(.number) \\(.author.login)\"");
}

if (/^0+$/.test(before)) process.exit(0);
const commits = git("rev-list", "--reverse", `${before}..${after}`).split("\n").filter(Boolean);
let failed = false;

for (const sha of commits) {
  const files = git("diff-tree", "--no-commit-id", "--name-only", "-r", "--diff-filter=A", sha).split("\n").filter(Boolean);
  const changesets = files.filter((f) => f.startsWith(".tegami/") && f.endsWith(".md") && !f.endsWith("README.md"));
  const outsideTegami = files.some((f) => !f.startsWith(".tegami/")) || git("diff-tree", "--no-commit-id", "--name-only", "-r", "--diff-filter=MD", sha).split("\n").some((f) => f && !f.startsWith(".tegami/"));

  for (const file of changesets) {
    const { bump, targets } = parse(git("show", `${sha}:${file}`));
    if (targets.length === 0) continue;
    const [pr, author] = prFor(sha).split(" ");

    if (!outsideTegami) {
      gh("pr", "comment", pr, "--body", `Not backporting ${sha.slice(0, 7)}: this commit only adds a changeset. The code and its changeset must be in the same commit. Cherry-pick both commits by hand onto the release branch.`);
      failed = true;
      continue;
    }

    for (const target of targets) {
      const branch = branchFor(bump, target);
      try {
        git("fetch", "origin", "--tags", "--force");
        const exists = git("ls-remote", "--heads", "origin", branch) !== "";
        if (exists) {
          git("checkout", "-B", branch, `origin/${branch}`);
        } else {
          git("checkout", "-b", branch, /^\d+$/.test(target) ? "origin/main" : highestTag(target));
          git("push", "origin", branch);
        }
        git("cherry-pick", "-x", sha);
        git("push", "origin", branch);
        console.log(`${sha.slice(0, 7)} -> ${branch}`);
      } catch (error) {
        git("cherry-pick", "--abort");
        gh("pr", "comment", pr, "--body", [
          `@${author} backporting ${sha.slice(0, 7)} to \`${branch}\` conflicted. Do it by hand:`,
          "",
          "```",
          `git fetch origin`,
          `git checkout -b backport-${sha.slice(0, 7)} origin/${branch}`,
          `git cherry-pick -x ${sha}`,
          `# resolve, then`,
          `git push -u origin backport-${sha.slice(0, 7)}`,
          `gh pr create --base ${branch}`,
          "```",
        ].join("\n"));
        console.error(`${sha.slice(0, 7)} -> ${branch} conflicted`, error);
        failed = true;
      } finally {
        git("checkout", "--force", after);
      }
    }
  }
}

if (failed) process.exit(1);
