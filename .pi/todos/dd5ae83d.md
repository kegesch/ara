{
  "id": "dd5ae83d",
  "title": "Git hooks + CI mode — enforce ARAD health on commit and PR",
  "tags": [
    "enhancement",
    "ci"
  ],
  "status": "done",
  "created_at": "2026-04-30T19:44:57.284Z"
}

## Completed
- `arad check --strict` — treats warnings as errors, exit code 1
- `arad check --format json` — machine-parseable JSON output
- Clean exit codes: 0 = clean, 1 = issues found (or warnings in strict mode)
- Structured `CheckResult` type with `issues[]` and `warnings[]`, each with `kind`, `severity`, `message`, `ids`
- Ready for git hooks and CI: `arad check` in pre-push, `arad check --strict` in pre-commit, `arad check --format json` in GitHub Actions
