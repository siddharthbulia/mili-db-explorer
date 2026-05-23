# Design System — Mili DB Explorer

The single source of truth for every visual decision in this product.
Read this before changing fonts, colors, spacing, or laying out a new screen.

## Product Context

- **What this is:** A native macOS Postgres GUI (Electron). Schema tree, SQL editor, results grid, inline row editing.
- **Who it's for:** Senior developers who live in their database — the kind who already use TablePlus, Postico, or DBeaver and are quietly unhappy with all three.
- **Space:** Developer tools. Adjacent to Linear, Raycast, Vercel, Arc, Things, Superhuman.
- **Project type:** Native desktop app + a download landing page on Vercel.

## Aesthetic Direction — Studio Quiet

A warm graphite background, one signature amber accent, generous monospace, almost zero decoration. The feel of a recording studio or a vintage instrument panel — built for someone who'll spend eight hours staring at it.

- **Decoration level:** minimal. Typography and spacing do all the work. No gradients on UI chrome, no shadows on buttons, no glassmorphism. One gradient mesh, reserved for the marketing hero.
- **Mood:** calm power. Trustworthy. Crafted. Never cute, never corporate.
- **Reference points:** Linear's density, Vercel's restraint, Arc's warmth, Things' patience, Superhuman's speed, the typography of *The Browser Company* and *Werkstatt*.
- **What it's NOT:** A SaaS dashboard. A web app pretending to be a desktop app. A Tailwind template.

## Color

Warm-tinted dark (not pure black). Single signature accent. Color is rare and meaningful.

### Tokens

```
--surface-deep      #0B0D11   /* app background */
--surface-base      #12141A   /* panels, side bars */
--surface-raised    #1A1D24   /* cards, inputs, table headers */
--surface-hover     #1F2229   /* hover state */
--hairline          #262932   /* default borders */
--hairline-strong   #363A47   /* focus + hover borders */

--ink               #F5F6F8   /* primary text */
--ink-2             #C2C5CE   /* secondary text */
--ink-3             #7C808C   /* tertiary text, labels */
--ink-4             #4F525C   /* placeholder, disabled */

--accent            #F5A524   /* Console Amber — signature */
--accent-strong     #FFB544   /* hover/pressed */
--accent-dim        #9F6A18   /* visited/muted */
--accent-tint       rgba(245,165,36,0.10)  /* focus ring, tag bg */
--accent-glow       rgba(245,165,36,0.40)  /* connection-active pulse */

--success           #5BE3A8
--warning           #F5A524   /* same as accent — warnings are warm */
--danger            #F26F6F
--info              #7CB2FF
```

### Light mode

Not a priority. Studio Quiet was designed dark. If we ship light mode later, invert surfaces (no pure white — use `#FBFAF7` warm off-white), keep the same amber accent, drop accent opacity by 5%.

### Rules

- Buttons: primary uses `--accent` text on solid black, secondary is `--ink` on `--surface-raised`, ghost is text only.
- Focus rings: 2px `--accent` with 4px `--accent-tint` halo.
- Destructive actions: use `--danger`, never the accent.
- Status dots in the schema tree: `--success` for connected, `--ink-3` for idle, `--danger` for error.

## Typography

Three families. Each does one job. No exceptions.

| Role | Family | Where |
|---|---|---|
| Display | **Instrument Serif** (Google Fonts) | Hero headlines on the marketing site only. Never inside the app. |
| UI / Body | **General Sans** (Fontshare) | Every label, button, paragraph, menu item. |
| Mono | **JetBrains Mono** (Google Fonts) | SQL editor, results grid, schema tree, version numbers, code samples. |

Tabular numerals on General Sans (`font-feature-settings: "tnum"`) for any table cell that holds a number.

### Type scale (1.25 ratio, base 16)

```
2xs   11 / 14   uppercase eyebrows, table column headers
xs    12 / 16   captions, status bar
sm    13 / 18   secondary text
base  14 / 20   app default (chrome, menus, tooltips)
md    16 / 24   body paragraphs (marketing site)
lg    19 / 28   sub-headlines
xl    24 / 32   section headers
2xl   32 / 40   page titles
3xl   44 / 52   marketing section titles
4xl   60 / 64   marketing hero (mobile)
5xl   80 / 88   marketing hero (desktop) — Instrument Serif italic
```

### Weights

- General Sans: 400 (body), 500 (UI default, buttons), 600 (section headers), 700 (sparingly, max one per screen)
- Instrument Serif: 400 italic (display only)
- JetBrains Mono: 400 (code), 500 (active row in results)

## Spacing

4px base. Stick to the scale, never invent values.

```
0.5  2px       hairline gaps
1    4px       icon ↔ text
2    8px       form input padding
3    12px      tight component spacing
4    16px      default component spacing
6    24px      between component groups
8    32px      between sections
12   48px      between major page regions
16   64px      hero vertical rhythm
24   96px      generous breathing room
```

Density inside the app is **comfortable** (16px row height for tables, 12px button padding). Marketing site is **spacious** (24-32px between sections).

## Layout

- **App:** grid-disciplined. 240px sidebar + flex content + collapsible 320px inspector. No editorial layouts — this is a working tool.
- **Marketing site:** hybrid. Hero is editorial (asymmetric, big italic display type). Below the fold is a strict 12-column grid.
- **Max content width:** 1180px for marketing pages, 100% for the app.
- **Border radius scale:** `4 / 8 / 12 / 16 / 24 / 9999`. Use sparingly — the lowest value that reads as "rounded."

## Motion

Functional. Never bouncy. Never decorative.

- **Easing:** `cubic-bezier(.16, 1, .3, 1)` for entrance, `cubic-bezier(.4, 0, 1, 1)` for exit, `ease-in-out` for state change.
- **Duration scale:** 80ms (micro: hover) / 140ms (tap) / 220ms (panel slide) / 320ms (page change) / 480ms (hero reveal).
- **Forbidden:** spring easings, scale > 1.05, opacity flickering loops, any animation longer than 500ms in the app.
- **Allowed:** the "query running" pulse (1.2s, infinite, low contrast) and the "connection live" dot glow (subtle).

## Iconography

Lucide line icons, **1.5px stroke**, sized 14 / 16 / 20 / 24. No filled icons except status dots and the logo. Icons inherit `currentColor` from the parent.

## Logo

The mark is a custom monogram **M** built from three strokes. The two outer strokes are `--ink`. The center V is replaced by a small **`--accent` horizontal bar** — the "active row." It reads as M for Mili, an empty database cell with one row highlighted, and a focused query indicator all at once.

- App icon: rounded square (28% radius), `--surface-deep` background, mark centered, ~62% size.
- Favicon / inline: standalone mark, no background.
- Word lockup: mark + "Mili DB Explorer" set in General Sans 500.

## Voice (UI copy)

- Direct, not chatty. "Connection failed." not "Oops! We couldn't connect 😔".
- Past tense for results. "Returned 7 rows in 18 ms."
- Never apologize for the user's mistake. Just explain what happened.
- Empty states are honest: "No queries yet" not "Get started by running your first query!"
- Keyboard shortcuts named in `<kbd>` everywhere they appear.

## Decisions Log

| Date | Decision | Rationale |
|---|---|---|
| 2026-05-21 | Studio Quiet aesthetic, Console Amber accent | Postgres ecosystem is saturated in blue. Amber-on-graphite reads as a vintage instrument, instantly distinct, warm where peers are cold. |
| 2026-05-21 | Instrument Serif / General Sans / JetBrains Mono | Avoided Inter and Geist (overused). Instrument Serif gives the marketing site a memorable italic, General Sans handles dense UI, JBM is the de-facto dev mono. |
| 2026-05-21 | Custom M with amber center bar | Combines the Mili monogram with a "data row" indicator. Reads at 16×16 and at 1024×1024. |
