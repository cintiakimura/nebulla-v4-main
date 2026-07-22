# Code Review Checklist (Concise) - For Coding Phase

Grok MUST scan this list mentally before every code output or file block.

## High Priority (Always Check First)
1. Import / path / "Module not found" errors
2. Null / undefined access ("cannot read property of null/undefined")
3. Missing or wrong environment variables / API keys
4. HTTP errors (404, 400, 401, 403, 429, 500, CORS)
5. Security issues (SQL/command injection, hardcoded secrets, auth bypass)
6. Boundary / off-by-one / empty / null inputs
7. React hydration mismatches or state issues
8. Performance (infinite loops, memory leaks, N+1 queries)

## Medium Priority
- Concurrency / race conditions
- Database (constraints, connection pool exhaustion)
- Floating point / precision loss
- Resource leaks (files, DB connections, sockets)
- Dependency / version conflicts

## Quick Rules
- Make the smallest possible fix
- Always validate after change
- Prefer explicit checks over assumptions
- If error occurs → switch to full-bug-database.md for detailed remedy

When a specific error appears, identify its category and use the matching entry from full-bug-database.md.
