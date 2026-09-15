# Routes

Chinese defaults to `/`, English to `/en/`. Article route wrappers delegate to shared components. Each published translation has a self-canonical URL and links to its real counterpart. The two article XML sitemaps each contain only their own directory descendants.

`api/` and public-record profile routes use the existing Node middleware. `book*` and draft previews stay out of search discovery. See the root README for production serving and deployment.
