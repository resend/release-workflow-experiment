# POC plan

Prove every flow in the RFC with real npm publishes and real GitHub Actions runs before any of it moves to public-shared-workflows.

RFC: https://app.notion.com/p/resend/3a4c40d6c4ef80a0881af029c3f1ca7f

## What this repo is

A throwaway npm package, `release-workflow-experiment`, with one file that exports its own version. Nothing else. Every scenario below ends in a version on npm and a run in Actions we can link to.

Out of scope for the POC: the GitHub App, org rulesets, other languages. Pushes use a fine-grained PAT stored as a repo secret. The rest is real.

## Layout

The root is the SDK repo. `tooling/` is public-shared-workflows. The root never depends on tegami, the workflows install it inside `tooling/` and point it at the root, the same way the shared workflow will check out public-shared-workflows next to an SDK.

```
index.js            the package, exports its version
package.json        public, no tegami
.tegami/            changesets, publish lock, README.md with the template
.github/workflows/
  publish.yml       push to main, canary, release-*: tegami ci from tooling/, then ff main / reset release-<major> / mark GitHub release not latest
  backport.yml      push to canary: read changesets, refuse, cherry-pick, comment on conflict
  tegami-pr.yml     PR preview comment and the backport-to shape check
tooling/            stand-in for public-shared-workflows
  package.json      tegami pinned exact, own lockfile
  tegami.mts        config, calls the plugins, cwd is the repo root
  plugins/
    release-lines.ts   branch -> prerelease, dist-tag, version PR branch; dist-tag rule
    canary-ahead.ts    bumpVersion override, replay cleanup
    exit-prerelease.ts record in lock at draft, expose at publish
RESULTS.md          one entry per scenario: what happened, links, what broke
```

## Setup

1. `tooling/package.json` with tegami pinned exact. `pnpm install` there.
2. `index.js` exporting the version, `package.json` public, `files` limited to it.
3. npm trusted publishing for this repo, so no `NPM_TOKEN`.
4. `tooling/tegami.mts` with the branch table from tegami's multi-version guide, but `release-*` matched by pattern instead of listed. `cwd` is the repo root.
5. `.tegami/README.md` with the changeset template and the two keys.
6. The three workflows. `publish.yml` lists `main`, `canary`, `release-*`.
7. Package starts at `0.0.0` with a `major` changeset. `main` has no Version Packages PR, so its workflow runs `tegami version`, commits and pushes the bump itself, then `tegami publish`. First push to `main` publishes `1.0.0` as `latest`. Create `canary` from it and make it the default branch.

## Scenarios

Run in this order. Each one has the thing to assert. Write the result in RESULTS.md before moving on.

### 1. Normal canary

Changeset with a minor. Version PR opens on canary. Merge.

Assert: `1.1.0-canary.0` on npm under `canary`, `latest` still `1.0.0`.

Second changeset. Assert `1.1.0-canary.1`.

### 2. Patch backport before the next stable

Changeset, patch, `backport-to: [1.0]`. Merge to canary.

Assert: `release-1.0` created from `v1.0.0`, commit cherry-picked, version PR opened on `release-1.0`. Merge it. `1.0.1` on npm under `latest`. Canary untouched, its version PR unchanged.

### 3. Exit prerelease

Changeset with `exit-prerelease: true`. Merge to canary.

Assert: canary version PR title says it graduates and lists every entry. Lock has the flag. Merge. Canary publishes `1.1.0-canary.2`. `main` fast-forwarded to canary. `main` publishes `1.1.0` as `latest` with no version PR. Changelog on main has every replayed entry once. `release-1` now points at `main`. Next changeset on canary drafts `1.2.0-canary.0`.

### 4. Patch backport after the next stable

Changeset, patch, `backport-to: [1.0]`.

Assert: cherry-picked onto the existing `release-1.0`. `1.0.2` published under the `release-1.0` dist-tag. `latest` still `1.1.0`. GitHub release for `1.0.2` not marked Latest.

### 5. Minor backport that overtakes canary

Canary at `1.2.0-canary.x`. Changeset, minor, `backport-to: [1]`.

Assert: cherry-picked onto `release-1`, which sits at `1.1.0`. `1.2.0` published as `latest`. The release-1 publish dispatches canary's workflow. Canary version PR now says `1.3.0-canary.0`. The backported entry is gone from canary's `.tegami/`. Everything else in canary still there.

### 6. Refusals

- Commit that only adds a changeset with `backport-to`. Assert: refused, comment on the PR, nothing pushed to any release branch.
- PR with a patch and `backport-to: [1]`. Assert: PR check fails before merge.
- PR with a minor and `backport-to: [1.0]`. Assert: same.

### 7. Conflict

Change a line on canary. Then a changeset with `backport-to: [1.0, 1]` touching that same line, where only `release-1.0` conflicts.

Assert: `release-1` gets its cherry-pick. `release-1.0` doesn't. Comment on the merged PR tags the author with the commands. Run is red. Do the manual cherry-pick as a PR against `release-1.0` and confirm the normal flow takes over.

### 8. Direct PR to a release branch

PR against `release-1.0` with a changeset, no canary involved.

Assert: version PR on `release-1.0`, `1.0.3` under `release-1.0`. Nothing on canary or main.

### 9. Stale version PR

Open a version PR on `release-1.0` while its version would take `latest`. Before merging, ship a higher version from canary through exit-prerelease. Then merge the stale PR.

Assert: the lock said `latest`, publish used `release-1.0`. No error.

### 10. LTS

Changeset with a major on canary, then `exit-prerelease`. `main` ships `2.0.0`, `release-2` reset to main.

Then a changeset with `backport-to: [1]`.

Assert: `release-1` is not reset, still at `1.2.0`. `1.3.0` published under `release-1`. `latest` still `2.0.0`. The entry stays on canary since `1.3.0` is below canary's release part, and shows up in the `2.1.0` changelog later.

## What we expect to learn

- Whether the `bumpVersion` override from `initDraft` holds up, or tegami needs a change first.
- Whether `initPublishPlan` is late enough to recompute the dist-tag against live npm.
- Whether the lock survives a fast-forward of `main` cleanly, or `main` needs its own lock handling.
- How the PAT-driven push interacts with `tegami ci` triggering on the release branch.
- Every tegami bug we hit. Each one gets an issue upstream and a line in RESULTS.md.

## Done when

All ten scenarios have an entry in RESULTS.md with links. The plugins directory is ready to be moved as-is into public-shared-workflows.
