import { execFileSync } from "node:child_process";
import { rmSync } from "node:fs";
import path from "node:path";
import * as semver from "semver";
import { parse } from "yaml";
import type { TegamiPlugin } from "tegami";

function git(cwd: string, ...args: string[]) {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

function stableTags(cwd: string, name: string) {
  git(cwd, "fetch", "origin", "--tags", "--force", "--quiet");
  return git(cwd, "tag", "--list", `${name}@*`)
    .split("\n")
    .map((tag) => ({ tag, version: tag.slice(name.length + 1) }))
    .filter(({ version }) => semver.valid(version) && !semver.prerelease(version))
    .sort((a, b) => semver.rcompare(a.version, b.version));
}

function consumedChangelogIds(cwd: string, tag: string): string[] {
  try {
    const lock = parse(git(cwd, "show", `${tag}:.tegami/publish-lock.yaml`));
    return (lock["core:packages"] ?? []).flatMap((p: { changelogIds?: string[] }) => p.changelogIds ?? []);
  } catch {
    return [];
  }
}

export function canaryAhead(prerelease: string | undefined): TegamiPlugin {
  return {
    name: "canary-ahead",
    initCliDraft(draft) {
      if (!prerelease) return;
      for (const pkg of this.graph.getPackages()) {
        const d = draft.getPackageDraft(pkg.id);
        const next = d?.bumpVersion(pkg);
        if (!d || !next || !pkg.version) continue;

        const tags = stableTags(this.cwd, pkg.name);
        const highest = tags[0]?.version;
        if (!highest) continue;

        const releasePart = `${semver.major(next)}.${semver.minor(next)}.${semver.patch(next)}`;
        if (semver.gt(releasePart, highest)) continue;

        const bumped = semver.inc(highest, `pre${d.type ?? "patch"}`, prerelease, "0");
        d.bumpVersion = () => bumped ?? undefined;
        d.bumpReasons ??= new Set();
        d.bumpReasons.add(`stable ${highest} is already published, moving past it`);

        const current = `${semver.major(pkg.version)}.${semver.minor(pkg.version)}.${semver.patch(pkg.version)}`;
        for (const { tag, version } of tags) {
          if (semver.lt(version, current)) continue;
          for (const id of consumedChangelogIds(this.cwd, tag)) {
            if (!draft.getChangelog(id)) continue;
            draft.deleteChangelog(id);
            d.changelogs = d.changelogs?.filter((entry) => entry.id !== id);
            rmSync(path.join(this.changelogDir, id), { force: true });
            d.bumpReasons.add(`dropped ${id}, already shipped in ${version}`);
          }
        }
      }
    },
  };
}
