# Incremental Development Method (Build → Debug → Next)

**Goal:** Maximize code quality and token efficiency by implementing and validating small coherent slices instead of generating large amounts of code at once.

## Core Rule

Never implement the entire application in one large generation when it can be broken into clear slices.  
Prefer: **Build one slice → Debug/Validate that slice → Only then move to the next slice.**

## Recommended Slice Order (adapt to the project)

1. Foundation (project setup, routing shell, basic layout)
2. Authentication / access control (if required)
3. Core data models + main API routes
4. Primary user feature (the main value of the app)
5. Secondary features (one at a time)
6. Integration polish + edge cases

## Rules for each slice

### 1. Build
- Implement only what belongs to the current slice
- Follow the Master Plan and architecture
- Prefer the smallest coherent set of files

### 2. Debug / Validate (mandatory before next slice)
- Apply NDM (Verify → Analyze → Trace → Fix → Validate)
- Confirm the slice works for its main happy path
- Fix issues while the context is still small
- Do not move forward with known broken behaviour

### 3. Next
- Only after the current slice is stable, start the next one
- Keep previous slices intact unless a real dependency requires a minimal change

## Efficiency Rules

- Send only the relevant files/context for the current slice when debugging
- Avoid re-sending the entire project on every step
- Prefer focused fixes over broad rewrites
- Stop and validate early — late debugging of large broken code is more expensive

## Quality Rules

- Each slice must respect the architecture-first approach
- Do not introduce temporary hacks that will be “fixed later”
- Keep code clean and consistent across slices
- After the final slice, run a light end-to-end validation of the main user flows

## When a larger generation is allowed

Only when:
- The slice is naturally small, or
- The user explicitly requests a broader generation, or
- The architecture is already very clear and the risk is low

Even then, still validate before expanding further.
