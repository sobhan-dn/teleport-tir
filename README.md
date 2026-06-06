# Teleport Tir

A cute 2D underwater browser game built with Phaser, TypeScript, and Vite.

## Play Locally

```bash
npm install
npm run dev
```

Open the local URL printed by Vite, usually:

```text
http://localhost:5174/
```

## Controls

- Move: `WASD` or arrow keys
- Shoot normal bolt: `R` or `Space`
- Teleport shot / teleport: `E`
- Touch controls also work on iPhone.

## Build

```bash
npm run build
```

The production files are generated in `dist/`.

## Publish

This repo includes a GitHub Pages workflow in `.github/workflows/deploy.yml`.

After pushing to `main`, GitHub Actions builds the game and publishes the `dist/` folder to GitHub Pages.

In GitHub, open:

```text
Settings -> Pages -> Build and deployment -> Source -> GitHub Actions
```

Then every future push to `main` publishes the latest version automatically.
