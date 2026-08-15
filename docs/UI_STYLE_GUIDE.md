# UI Style Guide

The interface should feel like a quiet, premium streaming library while remaining unmistakably a physical collection.

- Dark neutral surfaces, restrained mint accent, poster-led hierarchy, and generous spacing.
- Use the local system UI font stack (`Segoe UI Variable Display`, `Segoe UI`, and system fallbacks) so browsing does not contact a font CDN.
- Use existing CSS variables; maintain AA-readable contrast and visible keyboard focus.
- Poster cards preserve a 2:3 ratio and show media/format badges. Missing artwork uses the disc placeholder rather than a broken image.
- All networked views require loading, empty, error, and populated states.
- Mobile starts at two poster columns and season detail content stacks below the poster.
- Respect `prefers-reduced-motion`; motion is decorative and never required for comprehension.
- TMDB branding appears less prominently than the application identity and only in the About/credit context.
