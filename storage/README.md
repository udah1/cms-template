# Media source (not in git)

Production media is in R2 (`cms-template-media`), served via `/media/*`.

Optional local folder `storage/media/` (gitignored) is only for re-sync:

```bash
npm run r2:sync
```

Do not put media back under `public/` - Pages would ship it with every deploy.
