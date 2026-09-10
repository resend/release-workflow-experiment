import { readFileSync } from "node:fs";
import path from "node:path";
import type { TegamiPlugin } from "tegami";
import { githubOutput } from "./release-lines.ts";

const KEY = "exit-prerelease";
const NAMESPACE = "resend:exit-prerelease";

function hasKey(content: string) {
  const fm = content.split("---")[1] ?? "";
  return /^exit-prerelease:\s*true\s*$/m.test(fm);
}

let requested = false;

export function exitPrereleaseRequested() {
  return requested;
}

export function exitPrerelease(): TegamiPlugin {
  return {
    name: KEY,
    initCliDraft(draft) {
      for (const entry of draft.getChangelogs()) {
        const file = path.join(this.changelogDir, entry.filename);
        if (hasKey(readFileSync(file, "utf8"))) requested = true;
      }
    },
    initPublishLock({ lock }) {
      if (requested) lock.write(NAMESPACE, { requested: true });
    },
    initPublishPlan({ lock }) {
      requested = lock.read(NAMESPACE) !== undefined;
    },
    afterPublishAll({ plan }) {
      const published = [...plan.packages.values()].some((p) => p.publishResult?.type === "published");
      githubOutput("exit_prerelease", String(requested && published));
      githubOutput("published", String(published));
    },
  };
}
