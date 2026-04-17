# Guest My Stay Override

- Layout pattern: reservation summary + QR token card + timeline
- Primary CTA: `Refresh token` on QR card
- Density: medium
- Key components: `Badge`, `Button`, `Card`, `EmptyState`, `Skeleton`
- Loading behavior: token placeholder skeleton + countdown placeholder
- Empty behavior: no active stay -> link to my bookings
- Error behavior: token fetch error with retry
- Offline behavior: offline badge and cached-token info block
