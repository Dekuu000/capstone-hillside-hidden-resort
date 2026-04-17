# Admin Audit Logs Override

- Layout pattern: filter/search toolbar + paginated log table
- Primary CTA: `Export logs` secondary action in header
- Density: very high
- Key components: `FilterBar`, `DataTable`, `Badge`, `Skeleton`, `EmptyState`
- Loading behavior: table skeleton with sticky header placeholder
- Empty behavior: no logs for current filter
- Error behavior: warning panel with retry
- Offline behavior: show cached logs warning if available
