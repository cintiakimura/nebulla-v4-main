# Nebulla UI Generation Sequence

This document defines the exact process Nebulla must follow to generate UI for a page.  
It is sequential on purpose. Later steps depend on earlier steps.  
Do not skip steps. Do not reorder steps. Do not invent missing product truth when Master Plan data is insufficient.

The purpose of this sequence is to produce usable, structured, high-quality React + Tailwind UI that reflects the Master Plan, not a generic random interface.

UI Studio Beta is the delivery and refinement surface.  
The intelligence of the process lives in this sequence.

---

## Step 1 — Verify that generation is allowed to start

Before any UI generation begins, confirm that the project is in a valid state.

First, confirm that an active project exists.  
Second, confirm that a Master Plan exists for that project.  
Third, confirm that the Master Plan contains enough information to describe the product with minimum reliability. The minimum useful information is:

- what the product is
- what type of product it is
- at least one meaningful page definition
- some UI direction, even if partial

If these are missing, generation must not pretend to know the product.  
In that case, either return to discovery to gather the missing information, or generate only a clearly limited skeleton and mark it as incomplete.

This step exists because every later decision depends on product truth. Without product truth, reference selection and generation become guesswork.

---

## Step 2 — Gather the Master Plan information in full

Once generation is allowed, collect the Master Plan context carefully.

Read the project identity: the project name, the core goal of the product, and the intended user.  
Read the Project Type and determine whether this is mainly a web app, mobile app, landing page, or another supported type.  
Read the product features and infer the product function. This is how Nebulla knows whether the product behaves like a course platform, an e-commerce store, a SaaS admin tool, a booking product, a community product, or something else.  
Read any industry signals if they are present, such as education, finance, health, or retail. If industry is unclear, use a safe general value rather than forcing a wrong one.

Then gather the page-level information. From Pages and Navigation, extract the page being generated, its purpose, its major sections, its primary actions, and how it relates to the rest of the navigation.  
Then gather the UI/UX information. From the UI/UX section, extract visual tone, palette direction, density expectations, typography notes, and any explicit style constraints.

This step is the foundation. The system is not allowed to replace Master Plan truth with generic assumptions when the Master Plan already provides usable direction.

---

## Step 3 — Classify the generation target

After the Master Plan has been gathered, convert that information into a structured classification.

Classification is a backend responsibility. It must not depend on the user filling a manual form in UI Studio.

From the gathered information, determine:

- the device family for the page
- the page type
- the product function
- the industry
- the likely complexity
- the navigation pattern
- the density expectation

This classification is required before reference selection because the system needs a stable way to decide what kind of UI references are relevant.  
A dashboard for a course platform is not the same problem as a landing page for a consumer brand, and a mobile profile page is not the same problem as a web settings page.

If some classification fields are uncertain, choose the most conservative valid interpretation based on the Master Plan. Do not overclaim certainty.

Suggested classification shape:

- device: web | mobile | landing
- page_type: dashboard | auth | settings | list | detail | landing | checkout | profile | other
- function: saas_admin | course | ecommerce | booking | marketplace | community | marketing | general
- industry: education | finance | health | retail | general | other
- complexity: simple | medium | rich
- navigation_type: sidebar | topnav | tabs | none
- density: spacious | medium | compact

---

## Step 4 — Build the page generation brief

Once classification is complete, construct a detailed generation brief for the specific page.

The brief is the main instruction package that later generation must follow. It should be rich enough that the model does not need to invent the product structure from scratch.

The brief must explain:

- the goal of the page
- who the page is for
- what the user should be able to accomplish there
- the required layout structure
- the required sections in a sensible order
- the primary call to action
- any important secondary actions
- the content inventory that should appear, such as metrics, tables, forms, cards, filters, or status indicators
- the visual contract from the Master Plan UI/UX guidance
- the constraints that protect quality, including hierarchy, spacing discipline, and rejection of clutter

This step depends on Steps 2 and 3.  
Without Master Plan context, the brief is empty.  
Without classification, the brief cannot be correctly framed for device and page type.

The brief should be specific. Weak briefs produce weak UI.

---

## Step 5 — Decide which reference resources are needed

After the brief exists, determine what kinds of references should guide generation.

References are not the final design. They are structural and stylistic guidance.  
They help the system avoid inventing poor layouts from nothing.

Based on classification and the brief, decide which resource categories matter for this page. That may include full-page template patterns, navigation patterns, card patterns, table patterns, form patterns, button styles, section layouts, and where relevant, icon or imagery style direction.

The selection criteria must be explicit and ordered by importance:

1. device
2. page type
3. product function
4. industry when available
5. navigation pattern
6. component needs
7. density and tone

This order matters. A beautiful reference in the wrong device class or wrong page type is still the wrong reference.

---

## Step 6 — Retrieve candidate references

Once the criteria are known, retrieve candidate references from the available sources.

The preferred temporary source is the curated Figma reference library connected to Nebulla.  
If Figma is unavailable, rate-limited, misconfigured, or returns weak matches, fall back to the internal seed pattern library.

Retrieve more than one candidate when possible. A small set of strong matches is better than one rigid template.  
Rank the candidates by how well they match the criteria from Step 5.

Do not stop the whole generation process if Figma fails. The sequence must continue with fallback patterns.

---

## Step 7 — Adapt the selected references to the Master Plan

Selected references must be adapted, not copied.

This step is critical. The system should learn structure from references while remaining loyal to the Master Plan.

Adaptation means:

- keep layout ideas that support the page goal
- discard decorative or irrelevant parts of the reference
- replace generic reference content with Master Plan content
- enforce Nebulla design rules and tokens
- ensure navigation matches the actual product type and page definition
- ensure required sections from the brief remain present

By the end of this step, the system should have a constrained generation package that contains:

- the page brief
- the adapted structural guidance
- the design system rules
- the quality rules

Only after this package exists should generation run.

---

## Step 8 — Generate the UI with Grok under constraints

Now generate the actual UI.

Grok must receive the full constrained package from the previous step.  
It must generate a complete React + Tailwind implementation of the page or page component.

The generation must obey the brief, the adapted structure, and the quality rules.  
It must not invent a different product.  
It must not abandon required sections.  
It must not introduce cluttered decoration, weak contrast, random gradients, or chaotic layout behavior.

The output should be readable, structured, and practical enough for a user to refine in UI Studio Beta.

If the first result is clearly missing required parts of the brief, perform one controlled repair pass that explicitly corrects the deficiencies. Do not enter an endless regeneration loop.

---

## Step 9 — Deliver the result into UI Studio Beta

After generation, deliver the result into UI Studio Beta for inspection and refinement.

The generated UI must appear in the preview.  
Elements should be selectable.  
The right-side Properties panel should allow practical refinement of text, color, size, spacing, border, shadow, and order.  
Code export must remain available so the user can obtain the full generated code.

The original UI Studio page and any legacy V0 path must remain untouched.

This step is where the user reviews whether the generated structure is acceptable enough to keep refining.

---

## Step 10 — Allow controlled human refinement

After delivery, the user may refine the result manually.

This is expected. The generator is responsible for producing a strong structured starting point, not a perfect final visual design in every case.

Valid refinements include text changes, color adjustments, spacing changes, border changes, shadow changes, reordering, and deletion of weak elements.  
These refinements should not destroy the underlying page purpose defined by the Master Plan.

When the user saves, the accepted version becomes part of the project workspace.

---

## Step 11 — Record generation metadata for later improvement

After a generation cycle, store the important metadata that explains how the result was produced.

This should include the classification used, a summary of the brief, which references were selected, whether Figma or fallback patterns were used, and whether the user accepted or heavily modified the result.

This information is not needed for the immediate user experience, but it is essential for later improvement. Over time, it becomes the basis for replacing live Figma dependence with a stronger internal pattern system and a more specialized generator.

---

## Hard rules that always apply

1. Master Plan truth comes before decorative creativity.
2. Classification happens before reference selection.
3. Brief construction happens before generation.
4. References guide structure; they do not replace the Master Plan.
5. If Figma fails, fallback patterns must be used.
6. One controlled repair pass is allowed; endless regeneration is not.
7. UI Studio Beta is for delivery and refinement, not for redefining product truth.
8. The original UI Studio / V0 path must not be broken by this sequence.

---

## Operating principle

Follow the chain in order:

**Master Plan → classification → brief → reference criteria → reference retrieval → adaptation → constrained generation → UI Studio Beta delivery → human refinement → metadata capture**

Each step exists because the next step depends on it.
