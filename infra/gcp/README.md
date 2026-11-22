# GCP deployment preparation

The app targets Node 24 on Cloud Run. `Dockerfile` produces an unprivileged Next.js standalone image listening on Cloud Run's `PORT` (8080 by default). Deploy only after setting up a billing-enabled project, Artifact Registry, service account, RPC credentials, and the deployed Solana program. Nothing is deployed by this repository.

## Build and review

From the repository root, after a successful `npm ci && npm run check`:

```sh
gcloud builds submit --config infra/gcp/cloudbuild.yaml --project YOUR_PROJECT
```

Cloud Build pushes an image tagged with its build ID. Review the image and deploy that immutable tag to Cloud Run. Keep the service private for this prototype (`--no-allow-unauthenticated`); configure an authenticated front door and explicit webhook ingress before serving operators or webhook providers. Do not expose the financial administration surface with anonymous write endpoints.

```sh
gcloud run deploy brim-web \
  --image us-central1-docker.pkg.dev/YOUR_PROJECT/brim/web:BUILD_ID \
  --region us-central1 --project YOUR_PROJECT \
  --port 8080 --no-allow-unauthenticated \
  --service-account brim-web@YOUR_PROJECT.iam.gserviceaccount.com
```

## Database and secrets

- Use Cloud SQL for PostgreSQL with private connectivity and the Cloud SQL connector or Unix socket mounted via Cloud Run's Cloud SQL attachment. The SQL schema lives in `packages/indexer/migrations`. Apply migrations as a separate deployment job, never on a request path.
- Store RPC credentials, webhook bearer authorization, and database credentials in Secret Manager; grant access only to the runtime service account. Never place session keys or treasury keys in app configuration. The service does not need a signing key to index payments.
- Helius delivery needs reachable ingress. Use a separate constrained ingestion service or authenticated routing and validate the configured Helius Authorization header at the application layer. Cloud Run IAM authentication and a Helius bearer header are different mechanisms.
- Until wallet authentication, owner-authorized transactions, a compatible facilitator, and verified chain ingestion are integrated, the UI is a browser-local demo. Do not market a deployment as a live treasury console.
- Next.js `NEXT_PUBLIC_*` values are build-time public configuration. Do not place secrets in them. Set the public app mode before building; runtime environment changes cannot rewrite the browser bundle.

No paid cloud resources are created by these files. GCP credentials are not configured in the current workspace.

## Public site and docs

`npm run build:site` creates a standalone static export at `apps/site/out/`. Serve that directory on the public site origin with directory index support for `/docs/` and its guides. The Fumadocs search index ships with the export. The public bundle needs no Solana keys, RPC secrets, or database connection.
