# Security and performance

## Security
- Require login even for a single user.
- Use secure session cookies and CSRF protection.
- Validate and sanitize all user input.
- Store secrets in environment variables, never in git.
- Backups enabled at the database level.

## Performance
- Index training dates and status for fast lists.
- Cache geocoding results to avoid slow repeats.
- Keep response payloads small; use pagination.
- Avoid heavy JS and large client bundles.

## Reliability
- Log errors with request context.
- Add basic health checks for uptime monitoring.
