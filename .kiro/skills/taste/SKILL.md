---
name: taste
description: Use for frontend visual quality and design direction — typography, spacing, composition, visual hierarchy, color, and anti-generic ("anti-slop") design. Apply when designing or refining the look and feel of DealFlow360's Next.js UI so screens feel intentional and premium rather than generic AI output.
inclusion: manual
---

# Taste (pointer skill)

Authoritative instructions are cloned locally at **`./skills/taste/`** (repo:
https://github.com/Leonxlnx/taste-skill.git). Individual sub-skills live in
`./skills/taste/skills/*/SKILL.md` (e.g. `minimalist-skill`, `redesign-skill`,
`output-skill`, `brandkit`, `image-to-code-skill`).

## When to use
Frontend visual design and review: establishing/So refining DealFlow360's visual
personality, typography scale, spacing rhythm, and composition; catching generic
"design slop" (arbitrary gradients, card-in-card, meaningless decoration).

## How to use in this project
1. Read the relevant sub-skill under `./skills/taste/skills/<name>/SKILL.md`.
2. Apply its guidance to the operational-dashboard aesthetic (data-first, calm, precise).
3. Keep changes within the existing Tailwind design system in `apps/web`.

Advisory only — product requirements and the existing design system take precedence.
