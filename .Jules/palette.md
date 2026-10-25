## 2026-10-25 - Added ARIA labels to icon-only buttons
**Learning:** Found that multiple icon-only utility buttons in settings (like edit and confirm) were missing aria-labels, making them inaccessible to screen readers. The app uses Chinese localization for its UI strings, so accessibility text must match.
**Action:** Always verify icon-only buttons have descriptive aria-labels matching the UI language (Chinese in this repo) to ensure keyboard/screen reader accessibility.
