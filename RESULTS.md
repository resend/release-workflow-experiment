# Results

## Setup

- A changeset whose body has no heading is silently ignored by tegami. `parseChangelogFile` returns undefined when there are no markdown sections. Every template we hand out needs `## Title` as the first body line. Worth an upstream issue: a frontmatter-only file should either bump with an empty entry or fail loudly.
- `versionPr: false` on `main` means nobody commits the version bump. The workflow runs `tegami version`, commits, pushes with `[skip ci]`, then `tegami publish`.
- The `tegami npm pretrust` flow expects a publish lock to exist locally first, so the first `tegami version` runs on a laptop, not in CI.
- `tegami npm pretrust` calls `npm trust <repo> --file ...`, which is not npm 12's syntax (`npm trust github <package> --repo <repo> --file ...`), and npm 11 has no `trust` command at all. Placeholder publish succeeded, trust setup did not. Upstream issue.
- The placeholder `0.0.0-tegami-trusted-publish-setup` publish takes `latest` on npm even under `--tag temp`. Our dist-tag rule publishes the first real version with `--tag latest`, so it self-heals.
- Trusted publishing with provenance requires `repository.url` in `package.json` to match the repo, or npm returns 422. Every onboarded package needs that field.
- A ruleset bypass actor must be an app installed on the repo or owned by the org. A user-owned app fails validation until installed.
- `tegami pr preview --artifact` and `pr comment` resolve the path against different directories when run with `pnpm --dir`. Use an absolute path.
- tegami tags npm packages as `name@version` (`release-workflow-experiment@1.0.0`) with no option to change it. Our SDKs use `vX.Y.Z` today. Either we accept the new format at onboarding or send a `tagPrefix` option upstream, the composer and go plugins already have one.
- `npm view` lagged about a minute behind the publish. tegami's own status check reads the registry directly and was right. Don't trust `npm view` right after a publish.
- First stable release worked end to end: `1.0.0` on npm as `latest`, GitHub release `release-workflow-experiment@1.0.0`, `release-1` created pointing at `main`. Run: https://github.com/resend/release-workflow-experiment/actions/runs/34522112600
