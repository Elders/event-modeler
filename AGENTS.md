# AGENTS.md

Guidance for AI coding agents working in this repository.

**Read [CLAUDE.md](CLAUDE.md) first — it is the canonical agent guide.** It was
written for Claude Code, but everything in it (commands, architecture rules,
Miro SDK landmines, product decisions) applies to any agent working here.

Document map:

- [CLAUDE.md](CLAUDE.md) — canonical: commands, architecture, SDK landmines, product decisions.
- [SPECIFICATION.md](SPECIFICATION.md) — the feature specification, kept in sync with the code.
- [docs/DECISIONS.md](docs/DECISIONS.md) — product decisions and platform constraints with full context; do not regress these.
- [docs/USER-GUIDE.md](docs/USER-GUIDE.md) — end-user guide: the panel's UI controls and workflows, plus an event-modeling overview.
- [README.md](README.md) — setup and Miro app registration.

Hard rules, inlined for skimmers (details in the docs above):

- Verify every change with `npm run build` (strict `tsc` + production build). There are no tests or linters.
- Never touch the `miro` global outside `src/adapters/miro/`, and never import `@anthropic-ai/sdk` outside `src/adapters/anthropic/`. Domain and feature code speak only to ports.
- Every new piece of functionality is its own module/component with a co-located plain `.css` file. Never grow an existing file into a god-file.
- `master` auto-deploys to production (GitHub Pages). Develop on the `preview` branch; merge to master only to ship.
- Commit messages must not contain `Co-Authored-By` or any AI-attribution trailer.
- `Miro creds.txt` in the root holds credentials — never read, modify, or commit it.
