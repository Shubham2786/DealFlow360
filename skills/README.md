# Project Skills Registry

Local skill library for **DealFlow360**, maintaining authoritative design, animation, UI/UX architecture, polish, and documentation skills.

---

## 1. Taste

* **Repository**: `https://github.com/Leonxlnx/taste-skill.git`
* **Installation Mechanism**: Git clone + Kiro pointer skill (`.kiro/skills/taste/SKILL.md`) / `npx skills add https://github.com/Leonxlnx/taste-skill`
* **Installed Version / Commit**: `ccbc156` (v2 experimental + sub-skills)
* **Purpose**: Frontend visual quality, design direction, typography scale, spacing rhythm, composition, visual hierarchy, and anti-generic ("anti-slop") design enforcement.
* **When to Use**: Use when designing or refining the look and feel of DealFlow360's Next.js UI (`apps/web`). Prevents generic AI SaaS templates, unnecessary gradients, and card-in-card nesting.
* **Scope**: Task-specific (Frontend visual design & aesthetic review).

---

## 2. Impeccable

* **Repository**: `https://github.com/pbakaus/impeccable.git`
* **Installation Mechanism**: Official Kiro integration (`.kiro/skills/impeccable/`) with bundled CLI runner (`scripts/impeccable.cmd`), 23 commands, and reference playbooks / `npx impeccable install`
* **Installed Version / Commit**: `8dac6ae` (v4.2.0)
* **Purpose**: Rigorous UI refinement, UX critiques, design system token alignment, accessibility audits, and professional polish.
* **When to Use**: Use when designing, reviewing, auditing, or refining UI components and flows (`/impeccable audit`, `/impeccable critique`, `/impeccable polish`, `/impeccable harden`).
* **Scope**: Task-specific (Interactive UI review, critique, and pre-flight polish).

---

## 3. Emil Kowalski Skills

* **Repository**: `https://github.com/emilkowalski/skills.git`
* **Installation Mechanism**: Git clone + Kiro pointer skill (`.kiro/skills/emilkowalski/SKILL.md`) / `npx skills@latest add emilkowalski/skills`
* **Installed Version / Commit**: `d23d7f8`
* **Purpose**: Micro-interactions, transitions, motion curves, easing, toast notifications (`ask-sonner`), and animation reviews with mandatory `| Before | After | Why |` audit tables.
* **When to Use**: Use when adding or fine-tuning transitions, modal/drawer animations, deal stepper status changes, or toast notifications. Avoids sluggish `transition: all 300ms` and jarring enters.
* **Scope**: Task-specific (Interaction design, motion, and animation audits).

---

## 4. UI/UX Pro Max

* **Repository**: `https://github.com/nextlevelbuilder/ui-ux-pro-max-skill.git`
* **Installation Mechanism**: Official CLI install (`npx ui-ux-pro-max-cli init --ai kiro`) to `.kiro/steering/ui-ux-pro-max` + mirror in `.kiro/skills/ui-ux-pro-max`
* **Installed Version / Commit**: `f3ac195` (v2.13.0, 79 UI styles, 192 color palettes & reasoning rules, 119 UX guidelines)
* **Purpose**: Comprehensive UI/UX architecture, design systems, responsive layout strategy, data density, accessibility (WCAG AA), component design, and chart selection.
* **When to Use**: Use for enterprise SaaS / B2B sales information architecture, table density, drawer panels, responsive viewports, and design token consistency.
* **Scope**: Always active for UI/UX architectural decisions and layout structures.

---

## 5. Beautify GitHub README

* **Repository**: `https://github.com/oil-oil/beautify-github-readme.git`
* **Installation Mechanism**: Git clone + Kiro pointer skill (`.kiro/skills/beautify-github-readme/SKILL.md`) / `npx skills add oil-oil/beautify-github-readme`
* **Installed Version / Commit**: `55bdb1c`
* **Purpose**: Project-native README architecture, value-first copy hierarchy, SVG hero diagrams, workflow illustrations, and visual documentation.
* **When to Use**: Use specifically when designing or upgrading repository documentation, architecture diagrams, or GitHub presentation.
* **Scope**: Task-specific (Documentation and repository homepage only).

---

## Skill Conflict Resolution Priority

When recommendations differ between skills, apply the following order:

```text
User requirements
        ↓
Project requirements & business rules (project.md / docs/ARCHITECTURE.md)
        ↓
Functional correctness (DealStateMachine / backend RBAC)
        ↓
Accessibility / usability (WCAG AA / responsive)
        ↓
Technical constraints (Next.js / Tailwind / TanStack Query)
        ↓
UI/UX Pro Max (Layout & System architecture)
        ↓
Taste (Aesthetic refinement & anti-slop)
        ↓
Impeccable (Critique & polish)
        ↓
Specialized Skills (Emil Kowalski for motion / Beautify for README)
```
