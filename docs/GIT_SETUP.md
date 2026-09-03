# Git workflow for Find A Place Booking

Repository: `https://github.com/Find-a-Place-Booking/Find-A-Place-Booking`

## Known-good baseline

Milestone 1 was pushed as:

`d0c4695` — `chore: establish production baseline`

## For each new milestone package

Work from the existing local repository so `.git` history is preserved. Replace/update the project files with the milestone package, then run the required local verification before committing.

Typical checkpoint flow:

```bash
git status
npm install
npm run typecheck
npm run build
npm run dev
```

After manual regression testing succeeds:

```bash
git add .
git commit -m "chore: complete production shell cleanup"
git push origin main
```

Record the resulting commit hash in `docs/PROJECT_STATE.md` before beginning the next milestone.

Do not deploy to Vercel just because code was pushed to GitHub. Deployment remains a separate deliberate step when hosted behavior is actually required.
