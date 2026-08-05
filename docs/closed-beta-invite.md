# Closed beta invite note

Copy/adapt this when inviting 3–5 partners after prod readiness is green.

---

**Subject:** Nebulla closed beta — you’re invited

Hi —

You’re invited to the **Nebulla closed beta** (invite-only, free during beta).

**What to try (one path):**
1. Sign in → create a project  
2. Plan (Master Plan)  
3. **UI Studio Beta** → Generate UI  
4. Run one **Go** slice  
5. Open **App Preview**

Bring your own **Grok/xAI** API key (BYOK). No payment on Nebulla during closed beta.

**Out of scope for this wave:** Legacy V0 Studio, Pencil live mockups, billing/checkout.

**Feedback (reply with short answers):**
1. Where did you get stuck or confused first?  
2. Did Plan → Generate UI → Go → Preview feel coherent?  
3. What’s the one thing that would make you use this again next week?

Security / account issues: `security@nebulla.dev`

Thanks —  
Nebulla

---

## Operator checklist before sending

- [ ] Deploy current branch; `GET /api/ops/readiness` → 200  
- [ ] Manual prod E2E of the path above  
- [ ] `BILLING_ENABLED` and `APP_PREVIEW_PUBLIC` unset  
- [ ] See `docs/closed-beta-runbook.md`
