---
name: frontend-design
description: Create distinctive, production-grade frontend interfaces with high design quality. Use when the user asks to build or refine web components, pages, app shells, or Figma-driven UI and the visual direction matters as much as the code quality.
origin: ECC
---

# Frontend Design

Use this when the task is not just "make it work" but "make it feel designed."

This skill is for product pages, dashboards, app shells, components, and
visual systems that need clear art direction, strong hierarchy, and responsive
polish instead of generic AI-looking UI.

## When To Use

- building a landing page, dashboard, showcase, or app surface from scratch
- upgrading a bland interface into something intentional and memorable
- translating a product concept or screenshot into a concrete visual direction
- implementing Figma- or reference-driven UI where fidelity and polish matter
- refining hierarchy, spacing, typography, or motion on an existing frontend

## Working Model

Before coding, write three things:

- visual thesis: one sentence describing mood, material, and energy
- content plan: hero, support, detail, final CTA, or the equivalent screen flow
- interaction thesis: 2-3 motion or state ideas that change the feel of the UI

Each section gets one job, one dominant visual idea, and one primary takeaway
or action.

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

## Design Workflow

### 1. Frame the interface first

Settle:

- purpose
- audience
- emotional tone
- visual direction
- the one thing the user should remember

Do not mix directions casually. Choose one and execute it cleanly.

### 2. Start from composition, not components

Prefer:

- one strong visual anchor in the first viewport
- a full-bleed hero or dominant visual plane for brand-led pages
- a primary workspace plus supporting context for product UI
- whitespace, alignment, scale, cropping, and contrast before extra chrome

Treat the first viewport like a poster, not a document.

### 3. Build the visual system

Define:

- type hierarchy
- color variables
- spacing rhythm
- layout logic
- motion rules
- surface, border, and shadow treatment

Use the project's token system and existing CSS variables so the interface
stays coherent as it grows.

### 4. Reuse the design system before creating new primitives

Prefer existing buttons, inputs, typography, cards, icons, and layout wrappers.

When reference material or design output suggests literal values:

- treat the output as design intent, not final code style
- map colors, spacing, radii, and type to project tokens
- extend existing components instead of cloning them
- avoid hardcoded values unless the repo truly has no token for the job

### 5. Make motion intentional

Ship a small number of meaningful motions:

- one entrance sequence or reveal
- one scroll, sticky, or depth effect when the page benefits from it
- one hover, reveal, or transition that sharpens affordance

Motion should improve hierarchy, not decorate it.

### 6. Validate visually, not just structurally

Before finishing:

- compare against screenshots, Figma captures, or the existing product
- verify the layout at desktop and mobile sizes
- check tap targets, contrast, and text fit
- confirm states such as hover, active, disabled, open, and loading

When visual references exist, they are the source of truth for layout and
feel. Translate them into repo conventions rather than copying them blindly.

## Strong Defaults

### Landing Pages

Default sequence:

1. Hero: brand or product, promise, CTA, and one dominant visual
2. Support: one concrete feature, offer, or proof point
3. Detail: workflow, atmosphere, product depth, or story
4. Final CTA: convert, start, contact, or continue

Hero rules:

- one composition only
- full-bleed image or dominant visual plane
- constrain the inner text column, not the hero itself
- brand first, headline second, body third, CTA fourth
- no hero cards, stat strips, logo clouds, or floating dashboard clutter by
  default

### Product UI

Default to restrained, dense, readable product surfaces:

- calm surface hierarchy
- strong typography and spacing
- few colors
- minimal chrome
- cards only when the card itself is the interaction

Organize around:

- primary workspace
- navigation
- secondary context or inspector
- one clear accent for action or state

### Figma And Visual References

When the task is driven by Figma, screenshots, or another UI reference:

- fetch or inspect the design context before building
- capture a visual reference and keep it available during implementation
- reuse the design system's components, variables, and styles instead of
  redrawing primitives
- validate side-by-side before calling the work done

For code output, favor project components and tokens over literal translation.
For design output, favor linked design-system instances over raw shapes.

## Anti-Patterns

Never default to:

- interchangeable SaaS hero sections
- boxed or center-column heroes when the brief calls for full bleed
- generic card mosaics as the first impression
- random accent colors without a system
- placeholder-feeling typography
- decorative gradients or textures doing no narrative work
- motion that exists only because animation was easy to add

## Execution Rules

- preserve the established design system when working inside an existing product
- match technical complexity to the visual idea
- keep accessibility and responsiveness intact
- frontends should feel deliberate on desktop and mobile
- if a panel can become plain layout without losing meaning, remove the card
  treatment
- if deleting 30 percent of the copy improves the page, keep deleting

## Quality Gate

Before delivering:

- the interface has a clear visual point of view
- the brand or product is unmistakable in the first screen when relevant
- there is one strong visual anchor
- typography and spacing feel intentional
- color and motion support the product instead of decorating it randomly
- each section has one job
- cards are used because they are necessary, not because they are easy
- the result does not read like generic AI UI
- the implementation is production-grade, not just visually interesting
