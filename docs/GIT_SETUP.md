# Milestone 1 — GitHub setup

Target organization: **Find-a-Place-Booking**

This package intentionally contains no `.git` directory so it can become the clean root of the new production repository.

## Recommended repository

Create an empty private repository in the Find-a-Place-Booking organization, for example:

`find-a-place-booking`

Do not initialize the GitHub repository with a README, `.gitignore`, or license if you want the cleanest first push; this package already contains the project files.

## First push from this folder

Replace `<REPO_URL>` with the HTTPS or SSH URL GitHub gives you for the new repository.

```bash
git init
git add .
git commit -m "chore: establish production baseline"
git branch -M main
git remote add origin <REPO_URL>
git push -u origin main
```

## Verify the checkpoint before Milestone 2

After the push, from the same folder (or from a fresh clone):

```bash
npm install
npm run typecheck
npm run build
npm run dev
```

Then manually confirm the existing guest, host and admin demo routes still render as before.

Once verified, record the first known-good commit hash in `docs/PROJECT_STATE.md`. An optional tag is useful:

```bash
git tag milestone-1-baseline
git push origin milestone-1-baseline
```

## Vercel

Do not import/deploy this repository to Vercel yet unless a later milestone specifically needs a hosted environment. The production build remains local-first.
