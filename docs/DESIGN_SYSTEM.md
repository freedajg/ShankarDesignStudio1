# Design System

Direction: **premium, calm, apparel-first.** The garment is the hero; chrome stays quiet. Ink and warm-white neutrals, a deep navy for trust, and **coral + gold used selectively** (the main CTA, AI features, small highlights) — the app must never read as "orange". Generous touch targets, no gratuitous motion. Tokens live in `src/app/globals.css` (`@theme`) — never scatter raw hex values in components; components in `src/components/ui`.

## Colour tokens

| Token | Value | Use |
|---|---|---|
| `--color-ink` | `#111827` | primary text, primary buttons, selected states |
| `--color-navy` | `#172554` | brand mark, info, payment sheet |
| `--color-canvas` | `#FAFAF7` | app background (warm white) |
| `--color-surface` | `#FFFFFF` | cards, panels, sheets |
| `--color-surface-muted` | `#F3F4F0` | studio stage, selected chips, inputs |
| `--color-ink-muted` | `#4B5563` | secondary text |
| `--color-line` / `-strong` | `#E5E6E0` / `#CDD0C6` | borders |
| `--color-accent` | `#F97360` | coral: main CTA fill (ink text, 6.9:1), AI sparkle, canvas selection |
| `--color-accent-ink` | `#C2412D` | coral text/links on white (≥ 4.5:1), focus ring |
| `--color-accent-soft` | `#FEEDE9` | accent badges |
| `--color-gold` | `#D9A441` | AI gradient edge, highlights |
| `--color-success` | `#15803D` | saved, paid |
| `--color-warning` / `-ink` | `#D97706` / `#92400E` | warning icons / warning text |
| `--color-danger` | `#DC2626` | errors |

Selected states use **ink** (ring or inset border + muted fill), not coral. The AI button uses the `ai-edge` utility (thin coral→gold border, static sparkle, no looping animation).

Status badges map every order status to one of these tones (neutral → info → success → danger), never colour alone — the label is always present.

## Typography
- UI: **Inter** (self-hosted via fontsource; no third-party font requests). Tabular numerals (`tabular-nums`) for prices, quantities and tables.
- Scale (rem): 0.75 caption · 0.875 body-sm · 1 body · 1.125 lead · 1.5 h3 · 2 h2 · 2.75 h1 (marketing only). Line-height 1.5 body, 1.15 headings, `-0.01em` tracking on headings.
- Design fonts (for customers' artwork) are separate: a curated set of 10 open-licence families (see `src/domain/fonts.ts`).

## Spacing, radii, elevation
- 4 px grid; common steps 4/8/12/16/24/32/48.
- Radii: `sm 6px` (chips, inputs), `md 10px` (buttons, cards), `lg 16px` (sheets, dialogs), `full` (swatches, round icon buttons).
- Elevation: borders first; shadows only for floating layers (`shadow-float` for sheets/popovers, `shadow-card` subtle for hover).

## Components
| Component | Rules |
|---|---|
| Button | variants `primary` (ink), `accent` (coral with ink text — the one main CTA per view, e.g. Add to cart / Pay), `secondary` (outline), `ghost`, `danger`; sizes `sm 36px`, `md 44px`, `lg 52px`. Mobile targets ≥ 44 px. Loading state keeps width and shows a spinner + label. |
| Input / Select / Textarea | 44 px height, visible label always (no placeholder-as-label), error text below linked by `aria-describedby`. |
| Swatch | 36 px circle with its colour name below, ink ring + check icon when selected, hover lift, inner border for light colours; colours come from the database. |
| Stepper | − / number / + ; number is a real `input type=number`; min/max enforced; used for size breakdown. |
| Card | surface + 1 px line + md radius. |
| Dialog / Sheet | Radix; focus trapped, Esc closes, returns focus. Bottom sheet on mobile, side sheet on desktop. |
| Tooltip | icon buttons always have one + `aria-label`. |
| Badge | status/tone; text label required. |
| Alert | info/warning/danger/success with icon + text; artwork warnings use warning. |
| Table | admin; sticky header, zebra muted rows, sortable headers are buttons with `aria-sort`. |
| Empty state | icon, one-line explanation, one action. |
| Loading | skeletons for lists/cards; inline spinners for actions; never blank screens. |
| Error | plain-language message + retry; never stack traces. |
| Toast | `sonner`; for confirmations, not for errors that need action. |

## Studio layout
- **Desktop (≥ 1024 px):** left rail = product, colour, print area, side switch · centre = stage (canvas on muted surface, front/back toggle above) · right rail = tools (Add text, Upload, Layers) and the selected-object inspector · bottom bar = order mode (Single / Bulk), sizes & quantity summary, live price, primary CTA.
- **Mobile (< 1024 px):** stage fills the viewport; front/back segmented control over the stage; bottom tab bar (Product · Text · Upload · Layers · Order) opening bottom sheets; sticky price + CTA bar above the tab bar; the selected-object inspector appears as a compact sheet. Canvas supports touch drag, pinch-free scaling via handles sized for fingers.

## Motion
150–200 ms ease-out for sheets/popovers; no animation on canvas objects; respects `prefers-reduced-motion`.

## Accessibility checklist
Semantic landmarks; one `h1` per page; focus ring 2 px accent-ink with offset; all icon buttons labelled; colour never the only signal; forms with labels, `autocomplete`, and error summaries; canvas mirrored by the Layers panel (select, move with arrow keys, rotate, resize, delete, reorder — all keyboard operable).
