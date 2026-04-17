# Admin Escrow Override

- Layout pattern: summary chips + reconciliation table
- Primary CTA: `Run reconciliation`
- Density: high
- Key components: `Badge`, `DataTable`, `FilterBar`, `Toast`
- Loading behavior: summary + table skeletons
- Empty behavior: no reconciliation rows
- Error behavior: table-level failure with retry
- Offline behavior: table read-only, action buttons disabled
