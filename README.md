# Travel Planner Pro

Travel Planner Pro is a Vite + React single-page travel planning app.

## Run locally

```bash
npm ci
npm run dev
```

## Build

```bash
npm run build
```

## Deploy on GitHub Pages

This repository now includes `.github/workflows/deploy-github-pages.yml`.

To publish the app from GitHub:

1. Push the repository to the `main` branch on GitHub.
2. In **Settings → Pages**, set **Source** to **GitHub Actions**.
3. The workflow will build the app and deploy the generated `dist/` output.

If your default branch is not `main`, update the workflow trigger accordingly.
