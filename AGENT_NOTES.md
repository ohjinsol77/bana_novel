# Agent Notes

## API Smoke Test and CI Summary

Last updated: 2026-04-02

This project now has a reusable API smoke test and a GitHub Actions CI workflow for basic regression coverage.

### What was added

- API smoke test script: `scripts/api-smoke-test.mjs`
- npm command: `npm run api:smoke`
- CI workflow: `.github/workflows/ci.yml`

### What the smoke test covers

The smoke test starts an isolated backend process on port `4101` and runs realistic user flows end-to-end.

Covered flows:

- health check
- local register / login / me
- invalid register and login cases
- SMS request / verify dev flow
- PASS request / verify / complete flow
- top-up before and after PASS verification
- story create / list / detail / settings update / update / delete
- invalid story create/update cases
- chat write / history / AI message edit / clear
- binding prepare / complete
- public request flow for normal users
- admin token bootstrap via `/api/auth/apple`
- admin dashboard / story review / visibility / point settings / point adjust
- community feed and public feed visibility checks

### Important implementation details

- The smoke test forces `GEMINI_API_KEY=your_gemini_api_key_here` so chat uses the mock response path instead of making a real external AI call.
- Test users and phone verification records are created with unique suffixes and cleaned up at the end of the run.
- The smoke test uses the database configured by `server/.env` unless CI overrides it.

### Bugs fixed while validating APIs

- `GET /api/stories/community` had been declared after `GET /api/stories/:id`, so `community` could be swallowed by the dynamic route. The static route was moved earlier in `server/routes/stories.js`.
- Story create/update validation errors such as missing title or too many characters were returning `500` instead of client errors. These now return proper `400`/`404` style responses.
- Story delete now returns `404` when the target story does not exist instead of always returning `{ ok: true }`.

### Useful commands

- Run smoke test: `npm run api:smoke`
- Type check: `npx tsc --noEmit`
- Production build: `npx vite build`

### CI notes

The GitHub Actions workflow:

- starts MySQL 8.4 as a service
- installs dependencies with `npm ci`
- runs type-check
- runs production build
- runs `npm run api:smoke`

File location:

- `.github/workflows/ci.yml`

### If API work is changed later

If routes, auth flow, story flow, point flow, or binding flow are changed, rerun:

```bash
npm run api:smoke
```

If this fails, inspect the smoke test expectations first before assuming the frontend is wrong. The script is intended to be the current backend regression baseline.
