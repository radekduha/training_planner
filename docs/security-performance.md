# Security and performance

## Security
- Require login for internal planners.
- Use secure session cookies and CSRF protection.
- Validate and sanitize all user input.
- Store secrets in environment variables, never in git.
- Enable backups at the database level.

## Performance
- Index request windows, slot times, and assignment relations for fast matching.
- Keep matching payloads compact and paginated when needed.
- Target low-latency assignment commits and realtime updates for small team usage.
- Avoid unnecessary client bundle growth.

## Reliability
- Log matching and assignment errors with request context.
- Add health checks for API and realtime channel.
- Use transactional writes on assignment to prevent double booking.
