# Contributing

Thanks for helping build Canary Ground Control. This guide covers the development setup, the checks a change must pass, and the conventions that keep the history and the automated releases clean.

## Development setup

Fork and clone the repo, then bring up the dev stack (Docker Compose under the hood):

```bash
cp .env.example .env                          # optional; the stack runs on defaults
docker compose --profile development up -d    # SvelteKit dev server + ArduPilot SITL
docker compose --profile development logs -f
```

The app serves at `http://localhost:5173` with hot reload. The `development-px4`, `development-betaflight`, and `development-inav` profiles swap in a PX4, Betaflight, or INAV SITL instead, and `SITL_VEHICLE` / `SITL_MODEL` pick rover, plane, or sub variants on the ArduPilot profile. The [Local Development](README.md#-local-development) section of the README and the [Development](https://github.com/judahpaul16/canarygc/wiki/Development) wiki page cover the details.

## Gates

Every push and pull request runs these in CI (Node 24, from `compose/svelte-kit`). Run them locally before opening a PR; all six must pass:

```bash
npm ci                              # install from the lockfile
npm run lint                        # eslint
npm run check                       # svelte-check, warnings fail
npm test                            # vitest unit suite
npm run build                       # production build
npm audit --audit-level=moderate    # dependency audit
```

The Playwright end-to-end suite (`npm run test:e2e`) drives the running dev stack; the [End-to-end tests](README.md#end-to-end-tests) section of the README covers its setup and the `E2E_SITL=1` flight spec. Run it when a change touches a flow it exercises.

## Commit messages and versioning

Releases are automatic. On every push to `main`, the release workflow walks the commits since the latest `vX.Y.Z` tag, bumps the semver per commit from its subject, tags each commit, and cuts a GitHub release; the image workflow then publishes the Docker image. The bump comes from a marker at the **start** of the subject line:

| Subject starts with | Bump | Use for |
| --- | --- | --- |
| no marker | patch | fixes, docs, polish, refactors |
| `[minor update]` | minor | new features or new surface area (endpoint, page, module) |
| `[major update]` | major | breaking changes to existing behavior or interfaces |
| `[skip ci]` | none | changes that need no release run |

After the marker, use a conventional-commit subject and a body that describes what the code does, in the present tense:

```
[minor update] feat(planner): add corridor mission pattern

The planner generates parallel survey lanes along a drawn path at a
chosen width, spacing, and altitude.
```

## Branches, squashing, and rebasing

- Branch from `main` with a short descriptive name (`feat/corridor-pattern`, `fix/msp-reconnect`).
- Keep a PR to one logical change. Split unrelated work into separate PRs.
- Because every commit that lands on `main` becomes its own tagged release, fixup and work-in-progress commits must not land. Squash them into their logical commit before review, and again after addressing review feedback:

  ```bash
  git fetch origin
  git rebase -i origin/main    # squash fixups, reword subjects, set the right marker
  git push --force-with-lease  # safe force-push to your own PR branch
  ```

- Rebase your branch on `main` instead of merging `main` into it, so the history stays linear.
- Each commit that survives the rebase should stand alone: it builds, passes the gates, and carries the marker that matches its own change.
- If a PR is squash-merged, its title becomes the commit subject, so put the correct marker in the PR title.

## Pull requests

- Describe what the change does and why; a reviewer should not need the diff to understand the intent.
- Link the issues a PR resolves with `Closes #N` at the bottom of the description.
- Include screenshots for UI changes.

## Code style

- TypeScript and Svelte 5 runes (`$state`, `$derived`, `$effect`); eslint and svelte-check enforce the rest, and warnings fail the gate.
- Match the style of the surrounding code and keep comments sparse; the code and names carry the documentation.
- Use the app's modal and notification primitives in `src/lib/overlays` rather than browser `alert`/`confirm`/`prompt`.
- American English in code, comments, and docs.

## Reporting issues

Open a [GitHub issue](https://github.com/judahpaul16/canarygc/issues) with the autopilot stack and firmware version, how the app is deployed (compose profile or the hardware build), the browser, and the relevant output from the `/event-log` page or `docker compose logs`.

## License

Contributions are accepted under the project's [MIT License](LICENSE.md).
