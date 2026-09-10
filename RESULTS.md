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
