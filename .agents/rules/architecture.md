# Architecture Rules

These rules govern architectural decisions and component structures across the repository.

1. **Adhere to Source of Truth**: Always consult and align with `docs/ARCHITECTURE.md` before designing or modifying system components.
2. **Justify Pattern Additions**: Do not introduce new architectural patterns, paradigms, or layers without explicit justification and documentation in `docs/DECISIONS.md`.
3. **Reuse Existing Abstractions**: Leverage established abstractions, services, and utilities rather than creating parallel or redundant structures.
4. **Enforce Separation of Concerns**: Maintain clear boundaries between data access, business logic, presentation, and external integrations.
5. **Preserve Modularity**: Ensure components and modules remain decoupled, testable, and independently verifiable.
