# Admin Check-In Override

- Layout pattern: kiosk panel + scanner region + result console
- Primary CTA: `Start scanner`
- Density: medium-high
- Key components: `Button`, `Badge`, `Card`, `Toast`, `EmptyState`
- Loading behavior: scanner boot skeleton
- Empty behavior: no token scanned prompt
- Error behavior: clear INVALID state panel with reason
- Offline behavior: offline queue counter + sync action
