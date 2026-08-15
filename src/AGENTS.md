# Frontend Instructions

- Treat `shared/contracts.ts` as the API contract; do not recreate response types locally.
- Keep filter and pagination state in the URL so collection views are linkable.
- All external provider requests belong in the Worker. The browser calls same-origin `/api/*` only, except for public image assets and attribution links.
- Preserve keyboard navigation, visible focus, semantic labels, responsive layout, reduced-motion behavior, and explicit loading/empty/error states.
- Use the existing CSS variables and project components. Do not introduce a UI framework for isolated styling needs.
- Add React Testing Library coverage for behavior, routing, and accessibility affected by a change.
