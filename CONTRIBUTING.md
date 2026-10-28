# Contributing

Thanks for helping. Protégé is a Next.js app; [CLAUDE.md](CLAUDE.md) describes how it is put
together and the rules the code keeps to.

## Running it

```bash
npm install
npm run dev
```

You need Node.js 20 or later (22.6 or later to run the tests) and Claude Code, installed and
signed in. Open http://127.0.0.1:4317.

The development server shows your code changes straight away, but it is much slower to use: it
compiles each page the first time you open it, and again after every change, which can take a few
seconds. To use Protégé day to day, run `npm run build` then `npm start` instead.

## Before you send a change

Run the same checks CI runs:

```bash
npx tsc --noEmit
npm test
npm run build
```

A few rules the code relies on:

- **Starting Claude Code:** only `src/lib/engine.ts` starts it. Import `query` from
  `@/lib/engine`, never from the SDK.
- **API calls from pages:** go through `apiFetch` (`src/lib/api-client.ts`), so they meet the
  request checks in `src/middleware.ts`.
- **Project ids to folders:** turn into folders only through `projectDir`
  (`src/lib/project-guard.ts`).
- **New API routes:** are covered by the request checks automatically. Don't add exceptions to
  them.
- **Words in the interface:** plain words, for people who don't write code. Say what something
  is, not its internal name.
