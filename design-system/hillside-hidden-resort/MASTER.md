# Design System Master File

> **LOGIC:** When building a specific page, first check `design-system/pages/[page-name].md`.
> If that file exists, its rules **override** this Master file.
> If not, strictly follow the rules below.

---

**Project:** Hillside Hidden Resort  
**Updated:** 2026-02-26  
**Category:** Resort Operations + Guest PWA

---

## Global Rules

### Color Palette

| Role | Hex | CSS Variable |
|------|-----|--------------|
| Primary (Navy) | `#0B1F3B` | `--color-primary` |
| Secondary (Teal) | `#0EA5A4` | `--color-secondary` |
| CTA/Accent (Coral) | `#F97316` | `--color-cta` |
| Background | `#F7FAFC` | `--color-background` |
| Surface/Card | `#FFFFFF` | `--color-surface` |
| Text | `#0F172A` | `--color-text` |
| Muted Text | `#64748B` | `--color-muted` |
| Border | `#E2E8F0` | `--color-border` |

**Color Notes:** Coastal navy + teal for trust and clarity, coral CTA for warm resort energy.

### Typography

- **Font family:** Poppins
- **Heading scale:** H1/H2 = `700`, H3/H4 = `600`
- **Body scale:** body text = `400/500`
- **Small and muted text:** `400`

**Google Fonts import:**
```css
@import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap');
```

### Spacing Variables

| Token | Value | Usage |
|-------|-------|-------|
| `--space-xs` | `4px` | Tight gaps |
| `--space-sm` | `8px` | Inline spacing |
| `--space-md` | `16px` | Default spacing |
| `--space-lg` | `24px` | Section padding |
| `--space-xl` | `32px` | Section gaps |
| `--space-2xl` | `48px` | Layout spacing |
| `--space-3xl` | `64px` | Hero spacing |

### Radius + Shadows

| Token | Value |
|-------|-------|
| `--radius-sm` | `8px` |
| `--radius-md` | `12px` |
| `--radius-lg` | `16px` |
| `--shadow-sm` | `0 1px 2px rgba(2, 6, 23, 0.06)` |
| `--shadow-md` | `0 8px 24px rgba(2, 6, 23, 0.08)` |
| `--shadow-lg` | `0 20px 40px rgba(2, 6, 23, 0.14)` |

---

## Component Specs

### Buttons

- Variants: `primary`, `secondary`, `ghost`, `destructive`
- States: default, hover, active, disabled, loading
- Focus ring required on keyboard focus
- Loading state uses spinner icon + disabled pointer events

```css
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border-radius: 10px;
  font-weight: 600;
  transition: background-color 180ms ease, color 180ms ease, box-shadow 180ms ease;
  cursor: pointer;
}

.btn:focus-visible {
  outline: 2px solid transparent;
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-secondary) 22%, white);
}
```

### Inputs

- Must include `label`
- Optional `helper text`
- Error state: border + helper text in red
- Success state: border + helper text in green
- Never rely on color only; include text feedback

### Badges / Status Chips

- Variants: `success`, `warn`, `error`, `info`, `neutral`
- Reservation mapping:
  - `confirmed`, `checked_in`, `verified` -> success
  - `pending_payment`, `for_verification` -> warn
  - `cancelled`, `rejected`, `no_show` -> error
  - `draft`, `created` -> info
  - fallback -> neutral

### Tables

- Header: sticky optional, uppercase metadata style
- Row hover: only background/shadow changes, no transforms
- Zebra striping optional on dense admin pages
- Row focus-visible style required for keyboard

### Drawers and Modals

- Overlay: semi-opaque backdrop + optional blur
- Sizes: `sm` 420px, `md` 560px, `lg` 720px
- Close button top-right with visible focus ring
- Must trap attention and support ESC close where possible

### Tabs

- Active indicator required (underline or pill)
- Keyboard support: arrow keys should switch tabs in client components where feasible
- Focus-visible state required

### Toasts

- Variants: `success`, `error`, `info`
- Use concise title + one-line detail
- Auto-dismiss okay for success/info, sticky for error

---

## UX Rules

### Guest Pages

- More whitespace and calmer hierarchy
- Friendly and plain-language copy
- One primary CTA per viewport section

### Admin Pages

- Data-dense layout with strong scanning affordances
- Filter bar + table + drill-down drawer pattern
- Keep critical actions visible without scrolling

### Required Page States

Every data page must include:

- Skeleton loading
- Empty state with next action
- Error state with retry action
- Offline indication when applicable

### Accessibility + Motion

- No emojis as icons
- Use Lucide icon set for all UI icons
- Respect `prefers-reduced-motion`
- Transitions between `150ms` and `250ms`
- Text contrast minimum `4.5:1`
- Focus-visible styles required for interactive elements

---

## Anti-Patterns (Do NOT Use)

- Ornate decoration that reduces readability
- Layout-shifting hover transforms
- Missing empty/error loading states
- Invisible focus indicators
- Unlabeled form fields

---

## Pre-Delivery Checklist

- [ ] Uses palette tokens (`--color-*`) instead of hardcoded colors
- [ ] Poppins applied consistently
- [ ] Guest and admin density rules applied correctly
- [ ] Skeleton, empty, and error states present
- [ ] Lucide-only icons (no emojis)
- [ ] Keyboard focus visible on all controls
- [ ] Responsive at 375 / 768 / 1024 / 1440
- [ ] No horizontal overflow on mobile
