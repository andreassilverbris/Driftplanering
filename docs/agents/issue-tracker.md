# Issue tracker: GitHub

Issues and specs for this repo live as GitHub issues in `andreassilverbris/Driftplanering`.

**Which tool to use depends on where the session runs:**

- **Claude Code in the cloud (claude.ai/code):** there is no usable `gh` CLI. Use the GitHub MCP tools
  as mapped in **Cloud sessions: GitHub MCP tools** below. Owner `andreassilverbris`, repo `Driftplanering`.
- **Local (the user's Mac) with `gh` installed:** use the `gh` commands in **Conventions**.

The user is a domain expert (driftplanerare), not a developer: write issue titles and bodies in **Swedish**,
using the vocabulary in `docs/koncept-och-beslut.md`.

## Cloud sessions: GitHub MCP tools

Load the tools with ToolSearch (`select:mcp__github__issue_write,mcp__github__issue_read,...`) before calling them.

| Operation | MCP tool |
|---|---|
| Create an issue | `mcp__github__issue_write` with `method: "create"`, `title`, `body`, `labels` |
| Create as sub-issue | same, plus `parent_issue_number: <parent>` |
| Make an existing issue a sub-issue | `mcp__github__sub_issue_write` with `method: "add"`, `issue_number: <parent>`, `sub_issue_id: <child's database id>` (the `id` from `issue_read`, not the number) |
| Read an issue | `mcp__github__issue_read` with `method: "get"`, then `"get_comments"` |
| Read sub-issues / parent | `mcp__github__issue_read` with `method: "get_sub_issues"` / `"get_parent"` |
| List issues | `mcp__github__list_issues` with `state: "OPEN"` and `labels: [...]` |
| Comment | `mcp__github__add_issue_comment` |
| Set labels | `mcp__github__issue_write` with `method: "update"` and the **complete** `labels` list (it replaces the set, so read the current labels first) |
| Assign | `mcp__github__issue_write` with `method: "update"`, `assignees: [...]` |
| Close | comment first with `add_issue_comment`, then `issue_write` `method: "update"`, `state: "closed"`, `state_reason: "completed"` / `"not_planned"` / `"duplicate"` |
| Search | `gh api -X GET search/issues -f q='repo:andreassilverbris/Driftplanering <terms>'` (the only `gh` use allowed in the cloud) |

**Blocking in the cloud:** the MCP tools cannot set GitHub's native issue dependencies. Put a
`Blocked by: #<n>, #<n>` line at the top of the child body instead. A ticket is unblocked when every issue on
that line is closed (check each with `issue_read`).

**Comment footer:** in cloud sessions, end every issue comment with the footer the session's system prompt asks for.

## Conventions

- **Create an issue**: `gh issue create --title "..." --body "..."`. Use a heredoc for multi-line bodies.
- **Read an issue**: `gh issue view <number> --json number,title,body,labels,comments`.
- **List issues**: `gh issue list --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'` with appropriate `--label` and `--state` filters.
- **Make an issue a sub-issue of a parent**: `gh issue create --parent <parent> ...`, or `gh issue edit <parent> --add-sub-issue <child>` afterwards (`gh` 2.94+). Older `gh`: `gh api --method POST repos/<owner>/<repo>/issues/<parent>/sub_issues -F sub_issue_id=<child-db-id>` (database id, as in **Blocking** below). Without sub-issues, put `Part of #<parent>` at the top of the child body.
- **Blocking**: GitHub's **native issue dependencies**, the canonical, UI-visible representation. Add an edge with `gh issue create --blocked-by <n>,<n> ...` or `gh issue edit <child> --add-blocked-by <blocker>` (`gh` 2.94+). Older `gh`: `gh api --method POST repos/<owner>/<repo>/issues/<child>/dependencies/blocked_by -F issue_id=<blocker-db-id>`, where `<blocker-db-id>` is the blocker's numeric **database id** (`gh api repos/<owner>/<repo>/issues/<n> --jq .id`, _not_ the `#number` or `node_id`). Where dependencies aren't available, fall back to a `Blocked by: #<n>, #<n>` line at the top of the child body. A ticket is unblocked when every blocker is closed.
- **Count open blockers**: `gh api repos/<owner>/<repo>/issues/<n> --jq .issue_dependencies_summary.blocked_by` (open blockers only; 0 means startable). `gh issue view <n> --json blockedBy` also lists closed blockers, so filter it: `--jq '[.blockedBy.nodes[] | select(.state == "OPEN")] | length'`.
- **Comment on an issue**: `gh issue comment <number> --body "..."`
- **Apply / remove labels**: `gh issue edit <number> --add-label "..."` / `--remove-label "..."`
- **Close**: post the explanation with `gh issue comment <number> --body "..."`, then `gh issue close <number>`. On an already-closed issue, `gh issue close --comment` drops the comment and still exits 0.

Infer the repo from `git remote -v`; `gh` does this automatically when run inside a clone.

File issues only into the user's own repo. Never file into `mattpocock/skills` (the repo these skills come from) unless the user owns it. In a fork, `gh` can default to the upstream parent, so before the first `gh issue create` of a session, check the target with `gh repo view --json nameWithOwner` and confirm it with the user if it is not their repo.

## Pull requests as a triage surface

**PRs as a request surface: no.** _(Set to `yes` if this repo treats external PRs as feature requests; `/triage` reads this flag.)_

When set to `yes`, PRs run through the same labels and states as issues, using the `gh pr` equivalents:

- **Read a PR**: `gh pr view <number>`, then `gh pr view <number> --comments` (off a TTY, `--comments` prints only the comments, not the body), and `gh pr diff <number>` for the diff.
- **List external PRs for triage**: `gh api --paginate 'repos/{owner}/{repo}/pulls?state=open' --jq '.[] | select(.author_association | IN("OWNER","MEMBER","COLLABORATOR") | not) | {number, title, author: .user.login, author_association, labels: [.labels[].name]}'`.
- **Comment / label / close**: `gh pr comment`, `gh pr edit --add-label`/`--remove-label`, `gh pr close`.

GitHub shares one number space across issues and PRs, so a bare `#42` may be either: resolve with `gh pr view 42` and fall back to `gh issue view 42`.

## When a skill says "publish to the issue tracker"

Create a GitHub issue.

## When a skill says "fetch the relevant ticket"

Read it as in **Read an issue** above.

## Wayfinding operations

Used by `/wayfinder`. The **map** is a single issue with **child** issues as tickets.

- **Map**: a single issue labelled `wayfinder:map`, holding the Notes / Decisions-so-far / Fog body. `gh issue create --label wayfinder:map`.
- **Child ticket**: an issue linked to the map as a GitHub sub-issue (see **Make an issue a sub-issue of a parent**). Where sub-issues aren't enabled, add the child to a task list in the map body and put `Part of #<map>` at the top of the child body. Labels: `wayfinder:<type>` (`research`/`prototype`/`grilling`/`task`). Once claimed, the ticket is assigned to the driving dev.
- **Blocking**: see **Blocking** under Conventions.
- **Frontier query**: list the map's open children (`gh issue list --state open`, scoped to the map's sub-issues / task list), drop any with an open blocker (see **Count open blockers**, or an open issue in the `Blocked by` line) or an assignee; first in map order wins.
- **Claim**: `gh issue edit <n> --add-assignee @me`, the session's first write.
- **Resolve**: `gh issue comment <n> --body "<answer>"`, then `gh issue close <n>`, then append a context pointer (gist + link) to the map's Decisions-so-far.
