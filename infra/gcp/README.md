# GCP test deployment

Project `brim-app-20261124` (number `904154865340`) hosts two public Cloud Run services in `us-central1`:

| Service     | Purpose                                        | Default origin                                       |
| ----------- | ---------------------------------------------- | ---------------------------------------------------- |
| `brim-site` | Marketing, static docs, search, agent Markdown | `https://brim-site-904154865340.us-central1.run.app` |
| `brim-web`  | Next.js dashboard in Demo workspace            | `https://brim-web-904154865340.us-central1.run.app`  |

This deployment is for browser demo testing. It does not deploy a Solana program, execute public devnet payments, or provision the activity database. Demo controls simulate changes in the browser. Local-only write routes return 404 in production, the public activity feed is disabled, and unconfigured webhook intake returns 503.

## Continuous deployment

`.github/workflows/ci.yml` runs formatting, TypeScript/unit checks, both production builds, native contract tests, and chain/database/payment integration tests. A push to `main`, or a manual workflow dispatch on `main`, deploys only after all three check jobs pass. Pull requests and other branches do not deploy. Runs on the same ref are serialized.

The deploy job builds the `runtime` and `site` Dockerfile targets, pushes both images to the `brim` Artifact Registry repository, and deploys by digest. Tags include the commit, workflow run ID, and attempt, and the registry enforces immutable tags. The workflow then runs `scripts/smoke-deployment.mjs` against both public origins. Its summary records the commit, URLs, and image digests. A failed smoke test fails the workflow; it does not automatically roll back.

All public routing configuration is in `infra/gcp/deploy.env`. The site dashboard link and dashboard SDK docs link are baked into their images during the build. The runtime target deliberately builds in demo mode. Enabling live wallet flows requires a separate, reviewed build configuration and deployed program.

GitHub uses Workload Identity Federation, not a stored service-account key. The provider allows only repository ID `1467581326`, owner ID `28870847`, and `refs/heads/main`. The `brim-deploy` account can deploy Cloud Run services, write to the `brim` registry, and act as the two runtime service accounts. The runtime accounts have no application-level project roles. Public invocation was configured once during bootstrap; the deployment identity cannot change IAM policies.

## Runtime and billing

Both services use request-based CPU billing and scale from zero to a maximum of two service instances. The dashboard has 1 vCPU/512 MiB and concurrency 40; the static site has 1 vCPU/256 MiB and concurrency 80. Registry storage, compute, builds, logging, and traffic can incur charges. The project uses the Primary billing account.

A $50 monthly project budget alerts at 50%, 90%, and 100%. A budget is an alert, not a spending cap. There is no Cloud SQL instance or paid load balancer for this demo deployment.

## Verify or roll back

Run the same HTTP checks locally with Node 24:

```sh
set -a
. infra/gcp/deploy.env
set +a
node scripts/smoke-deployment.mjs
```

Inspect previous ready revisions and route traffic to the selected revision:

```sh
gcloud run revisions list --service brim-web --region us-central1 --project brim-app-20261124
gcloud run services update-traffic brim-web --to-revisions PREVIOUS_READY_REVISION=100 --region us-central1 --project brim-app-20261124
```

Repeat for `brim-site` when a release changes both services. Update the source or revert the deployment commit before the next push to `main`, which will deploy the current source again.

`cloudbuild.yaml` remains an optional manual image-build configuration. GitHub Actions is the automatic deployment path; no Cloud Build trigger is needed.

## Add brim.sh later

Register the domain, configure an HTTPS front door such as Firebase Hosting for the existing services, and verify its DNS and certificates. Update `BRIM_SITE_URL` and `BRIM_APP_URL` in `deploy.env` and deploy again so the public links use the new domains. The service names, project, registry, and deployment identity can stay the same. No domain has been purchased or configured by this deployment.

## Real devnet payments

Deploy and verify the Brim program, configure a compatible x402 facilitator and public RPC, and exercise wallet-signed devnet flows before enabling them for users. Verified Activity additionally requires Cloud SQL PostgreSQL, migrations run as a separate job, server-only Secret Manager credentials, authenticated webhook intake, explicit tracked vaults, and reconciliation. Keep treasury and agent signing keys out of the web service. See `apps/site/content/docs/production.mdx` for the application's current boundaries.
