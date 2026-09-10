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

## Scenario 4: patch backport after the next stable

Done. With `latest` at `1.1.0`, PR 21 carried a patch with `backport-to: [1.0]`. The bot cherry-picked it onto the existing `release-1.0`, tegami drafted `1.0.2` with dist-tag `release-1.0`, and publishing left npm's `latest` at `1.1.0`. On npm the dist-tags read `latest: 1.1.0, release-1.0: 1.0.2`, which is the RFC's table row exactly.

Canary at the same time drafted `1.1.1-canary.0` from `1.1.0`, since the changeset was a patch. That is correct and shows the fast-forward of canary after graduation working.

The GitHub release side failed the way the RFC predicted, then failed again in a way it did not:

- tegami created the `1.0.2` release and GitHub marked it Latest, over `1.1.0`.
- Our `gh release edit --latest=false` step ran seconds later and got "release not found". GitHub's release-by-tag lookup lags its own creation. The step now retries for a minute. I restored `1.1.0` as Latest by hand.
- tegami's `GithubRelease` type has `title`, `notes` and `prerelease` only. No `make_latest`. The clean fix is an upstream PR adding it, so the release is created right instead of patched afterwards.

PRs: https://github.com/resend/release-workflow-experiment/pull/21 and https://github.com/resend/release-workflow-experiment/pull/23. Run: https://github.com/resend/release-workflow-experiment/actions/runs/34525386274

## Scenario 5: minor backport that overtakes canary

Done, after two plugin bugs. PR 26 added `shout()` as a minor with `backport-to: [1]`. The bot cherry-picked it onto `release-1`, which sat at `1.1.0`, tegami drafted `1.2.0` as `latest` and it published. Canary at that moment had drafted `1.1.1-canary.1`, tegami's counter-only behaviour for prerelease lines, which would sort below the new stable.

The canary-ahead plugin then did its job on the next canary draft: `1.1.1-canary.0` became `1.3.0-canary.0`, `add-shout.md` was dropped because `1.2.0`'s publish lock lists it as consumed, and `readme-results.md` stayed because `1.2.0` never shipped it. Canary published `1.3.0-canary.0`.

What went wrong on the way:

- `semver.inc(v, "minor", "canary")` ignores the identifier. The first draft was a plain `1.3.0`, tegami read a stable version on a prerelease line as a graduation and replayed every entry into the changelog. It has to be `preminor`.
- `Draft.deleteChangelog` only removes the entry from the draft's map. The package draft keeps its own list, so the dropped entry still rendered. The plugin removes it from both.
- The plugin reads stable versions from git tags, not the registry. Tags are pushed in the same run that publishes, the registry lags by minutes, and this plugin runs seconds after the release branch publishes.
- The "Re-draft canary" dispatch from the release branch still fails with 403. The app needs the Actions permission. I dispatched by hand. Until that permission is added, canary catches up on its next push instead, which leaves a window where a stale canary version PR could be merged.

Runs: https://github.com/resend/release-workflow-experiment/actions/runs/34525958085 (release-1), https://github.com/resend/release-workflow-experiment/actions/runs/34526225115 (canary re-draft), https://github.com/resend/release-workflow-experiment/actions/runs/34526308530 (canary publish)

## Scenario 6: refusals

Done. A check on every PR reads the changesets in the diff and fails with one line per problem:

- PR 31, changeset only: "backport-to needs the code change in the same PR, this PR only touches .tegami/".
- PR 32, patch with `backport-to: [1]`: "a patch can only backport to an X.Y line".
- PR 33, minor with `backport-to: [1.0]`: "a minor can only backport to a major".

I merged PR 31 anyway to test the second line of defense. The Backport workflow refused the commit, commented on the PR, and pushed nothing. The junk changeset it left on canary is removed in this PR.

The check is not a required status in this repo's ruleset. It should be in the real one, so the merge-time refusal only ever fires for commits that reached canary some other way.

PRs: https://github.com/resend/release-workflow-experiment/pull/31, https://github.com/resend/release-workflow-experiment/pull/32, https://github.com/resend/release-workflow-experiment/pull/33. Refusal run: https://github.com/resend/release-workflow-experiment/actions/runs/34526613060

## Scenario 8: direct PR to a release branch

Done. PR 35 was opened straight against `release-1.0` with a patch changeset and no canary involvement. tegami drafted `1.0.3` under the `release-1.0` dist-tag and it published. Canary and `main` never saw it.

What it exposed: release branches run the copy of `publish.yml` and `tooling/` from their own tree. `release-1.0` was cut from the `1.0.0` tag and every fix since then lives on canary only, so its "mark release not latest" step is the old one without the retry, and it failed again. Cherry-picks carry the fix and its changeset, never workflow changes. This is the strongest argument for the RFC's design where the branch file is a five-line caller and the logic lives in public-shared-workflows, referenced by ref. It also means the POC's own release branches will keep running stale tooling for the rest of the scenarios.

PRs: https://github.com/resend/release-workflow-experiment/pull/35 and https://github.com/resend/release-workflow-experiment/pull/37

## Scenario 3 again, with the fixes in

The graduation to `1.3.0` went through in one attempt. Canary published `1.3.0-canary.1`, fast-forwarded `main`, `main` drafted `1.3.0` with `--no-checks`, committed, published as `latest`, reset `release-1`, and fast-forwarded canary to the release commit. All three branches ended on the same commit.

Run: https://github.com/resend/release-workflow-experiment/actions/runs/34527211905

## Scenario 9: stale Version Packages PR

Failed, and the failure is the one the RFC worried about. PR 38 on `release-1.2` was drafted while `latest` was `1.2.0`, so its lock said `latest`. Canary then graduated to `1.3.0`. Merging the stale PR published `1.2.1` as `latest`, on top of `1.3.0`.

The publish-time recompute ran. It asked the npm registry for the current `latest` and the registry still said `1.2.0`, minutes after `1.3.0` was published. So the recompute agreed with the stale lock. Registry lag turned the safety net into a no-op. Repairing it takes a human with npm 2FA running `npm dist-tag add` twice, once to move `latest` back to `1.3.0` and once to put `1.2.1` under `release-1.2`.

The fix: never ask the registry. The highest stable git tag is, by our own rule, what `latest` must point to, and tags are pushed in the same run that publishes. Both the draft-time and publish-time computations now read tags, the same way the canary-ahead plugin already did.

Runs: https://github.com/resend/release-workflow-experiment/actions/runs/34527284031

## Scenario 10: LTS

Done. PR 43 carried a major with `exit-prerelease: true`. Canary drafted `2.0.0-canary.0`, graduated, `main` published `2.0.0` as `latest`, `release-2` was created at that commit, and `release-1` stayed at `1.3.0`. Then PR 44 added a minor with `backport-to: [1]`. The bot cherry-picked it onto `release-1`, tegami drafted `1.4.0` under the `release-1` dist-tag, and it published. `latest` stayed `2.0.0`. Canary drafted `2.1.0-canary.0` and kept `add-mumble.md`, since `1.4.0` is below canary's line and the entry belongs in `2.1.0`'s changelog too.

The GitHub release for `1.4.0` was marked Latest again. `release-1` is frozen at `1.3.0`'s copy of the workflow, where a failed canary dispatch skips the marking step. Same root cause as scenario 8, and it will stay that way for every LTS branch in this repo. In the real design the branch file is a caller and this never happens.

PRs: https://github.com/resend/release-workflow-experiment/pull/43, https://github.com/resend/release-workflow-experiment/pull/44, https://github.com/resend/release-workflow-experiment/pull/46. Runs: https://github.com/resend/release-workflow-experiment/actions/runs/34527644222 (main, 2.0.0), https://github.com/resend/release-workflow-experiment/actions/runs/34527880320 (release-1, 1.4.0)

## What changes in the RFC

All ten scenarios ran against real npm and real GitHub. The model holds. These are the things the RFC has to say differently.

- **Never read the registry for a decision.** It lags publishes by one to seven minutes. The dist-tag rule, the canary-ahead plugin and `main`'s lock check all broke on it. Git tags are pushed in the same run that publishes and are the source of truth for "highest stable".
- **`main` needs three steps the RFC did not list.** Run `tegami version --no-checks` and commit the bump itself, since there is no Version Packages PR there. Then fast-forward canary to the release commit, or canary's next draft sits below stable. The `release-<major>` reset was already in the RFC.
- **Release branches run stale tooling** if the tooling lives in the repo. Every release branch here is frozen at the tooling of the tag it was cut from. The reusable workflow in public-shared-workflows is not a convenience, it is what makes fixes reach `release-1.0` at all.
- **Canary re-draft needs the Actions permission** on the app. Without it, canary catches up only on its next push, and a stale canary version PR could be merged in between.
- **The GitHub Latest release needs `make_latest` at creation**, not a patch afterwards. GitHub's release-by-tag lookup lags creation and the patch step raced it twice. Upstream PR to tegami.
- **Changeset bodies must start with a heading.** A frontmatter-only file is silently ignored. Every template and the agent skill need this.
- **Trusted publishing needs `repository.url`** in every `package.json`, and tegami's `pretrust` does not work with current npm. Set trust up by hand per package until upstream fixes it.
- **Tags are `name@version`.** No option in tegami for npm. Decide at onboarding whether we live with it.
- **Humans can create `release-*` branches.** The ruleset guards updates, not creation. Probably fine, the bot creates them too.
- **The PR changeset check should be a required status.** Then the merge-time refusal is a backstop, not the gate.
- **A `backport-to` commit carries the fix and its changeset only.** Anything else in the commit is a conflict waiting to happen. Docs go in their own PR.

Upstream issues to open on tegami: prerelease line moving past a published stable, `make_latest` on GitHub releases, heading-less changesets ignored silently, `pretrust` and npm 12's `npm trust` syntax, `tagPrefix` for npm.
