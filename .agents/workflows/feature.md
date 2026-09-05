# Feature Development Workflow

This document defines the standard procedure for implementing a feature or task across all AI agents and contributors.

---

## 1. Understand the Task
* Read the task definition, user stories, and acceptance criteria in `tasks/CURRENT.md` or `tasks/BACKLOG.md`.
* Identify dependencies, constraints, and target outcomes before writing any code.

## 2. Read Relevant Documentation
* Review relevant documents in `docs/` (`ARCHITECTURE.md`, `DESIGN.md`, `API.md`, `DATABASE.md`).
* Ensure alignment with established architectural rules and patterns in `.agents/rules/`.

## 3. Inspect the Existing Implementation
* Examine the current codebase to discover existing utilities, data models, components, or services that can be reused.
* Verify project conventions and formatting patterns currently in use.

## 4. Plan the Change
* Formulate a minimal, focused implementation plan.
* Identify the exact files to create or modify and outline the sequence of edits.

## 5. Implement Only the Required Change
* Make scoped modifications strictly necessary to fulfill the task requirements.
* Avoid refactoring untouched code or adding out-of-scope features.

## 6. Test and Validate
* Execute relevant unit, integration, or manual tests to verify correctness.
* Confirm that all acceptance criteria are met and no regressions are introduced.

## 7. Review the Diff
* Perform a thorough self-review of all changes using `git diff` or review tools.
* Ensure no stray debugging code, unintended file changes, or formatting anomalies exist.

## 8. Update Relevant Task & Documentation State
* Update task status in `tasks/` (e.g., move the task from `CURRENT.md` to `COMPLETED.md` with verification notes).
* Update any relevant documentation in `docs/` if APIs, schemas, or architectural structures were modified.
