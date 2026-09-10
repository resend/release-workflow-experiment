import path from "node:path";
import { tegami } from "tegami";
import { runCli } from "tegami/cli";
import { github } from "tegami/plugins/github";
import { releaseLines, currentBranch } from "./plugins/release-lines.ts";
import { exitPrerelease, exitPrereleaseRequested } from "./plugins/exit-prerelease.ts";

const cwd = path.resolve(import.meta.dirname, "..");
const branch = currentBranch();
const isCanary = branch === "canary";

const paper = tegami({
  cwd,
  packages: () => ({
    prerelease: isCanary ? "canary" : undefined,
  }),
  npm: {
    client: "pnpm",
    updateLockFile: false,
    trustedPublish: { provider: "github", workflow: "publish.yml" },
  },
  plugins: [
    github({
      versionPr:
        branch === "main"
          ? false
          : {
              base: branch,
              branch: `tegami/version-packages-${branch}`,
              create: () => ({
                title: exitPrereleaseRequested() ? "Version Packages (exit prerelease: promotes canary to stable)" : undefined,
              }),
            },
    }),
    releaseLines(branch),
    exitPrerelease(),
  ],
});

await runCli(paper);
