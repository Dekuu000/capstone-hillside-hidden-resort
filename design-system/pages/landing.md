# Landing Page Override

- Layout pattern: hero + value cards + CTA strip + compact footer
- Primary CTA: `Sign in` in hero right area, above fold
- Density: medium, guest-friendly
- Key components: `Button`, `Card`, `Badge`, `PageHeader`
- Loading behavior: skeleton hero while auth/session guard resolves
- Empty behavior: feature cards always render as static copy
- Error behavior: auth detection errors shown as inline warning banner
- Offline behavior: show "Offline mode: browsing only" info chip
