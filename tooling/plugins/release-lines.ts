import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import * as semver from "semver";
import type { TegamiPlugin } from "tegami";

export function currentBranch(): string {
  if (process.env.GITHUB_BASE_REF) return process.env.GITHUB_BASE_REF;
  if (process.env.GITHUB_REF_NAME) return process.env.GITHUB_REF_NAME;
  return execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], { encoding: "utf8" }).trim();
}

export function npmLatest(name: string): string | undefined {
  try {
    return execFileSync("npm", ["view", name, "dist-tags.latest"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim() || undefined;
  } catch {
    return undefined;
  }
}

export function distTagFor(branch: string, version: string, latest: string | undefined): string {
  if (semver.prerelease(version)) return "canary";
  if (!latest || semver.gt(version, latest)) return "latest";
  return branch;
}

export function githubOutput(key: string, value: string) {
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`);
}

export function releaseLines(branch: string): TegamiPlugin {
  return {
    name: "release-lines",
    init() {
      if (branch !== "main" && branch !== "canary" && !/^release-\d+(\.\d+)?$/.test(branch)) {
        throw new Error(`"${branch}" is not a release line.`);
      }
    },
    initCliDraft(draft) {
      for (const pkg of this.graph.getPackages()) {
        const d = draft.getPackageDraft(pkg.id);
        const next = d?.bumpVersion(pkg);
        if (!d || !next) continue;
        d.npm ??= {};
        d.npm.distTag = distTagFor(branch, next, npmLatest(pkg.name));
      }
    },
    initPublishPlan({ plan }) {
      let tookLatest = false;
      for (const pkg of this.graph.getPackages()) {
        const p = plan.packages.get(pkg.id);
        if (!p?.updated || !pkg.version) continue;
        p.npm ??= {};
        p.npm.distTag = distTagFor(branch, pkg.version, npmLatest(pkg.name));
        if (p.npm.distTag === "latest") tookLatest = true;
      }
      githubOutput("took_latest", String(tookLatest));
    },
  };
}
