# Applying Milestone 2 to the existing Git checkout

Keep the existing repository and its `.git` history. Do not create a new repository for this ZIP.

1. Extract the Milestone 2 ZIP to a temporary folder.
2. Copy the extracted project files over your existing local `Find-A-Place-Booking` checkout and allow changed files to be replaced.
3. Keep the existing `.git` folder untouched.
4. Keep the existing `package-lock.json` from Milestone 1. This milestone does not change dependencies, so the lockfile is intentionally not replaced.
5. Run:

```powershell
npm install
npm run typecheck
npm run build
npm run dev
```

6. Complete the manual route/regression checklist in `docs/PROJECT_STATE.md`.
7. If everything passes:

```powershell
git status
git add .
git commit -m "chore: complete production shell cleanup"
git push origin main
git rev-parse --short HEAD
```

Send the resulting commit hash back before Milestone 3 begins.

The expected structural changes include new `data/catalog.ts`, `app/not-found.tsx`, and `app/trip/page.tsx`, plus replacement of presentation data throughout public, host and admin routes. `data/demo.ts` is intentionally overwritten with a zero-data compatibility shim so the old presentation inventory cannot survive an overlay extraction.
