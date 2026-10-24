## 2026-10-24 - [IconButton Accessibility]
**Learning:** Screen readers announce random unicode symbols for icon buttons lacking aria-labels. Toggle states were not exposed to AT (Assistive Technologies). Keyboard focus states were missing, making it impossible to see focus on the buttons.
**Action:** Always add `aria-label` to icon-only buttons, use `aria-pressed` for toggle states, wrap visual Unicode symbols with `<span aria-hidden="true">`, and implement clear `focus-visible` outlines for accessibility.
