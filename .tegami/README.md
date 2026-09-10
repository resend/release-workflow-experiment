# Changesets

Every PR that changes what we ship adds one markdown file here. Name it anything, `.md` at the end.

```md
---
packages:
  npm:release-workflow-experiment: patch
---

Fix domain SPF records rejecting CNAME
```

`patch`, `minor` or `major`. The body is the changelog entry.

## Ship it to a stable line now

```yaml
backport-to: [1.0]
```

`1.0` means a patch on the 1.0 line, `1` means a minor on the current major. Several: `[1.0, 0.9]`. The bump type has to match: a patch goes to `X.Y`, a minor goes to `X`.

## Promote canary to stable

```yaml
exit-prerelease: true
```

Everything currently in canary ships as the next stable when the Version Packages PR carrying this is merged.
