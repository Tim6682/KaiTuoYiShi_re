## 2024-05-18 - Improve Toggle Accessibility
**Learning:** Custom toggle buttons in the settings lack basic switch accessibility attributes (`role="switch"`, `aria-checked`, `aria-label`).
**Action:** Add full switch semantics and keyboard focus indicators using Tailwind's `focus-visible:` classes when creating or auditing custom toggles.
