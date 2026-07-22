# Full Bug Database - Detailed Reference

Use this file **only** when a specific error occurs during validation, testing, or runtime.

**Instructions for Grok:**
1. Identify the exact error message and category
2. Find the matching row below
3. Use the Prevention / Fix Tips + Real Code Example to remedy
4. Follow NDM strictly: Verify → Analyze → Trace → Fix (smallest change) → Validate
5. Output only the minimal fix as file: blocks

---

| Bug Category | Description / Examples | Prevention / Fix Tips | Common Error Codes / Messages | Real Code Example (Faulty) |
|--------------|------------------------|-----------------------|-------------------------------|----------------------------|
| **Syntax Errors** | Missing semicolons, brackets, indentation | Linters + format on save | `SyntaxError`, `IndentationError` | `if x > 5 print(x)` (missing `:`) |
| **Logical Errors** | Off-by-one, wrong comparisons, flawed logic | Unit tests, assertions | Silent wrong output | `for(i=0; i<=arr.length; i++)` |
| **Runtime Errors** | Null/undefined access, division by zero | Null checks, validation | `NullPointerException`, `TypeError` | `obj.method()` where obj is null |
| **Performance Bugs** | Memory leaks, inefficient loops/queries | Profiling, optimization | `OutOfMemoryError` | Growing array in infinite loop |
| **Security Vulnerabilities** | SQL/XSS injection, hardcoded secrets | Sanitization, secrets manager | SQL errors on injection | `db.query("SELECT * FROM users WHERE id=" + id)` |
| **HTTP 4xx / 5xx** | 404 Not Found, 400 Bad Request, 500 Internal | Proper routing + global handlers; `fetch` does **not** throw on 404 — always check `response.ok` | **404**, **400**, **500** | Client calls `/api/.../v0-clear` with no matching `app.post` |
| **API route mismatch** | Frontend path ≠ server route | Grep both client + `server.ts` before shipping | **404**, silent catch | `fetch('/api/nebula-ui-studio/v0-clear')` without server handler |
| **Boundary / Edge Cases** | Empty inputs, min/max values, negative numbers | Boundary testing | `IndexOutOfBounds`, `ValueError` | `arr[arr.length]` |
| **Concurrency Bugs** | Race conditions, deadlocks | Locks, atomic operations | `Deadlock`, race failures | `counter++` without synchronization |
| **React / Frontend** | Hydration mismatches, stale state | Consistent rendering, proper deps | Hydration error | Client-only code during SSR |
| **Database Bugs** | Constraint violations, pool exhaustion | ORMs, proper indexing | `UniqueViolation`, `TooManyConnections` | No connection pooling |
| **Environment / Config** | Missing env vars, wrong paths | Validation at startup | `ConfigurationError` | `process.env.API_KEY` undefined |
| **Resource Leaks** | Unclosed files/connections | Try-with-resources | `TooManyOpenFiles` | `fs.open()` without close |
| **Floating Point** | Precision loss | Use Decimal/BigInt | `0.1 + 0.2 !== 0.3` | Direct float comparison for money |
| **API / Network** | Timeouts, CORS, rate limits | Retry logic, proper headers | **429**, `CORS blocked`, `ECONNREFUSED` | Missing CORS middleware |
| **Mobile-Specific** | Permission denials, battery drain | Graceful fallbacks | `PermissionDenied` | Location access without checking |
| **Cloud / Deployment** | Quota exceeded, cold starts, suspended service | Monitoring, proper scaling | `QuotaExceeded`, **503** | No auto-scaling; Render suspended |
| **AI/ML Specific** | Hallucinations, OOM on inference, empty LLM output | Grounding + quantization; surface upstream errors | `NaN` loss, empty `choices[0].message.content` | Unconstrained LLM output |
| **Blockchain** | Reentrancy, gas limit | Checks-Effects-Interactions | `ReentrancyGuard`, `OutOfGas` | `withdraw()` before balance update |

**Additional Categories (expand as needed):**
- Authentication bugs (401/403 bypass)
- Dependency version conflicts
- Internationalization (wrong date formats)
- Accessibility violations
- Caching (stale data)
- Logging sensitive information

When fixing: Always make the **smallest possible change** and re-validate.
