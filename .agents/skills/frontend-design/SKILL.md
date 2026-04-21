---
name: frontend-design
description: Create distinctive, production-grade frontend interfaces with high design quality. Use when the user asks to build web components, pages, or applications and the visual direction matters as much as the code quality.
origin: ECC
---

# Frontend Design

Use this when the task is not just "make it work" but "make it look designed."

This skill is for product pages, dashboards, app shells, components, or visual systems that need a clear point of view instead of generic AI-looking UI.

## When To Use

- building a landing page, dashboard, or app surface from scratch
- upgrading a bland interface into something intentional and memorable
- translating a product concept into a concrete visual direction
- implementing a frontend where typography, composition, and motion matter

## Core Principle

Pick a direction and commit to it.

Safe-average UI is usually worse than a strong, coherent aesthetic with a few bold choices.

## Design Workflow

## ACME LOS Stack Defaults

Use the existing platform before inventing new UI primitives:

- Web app:
  - `apps/web-app` is Next.js with App Router.
  - Styling is Tailwind CSS plus repo CSS variables in
    `apps/web-app/src/app/global.css`.
  - Prefer components from `@acme-los/ui-web`, which wraps the repo's
    shadcn/Radix-style primitives.
  - Keep server components as the default and create client islands only for
    browser state, effects, or event handlers.
- Mobile app:
  - `apps/mobile-app` is Expo / React Native.
  - Styling should align with NativeWind and the shared mobile UI layer under
    `libs/ui/mobile`.
  - Gluestack UI packages are available; use them when they match existing
    mobile patterns instead of hand-rolling primitive behavior.
- Cross-platform:
  - Preserve the ACME LOS visual direction across web and mobile, but do not
    force web-only layout or Radix assumptions into React Native.
  - Keep copy, spacing, and state treatment aligned so web and mobile feel like
    the same lending product.

### 1. Frame the interface first

Before coding, settle:

- purpose
- audience
- emotional tone
- visual direction
- one thing the user should remember

Possible directions:

- brutally minimal
- editorial
- industrial
- luxury
- playful
- geometric
- retro-futurist
- soft and organic
- maximalist

Do not mix directions casually. Choose one and execute it cleanly.

### 2. Build the visual system

Define:

- type hierarchy
- color variables
- spacing rhythm
- layout logic
- motion rules
- surface / border / shadow treatment

Use CSS variables or the project's token system so the interface stays coherent as it grows.

### 3. Compose with intention

Prefer:

- asymmetry when it sharpens hierarchy
- overlap when it creates depth
- strong whitespace when it clarifies focus
- dense layouts only when the product benefits from density

Avoid defaulting to a symmetrical card grid unless it is clearly the right fit.

### 4. Make motion meaningful

Use animation to:

- reveal hierarchy
- stage information
- reinforce user action
- create one or two memorable moments

Do not scatter generic micro-interactions everywhere. One well-directed load sequence is usually stronger than twenty random hover effects.

## Strong Defaults

### Typography

- pick fonts with character
- pair a distinctive display face with a readable body face when appropriate
- avoid generic defaults when the page is design-led

### Color

- commit to a clear palette
- one dominant field with selective accents usually works better than evenly weighted rainbow palettes
- avoid cliché purple-gradient-on-white unless the product genuinely calls for it

### Background

Use atmosphere:

- product-relevant imagery
- restrained textures
- subtle noise
- purposeful patterns
- layered transparency

Flat empty backgrounds are rarely the best answer for a product-facing page, but
avoid generic decorative blobs or one-note gradients that do not support the
product story.

### Layout

- break the grid when the composition benefits from it
- use diagonals, offsets, and grouping intentionally
- keep reading flow obvious even when the layout is unconventional

## Anti-Patterns

Never default to:

- interchangeable SaaS hero sections
- generic card piles with no hierarchy
- random accent colors without a system
- placeholder-feeling typography
- motion that exists only because animation was easy to add

## Execution Rules

- preserve the established design system when working inside an existing product
- match technical complexity to the visual idea
- keep accessibility and responsiveness intact
- frontends should feel deliberate on desktop and mobile

## Quality Gate

Before delivering:

- the interface has a clear visual point of view
- typography and spacing feel intentional
- color and motion support the product instead of decorating it randomly
- the result does not read like generic AI UI
- the implementation is production-grade, not just visually interesting
