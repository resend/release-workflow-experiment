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
- `tegami pr comment` only runs from a `workflow_run` event, so the preview needs the two-workflow split from tegami's CI docs, not a single job.
- First stable release worked end to end: `1.0.0` on npm as `latest`, GitHub release `release-workflow-experiment@1.0.0`, `release-1` created pointing at `main`. Run: https://github.com/resend/release-workflow-experiment/actions/runs/34522112600
- Registry lag is worse than a minute. `1.1.0-canary.0` was published at 19:49 and the registry's own `time` field says 19:56. Seven minutes where `npm view`, the dist-tags endpoint and the version endpoint all returned 404 while tegami had a 200 from `npm publish`. Anything in our workflow that reads npm right after a publish, the dist-tag rule included, has to tolerate this. We publish with the pnpm client now, which changes nothing about the lag.
- The ruleset lets the app do everything and blocks humans, including me, from pushing to `main`, `canary` and `release-*`. Every fix in this POC went through a PR, which is the process working.

## Scenario 1: normal canary

Done. Two changesets, two Version Packages PRs opened by the app, `1.1.0-canary.0` then `1.1.0-canary.1` on npm under `canary`, `latest` stayed at `1.0.0`. Both consumed changesets were rewritten to replay-only entries. The PR preview comment posts once the preview and comment jobs are split.

- https://github.com/resend/release-workflow-experiment/pull/5
- https://github.com/resend/release-workflow-experiment/pull/8

## Scenario 7: conflict (happened early, out of order)

The first backport attempt, PR 11, conflicted. The fix touched `greet()`, which was added after `1.0.0`, so the hunk has no context on `release-1.0`. That is the RFC's second kind of conflict, a fix that depends on newer canary code. The bot created `release-1.0` locally, failed the cherry-pick, commented on the PR tagging the author with the manual commands, and failed the run. Nothing was pushed to any release branch.

Two things learned:

- The comment told the author to branch from `origin/release-1.0`, which the bot never pushed. The script now pushes a newly created release branch before cherry-picking, so the human has a base even when the pick fails.
- I bundled `RESULTS.md` edits into the fix commit, and that file conflicted too. A commit carrying `backport-to` should contain the fix and its changeset, nothing else. Docs go in their own PR.

Run: https://github.com/resend/release-workflow-experiment/actions/runs/34523858760

## Scenario 2: patch backport before the next stable

Done. PR 14 added a README with a patch changeset and `backport-to: [1.0]`. On merge the Backport workflow cherry-picked it onto `release-1.0`, tegami opened a Version Packages PR there for `1.0.1` with dist-tag `latest`, and merging it published `1.0.1` as `latest` with the GitHub release marked Latest. Canary's own Version Packages PR stayed at `1.1.0-canary.2` and was untouched by any of it.

- The "Re-draft canary" step failed with 403. The app needs the Actions permission to dispatch a workflow. Nothing was lost here because `1.0.1` is below canary, but scenario 5 depends on this step.
- `release-1.0` was created by hand from the `1.0.0` tag, since the ruleset only guards updates. Humans can create `release-*` branches. Whether to add a `creation` rule is an open question, the bot needs to create them too.
- Registry lag again: `1.0.1` took minutes to show under `latest` on the read endpoints.

PRs: https://github.com/resend/release-workflow-experiment/pull/14 and https://github.com/resend/release-workflow-experiment/pull/15. Run: https://github.com/resend/release-workflow-experiment/actions/runs/34524276616

## Scenario 3: exit prerelease

Done, with one retry caused by registry lag. PR 17 carried `exit-prerelease: true`. The Version Packages PR on canary was titled "Version Packages (exit prerelease: promotes canary to stable)" and its lock had `resend:exit-prerelease: requested: true`. Merging it published `1.1.0-canary.3` and the workflow fast-forwarded `main`.

The first run on `main` failed twice over:

- `tegami version` refused to draft because the lock it inherited from canary looked pending. Canary had published `1.1.0-canary.3` a minute earlier, but the registry did not show it yet.
- `tegami publish` then tried to publish `1.1.0-canary.3` again from `main`, for the same reason, and npm rejected the duplicate.

Rerunning the same job once the registry caught up did everything: `tegami version` drafted `1.1.0`, committed "Release 1.1.0 [skip ci]", published it as `latest`, and reset `release-1` to `main`. The fix is `--no-checks` on `main`'s version step. The lock main inherits is canary's and canary is responsible for it. `main` never publishes a prerelease, so the check adds nothing there.

A gap the RFC does not cover: after graduation canary sat at `1.1.0-canary.3` while `main` shipped `1.1.0`. Canary's next changeset would draft `1.1.0-canary.4`, below stable. `main` has to fast-forward canary to its release commit after publishing, so canary's next bump starts from `1.1.0` and drafts `1.2.0-canary.0`. The workflow does that now, with a merge PR as fallback when canary moved in between. For this run I merged `main` into canary by hand with a merge commit.

`main`'s new lock still carries `resend:exit-prerelease: requested: true`, inherited from canary's lock. Harmless, the fast-forward step only runs on canary, but the plugin should reset it.

The stored copy of the changeset in the lock drops the `exit-prerelease` key, as predicted in the RFC. Recording it in the lock at draft time is what made the publish step see it.

PR: https://github.com/resend/release-workflow-experiment/pull/18. Runs: https://github.com/resend/release-workflow-experiment/actions/runs/34524683266 (canary) and https://github.com/resend/release-workflow-experiment/actions/runs/34524720200 (main, second attempt).
