# Security

Protégé runs Claude Code on your computer, as you. A flaw that lets anyone else reach it could let
them run commands or read files on that computer, so security reports are welcome and taken
seriously.

## Reporting a problem

Please report it privately, through GitHub's **Report a vulnerability** button on this
repository's Security tab, rather than in a public issue. Include what you found, how to
reproduce it, and what it lets someone do.

## What Protégé protects against

These are the protections described in the README's Safety section, and each is a bug if it can
be got around:

1. **Other computers.** Protégé listens on 127.0.0.1 only (app on port 4317, previews on 4318).
2. **Other websites open in your browser.** Every API request must be sent to 127.0.0.1 or
   localhost, must come from a Protégé page itself, must send JSON for anything that makes a
   change, and must carry this install's access key (a cookie other sites can't send or read).
3. **Arbitrary folders.** The API works only in registered projects, folders Claude Code has been
   used in, and the demo projects.
4. **Project previews.** A project's web page is served from its own origin, in a sandboxed
   frame, and can't call Protégé's API.
5. **Commands.** The only command "Run checks" runs is the one the project itself defines.

## What it doesn't protect against

- **Other programs running as you on the same computer.** They can read the access key in
  `data/install-token`, like any of your files.
- **What Claude Code itself does in a project.** It acts with the permission mode you choose; use
  Plan mode or Ask permissions for folders you don't trust.
