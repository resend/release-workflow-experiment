---
packages:
  npm:release-workflow-experiment:
    replay:
      - exit-prerelease(npm:release-workflow-experiment)
---

### Export the version as a named export too

`require("release-workflow-experiment").version` now works.
