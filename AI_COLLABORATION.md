# Codex + Claude Code collaboration

Use one implementer and one reviewer per task. This reduces conflicts; it does not
guarantee bug-free changes. These files coordinate work, but do not create a live
connection between the two assistants. The user relays prompts and handoffs.

## Shared context

- Read both `AGENTS.md` and `CLAUDE.md`, plus applicable nested instructions.
  They currently contain different generations of project context. Verify relevant
  claims against current code, migrations and tests; do not restore old behavior
  merely because one instruction file describes it. Flag unresolved conflicts.
- Start with `git status --short`, `git diff`, `git diff --cached`, and relevant
  untracked files. Preserve existing work and never include unrelated changes.
- State the task, role, checkout path, branch, starting commit and intended files
  before editing. Do not infer that another assistant has finished from silence.

## Default: implement, freeze, review, revise

1. The user assigns one implementer (either assistant). The other reviews only.
   In a shared checkout, only the implementer edits files or runs Git mutations.
   The reviewer must not format, auto-fix, install dependencies or alter files.
2. The implementer makes a small, focused change and checks it. Avoid unrelated
   refactors, especially in `src/ScienceFairJudging.jsx`.
3. Freeze edits and provide the handoff below. Review a specific commit or a frozen
   diff including staged and relevant untracked content, not a moving target.
4. The reviewer reports concrete defects with file/line references, severity,
   reproduction conditions and suggested fixes. Review is not permission to edit.
5. The implementer addresses findings and reruns affected checks. Any later edit
   invalidates review of the changed area; provide an updated handoff.
6. Only the designated integrator combines changes. Inspect the resulting diff and
   rerun applicable checks after integration. Roles change only by explicit handoff.

## If both need to implement simultaneously

- Use separate Git worktrees and distinct task branches, starting from a recorded
  common commit. Two branches in the SAME folder do not isolate edits.
- Assign non-overlapping files and agree on any shared API/schema contract first.
  Serialize edits to `src/ScienceFairJudging.jsx`, dependency manifests/lockfiles,
  and coupled SQL/RPC changes even in separate worktrees.
- A worktree isolates files, not Supabase, deployment services or browser storage.
  Use isolated test resources and distinct dev-server ports as needed.
- Name one integrator. Integrate one reviewed change at a time; never resolve a
  conflict by blindly keeping one side. Recheck behavior on the combined result.
- Handoff files in separate worktrees are not live shared state. Relay their exact
  contents or commit references; do not assume the other assistant has seen them.

## Verification and release

- Inspect current `package.json` and test setup. For app changes run
  `npm run lint`, `npm run build`, and affected browser tests. For SQL/API changes
  run `npm test`; run affected browser flows for coupled frontend/backend changes.
  Report baseline failures separately; never claim an unrun check passed.
- For relevant changes, check tenant isolation, judge identity, dynamic rubrics,
  offline queue preservation, validation/finalization gates and cached clients.
  Passing mocks alone does not prove production RLS or concurrency safety.
- Documentation-only changes need diff/content checks, not a full app test run.
- Prepare re-runnable migrations with deployment order, client compatibility and
  recovery notes. Do not assume a SQL file open in an IDE has been applied.
- Local implementation/review does not itself authorize production changes.
  Push to `main` auto-deploys. Apply live SQL, merge/push to `main`, or change
  hosting only within the user's explicit release authorization. Existing explicit
  authorization remains valid; do not ask for it again unnecessarily.
- Never reset, clean, stash, overwrite or discard another person's work to obtain
  a clean checkout. Never include secrets or student/guardian data in handoffs.

## Handoff template

```text
Task and intended behavior:
Implementer / reviewer / integrator:
Checkout path and branch:
Starting commit:
Review target: commit(s), or frozen working diff + staged/untracked file list
Files changed and why:
Checks run and actual results:
Not checked / remaining risks:
Migration coupling and rollout/recovery (if applicable):
Review findings addressed / outstanding:
Next owner and action:
```

## Copy this into Claude Code

```text
Work with Codex on Qritiko using AI_COLLABORATION.md. Read that file,
AGENTS.md, CLAUDE.md and applicable nested instructions first. Inspect current
Git status and relevant diffs, including staged and untracked work. The project
context files differ in age: verify relevant claims against current code and
migrations, and flag conflicts instead of restoring outdated behavior.

Your initial role is REVIEWER. Do not edit files, auto-fix, change dependencies,
commit, apply migrations, deploy or mutate production. Codex is the implementer
until I explicitly change the assignment. We communicate through handoffs I relay;
do not assume you can see Codex's conversation or that it has stopped editing.

If I have not supplied a task and frozen review target, ask me for those and wait
before reviewing. Once supplied, inspect the complete change and affected callers,
tests and SQL contracts. Check for regressions, tenant isolation, judge identity,
offline score loss, dynamic rubric errors and workflow gate bypasses where relevant.
Run appropriate non-mutating checks only after inspecting their setup; report any
checks that would need the implementer to run them instead.

Return findings ordered by severity with exact file/line references, concrete
failure conditions and the smallest suggested fixes. Separate verified defects
from questions and assumptions. If there are no findings, say so and list remaining
test gaps. End with a concise handoff for Codex. Stay in review mode until I assign
implementation and the current writer explicitly hands off ownership.
```
