## 2024-05-24 - Modal Accessibility
**Learning:** The reusable `Modal` component and other overlay modals lack `role="dialog"` and `aria-modal="true"`. Screen readers may not trap virtual focus or announce them correctly as dialogs.
**Action:** Always include `role="dialog"`, `aria-modal="true"`, and `aria-labelledby` (using `React.useId()`) on the modal container when building accessible dialog overlays.
