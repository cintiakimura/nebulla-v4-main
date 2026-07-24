# Restore original IDE UI (pre black theme)

To reverse the Jul 24 2026 color theme:

```bash
cp src/theme-backups/original-ui-2026-07-24/index.css src/index.css
cp src/theme-backups/original-ui-2026-07-24/TopBar.tsx src/components/ide/TopBar.tsx
cp src/theme-backups/original-ui-2026-07-24/VerticalNav.tsx src/components/ide/VerticalNav.tsx
```

This restores Cosmic Night palette, original header logo size (22px), and VerticalNav logo.
