# Code Review Workflow

This document outlines the standard code review checklist and process for validating changes before merge or completion.

---

## 1. Requirements & Acceptance Criteria
* Does the change completely satisfy the task's stated requirements?
* Are all acceptance criteria fulfilled without missing edge cases?

## 2. Architecture & Design Alignment
* Does the solution conform to patterns established in `docs/ARCHITECTURE.md`?
* Are abstractions well-placed and responsibilities appropriately separated?
* Has code reuse been prioritized over duplicating existing functionality?

## 3. Correctness & Robustness
* Is the logic sound across standard, boundary, and erroneous inputs?
* Are error conditions, exceptions, and timeouts handled gracefully?
* Are concurrency or asynchronous operations thread-safe and properly synchronized?

## 4. Maintainability & Code Quality
* Is the code readable, idiomatic, and adhere to project conventions?
* Are variable, function, and file names clear and descriptive?
* Is complex or non-obvious logic appropriately documented?

## 5. Security & Privacy
* Are user inputs validated and sanitized against injection vulnerabilities?
* Are secrets, tokens, credentials, or sensitive data absent from code and logs?
* Are authentication and authorization checks properly enforced?

## 6. Testing & Test Coverage
* Are there corresponding automated tests covering new behavior and edge cases?
* Do all existing and newly written tests pass successfully?

## 7. Scope & Unintended Changes
* Are all changes scoped strictly to the task requirements?
* Are there any accidental modifications, stray debug statements, or unnecessary file edits?

## 8. Documentation & Task State
* Are relevant documentation files in `docs/` updated to reflect the changes?
* Has the task status in `tasks/` been updated accordingly?
