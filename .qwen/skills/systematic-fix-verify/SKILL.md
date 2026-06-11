---
name: systematic-fix-verify
description: Approach for making coordinated multi-file changes: review all, identify all gaps first, fix in dependency order, then verify with import checks + live endpoint tests.
source: auto-skill
extracted_at: '2026-06-11T15:10:55.721Z'
---

# Systematic Fix-and-Verify Workflow

Use this when a task involves modifying multiple interconnected files (e.g., making an app production-ready, refactoring a service layer, adding a new feature that crosses layers).

## Principle: Separate "what to do" from "how to do it"

Do NOT fix files one-by-one as you discover issues. That leads to:
- Missing interdependencies (you fix file A, but file B was written against old A)
- Extra round-trips (ask-read-ask-read cycle wastes time)
- Inconsistent approaches across files

Instead, use this workflow:

## Step 1: Read everything first

Read ALL relevant source files in one batch before making ANY changes. This gives you the full mental model.

## Step 2: Identify all gaps upfront

Write a complete list of issues/gaps/changes needed (use a todo list). Categorize by file. Do not start fixing yet.

## Step 3: Fix in dependency order

Identify which file exports are imported by others. Fix lowest-dependency files first:

```
config.py → database.py → auth.py → models/orm.py → services/ → routes/ → main.py → deployment configs
```

Write each file completely (don't patch — rewrite with `write_file` for major changes). This prevents the "I thought I fixed that but a stale import survived" problem.

## Step 4: Fix co-dependencies together

When files reference each other (e.g., `routes.py` imports `memory_service.add_manual()` which we just made async), fix BOTH in the same edit batch. A common pattern:

- You make a method `async` in a service
- You FORGET to `await` it in routes → RuntimeError at runtime

Fix both at once to avoid this.

## Step 5: Verify in two phases

**Phase A — Import/syntax check:**
```bash
python -c "from main import app"
```
This catches 90% of errors before any server is started (missing imports, undefined names, type errors).

**Phase B — Live test (background uvicorn + curl):**
1. Start server with auth disabled for testing: `AUTH_ENABLED=false python -m uvicorn main:app --host 127.0.0.1 --port <PORT>`
2. Test all endpoint categories: health, list, create, CRUD
3. Check server logs for warnings/errors
4. Kill test server

## Step 6: Clean up

- Remove test databases (`rm -f /tmp/*.db`)
- Remove stray `*.orig` files from merge/backup
- Check `git status` for untracked files that should be committed or gitignored

## Why this works

- **Todo-driven progress**: You can see at a glance how far along you are
- **Dependency ordering**: Avoids "I fixed the caller but not the callee" bugs
- **Import-first verification**: Catches 90% of bugs within 2 seconds (no need to wait for server boot)
- **Live endpoint test**: Catches the remaining 10% (async mistakes, runtime wiring)