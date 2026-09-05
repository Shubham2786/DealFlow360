# AI Agent Guidelines & Repository Context

Welcome to the project repository. This document serves as the universal AI project instruction file across all supported AI coding agents and development environments (such as Antigravity, Kiro, Codex, and others).

---

## 1. Repository Overview

This repository is a collaborative project codebase. All AI agents and human contributors work against a unified, single source of truth established directly in this repository.

---

## 2. Directory Structure & Source of Truth

The repository is structured to separate documentation, task management, rules, workflows, and skills:

* **`docs/`**: The authoritative source of truth for project architecture, system design, API contracts, data models, and architectural decisions.
  * `docs/DESIGN.md`: Design system, visual guidelines, UI/UX specifications.
  * `docs/ARCHITECTURE.md`: High-level system architecture, module boundaries, core patterns.
  * `docs/API.md`: API specifications, endpoints, payload formats, error handling.
  * `docs/DATABASE.md`: Database schemas, relations, migrations, indexing.
  * `docs/DECISIONS.md`: Architectural Decision Records (ADRs).
* **`tasks/`**: Real-time project task state across the team.
  * `tasks/BACKLOG.md`: Planned and unstarted work items.
  * `tasks/CURRENT.md`: Currently active tasks in progress.
  * `tasks/COMPLETED.md`: Finished tasks and verification history.
* **`.agents/rules/`**: Universal constraints and quality guidelines for AI agents (`architecture.md`, `coding.md`, `git.md`).
* **`.agents/workflows/`**: Step-by-step development procedures (`feature.md`, `review.md`).
* **`.agents/skills/`**: Modular, reusable capability templates (`frontend`, `backend`, `ui-ux`, `testing`, `code-review`).

---

## 3. Core Principles for AI Agents

All AI agents interacting with this codebase must adhere strictly to the following principles:

1. **Inspect Before Changing**: Always examine relevant documentation in `docs/` and inspect existing codebase implementation before introducing modifications.
2. **Respect Architecture & Design**: Follow established patterns defined in `docs/ARCHITECTURE.md` and `docs/DESIGN.md`. Do not introduce new paradigms or architectural abstractions without explicit alignment.
3. **Avoid Unrelated Modifications**: Do not touch files or refactor code outside the immediate scope of the assigned task. Never apply speculative changes or bulk reformatting.
4. **Reuse Existing Code & Components**: Check for existing utilities, components, and helpers before creating new ones. Prevent code duplication.
5. **Scope Changes Strictly**: Keep implementations minimal, focused, and directly addressing the acceptance criteria of the task.
6. **Preserve Collaborative Work**: Never overwrite, erase, or revert another developer's or agent's work without explicit instruction.
7. **Keep State Synchronized**: Update the relevant task files in `tasks/` (moving items between backlog, current, and completed) and update documentation in `docs/` whenever architectural, API, or schema changes occur.
