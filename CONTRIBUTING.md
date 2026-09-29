# Contributing to BoardPilot

Thanks for helping! The easiest and most valuable contributions:

1. **Boards**: add a development board as one JSON file with sources. See [docs/add-a-board.md](docs/add-a-board.md). Not a coder? [Request a board](https://github.com/mojeee/boardpilot/issues/new?template=new-board.yml).
1. **Parts**: add or fix a part in [`parts/`](parts/) (CC BY 4.0). See [docs/parts-library.md](docs/parts-library.md). Not a coder? [Request a part](https://github.com/mojeee/boardpilot/issues/new?template=new-part.yml).
2. **Italian and English texts**: every UI string lives in `shared/i18n/it/*.ts` (English is the key).
3. **Bug reports** with the session log (Report → Export) and your board/USB chip.

## Code

```bash
npm install
npm run dev
npm run typecheck && npm test
```

- TypeScript strict; no `any` in `app/main/hardware`, `app/main/ai`, `shared`.
- User-facing text is short, plain and goes through `t()` with an Italian entry (the i18n test enforces it).
- Anything that writes to a board needs a confirmation token from the UI.
- Read [CLAUDE.md](CLAUDE.md) for the product rules and architecture.

By contributing you agree that your contribution is licensed as described in [LICENSE.md](LICENSE.md) (section 6), `parts/LICENSE` or `firmware/LICENSE` for those folders.
