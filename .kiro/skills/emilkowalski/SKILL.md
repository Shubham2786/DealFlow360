---
name: emilkowalski
description: Animation, motion design, micro-interactions, transitions, and frontend interaction craft based on Emil Kowalski's design engineering philosophy. Use when designing, building, or auditing motion, gestures, enter/exit animations, curves, durations, and UI polish in DealFlow360's Next.js frontend.
inclusion: manual
---

# Emil Kowalski Skills (pointer skill)

Authoritative instructions are cloned locally at **`./skills/emilkowalski/`** (repo:
https://github.com/emilkowalski/skills.git). Sub-skills live in `./skills/emilkowalski/skills/*/SKILL.md`:

- `emil-design-eng/` — Core design engineering philosophy, invisible polish details, and the mandatory Before/After review format.
- `animate/` — Building animations from scratch with correct curves, durations, and properties.
- `review-animations/` — Strict animation review against motion principles.
- `improve-animations/` — Audit animations in codebase and create actionable plans.
- `find-animation-opportunities/` — Spot UI areas that genuinely benefit from motion (and what NOT to animate).
- `animation-vocabulary/` — Precise terminology for crafting motion specifications.
- `apple-design/` — Fluid motion and interface principles distilled from Apple design.
- `pick-ui-library/` — Trusted library selection (avoiding hand-rolled or abandoned packages).
- `prototype/` — Interactive variant prototyping and switcher patterns.
- `ask-sonner/` — Toast configuration, styling, recipes, and fixes.

## When to use
- Adding or refining transitions, dropdown animations, modal overlays, drawer slides, and stepper feedback in DealFlow360.
- Auditing existing UI transitions to replace sluggish `all 300ms` with precise `transform`/`opacity` easing.
- Enforcing `prefers-reduced-motion` and ensuring motion conveys hierarchy/state rather than decoration.

## How to use in this project
1. Consult `./skills/emilkowalski/skills/<subskill>/SKILL.md` for specific animation guidance.
2. In DealFlow360 (`apps/web`), favor Tailwind CSS transitions, CSS transforms, and Sonner for toast notifications.
3. Follow the mandatory markdown review table format (`| Before | After | Why |`) when auditing UI motion.
4. Keep motion purposeful: state changes, drawer opens, approval stepper progression, and toast alerts.

Advisory only — product requirements, performance, and accessibility take precedence.
