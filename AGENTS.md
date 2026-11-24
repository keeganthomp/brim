# Brim project instructions

Brim is a public open-source project. Treat every tracked file, commit, build artifact, and CI log as public.

- Never commit or push credentials, API tokens, private keys, seed phrases, private user data, real secret-bearing environment files, or generated signing material.
- Keep secrets in ignored local files or the deployment platform's secret store. Prefer keyless CI authentication. Never place secrets in `NEXT_PUBLIC_*` variables or Docker build arguments.
- Review the actual staged diff and run a secret scan before pushing. Keep credential files out of Git and Docker build contexts. Check generated files and logs as well as source code.
- Use placeholders in examples and clearly label intentionally fake local-test credentials. Public program addresses, service URLs, and cloud resource identifiers are not authentication credentials, but publish them only when intentionally needed.
- If a real secret is found in published history, stop publishing it, report the exposure without repeating its value, and revoke or rotate it. Removing it from the latest file does not remove it from history.
- Never use em dashes in user-facing writing.
