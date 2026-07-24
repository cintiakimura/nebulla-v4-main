file:///Users/cintiakimura/Downloads/nebulla-v4-main/nebulla-project/ui-generation-engine-manual.md {"mtime":1784882561039,"ctime":1784878835410,"size":15071,"etag":"3gdk3ab2hfl5","orphaned":false,"typeId":""}
**Nebulla UI Generation Engine — Absolute-Control Task Manual**

This is the strict script for UI generation.  
You must follow it in order.  
You may complete only **one subtask at a time**.  
You must not start the next subtask until the current subtask is finished and written into `nebulla-project/ui-generation-context.md` when the subtask requires writing.

You must not invert the sequence.  
You must not merge subtasks.  
You must not jump to code early.  
You must not invent missing product truth.

Source files:
- `nebulla-project/ui-generation-sequence.md`
- `nebulla-project/ui-generation-context.md`

`ui-generation-context.md` is the notebook and source of truth for the cycle.

----------------------------------------

## PHASE 0 — RULES OF BEHAVIOR

### 0.1
Read this manual as a script, not as inspiration.

### 0.2
Work in strict ascending order: 1.1, then 1.2, then 1.3, and so on.

### 0.3
Complete only one subtask at a time.

### 0.4
When a subtask says to write something, write it into `ui-generation-context.md` immediately before continuing.

### 0.5
If required information is missing, write that it is missing. Do not invent it.

### 0.6
If Figma fails, continue with fallback patterns. Do not stop the whole engine only because Figma failed.

### 0.7
Do not modify the original UI Studio / V0 page while running this engine.

----------------------------------------

## PHASE 1 — START THE CYCLE

### 1.1
Open `nebulla-project/ui-generation-context.md`.

### 1.2
Treat this as a new generation cycle.

### 1.3
Clear old cycle values that belong to a previous page generation so old decisions do not contaminate the new cycle.

### 1.4
Write a new `context_id`.

### 1.5
Write `project_name` if known.

### 1.6
Write `page_name` if known.

### 1.7
Write `created_at`.

### 1.8
Write `status = in_progress`.

### 1.9
Write `current_step = 1`.

### 1.10
Write in the step log that Phase 1 started cleanly.

### 1.11
Stop and confirm Phase 1 is complete before moving on.

----------------------------------------

## PHASE 2 — VERIFY GENERATION IS ALLOWED

### 2.1
Check whether an active project exists.

### 2.2
If no active project exists, write the failure into the context file, set status to failed, and stop the engine.

### 2.3
Check whether a Master Plan exists for the active project.

### 2.4
If no Master Plan exists, write the failure into the context file, set status to failed, and stop the engine.

### 2.5
Check whether the Master Plan has minimum product truth:
- what the product is
- what type of product it is
- at least one meaningful page
- some UI direction if available

### 2.6
If minimum product truth is missing, write that the Master Plan is too weak, set the cycle to failed or pending discovery, and stop the engine.

### 2.7
If minimum product truth exists, write that verification passed.

### 2.8
Update `current_step` to Phase 2 complete.

### 2.9
Stop and confirm Phase 2 is complete before moving on.

----------------------------------------

## PHASE 3 — GATHER MASTER PLAN FACTS

### 3.1
Read the product goal from the Master Plan.

### 3.2
Write the product goal into section 1 of the context file.

### 3.3
Read the target user from the Master Plan.

### 3.4
Write the target user into the context file.

### 3.5
Read the project type from the Master Plan.

### 3.6
Write the project type into the context file.

### 3.7
Read the product features from the Master Plan.

### 3.8
Infer the product function from those features and the product goal.

### 3.9
Write the product function into the context file.

### 3.10
Read any industry signals from the Master Plan.

### 3.11
If industry is clear, write it. If not clear, write `general`.

### 3.12
Read the target page definition from Pages and Navigation.

### 3.13
Write the page name into the context file.

### 3.14
Write the page purpose into the context file.

### 3.15
Write the primary actions into the context file.

### 3.16
Write the secondary actions into the context file if present.

### 3.17
Write the required sections into the context file.

### 3.18
Write the navigation role of the page into the context file.

### 3.19
Read the UI/UX direction from the Master Plan.

### 3.20
Write visual tone into the context file.

### 3.21
Write palette direction into the context file if present.

### 3.22
Write density expectation into the context file if present.

### 3.23
Write typography notes into the context file if present.

### 3.24
Write explicit style constraints into the context file if present.

### 3.25
If any expected fact was not found, write explicitly that it was not found.

### 3.26
Update the step log to show Phase 3 is complete.

### 3.27
Stop and confirm Phase 3 is complete before moving on.

----------------------------------------

## PHASE 4 — CLASSIFY THE GENERATION TARGET

### 4.1
Read only the Master Plan extracts already written in the context file.

### 4.2
Decide the device: web, mobile, or landing.

### 4.3
Write the device into the classification section.

### 4.4
Decide the page type, such as dashboard, auth, settings, list, detail, landing, checkout, profile, or other.

### 4.5
Write the page type into the classification section.

### 4.6
Decide the product function label.

### 4.7
Write the product function into the classification section.

### 4.8
Decide the industry label.

### 4.9
Write the industry into the classification section.

### 4.10
Decide the complexity: simple, medium, or rich.

### 4.11
Write the complexity into the classification section.

### 4.12
Decide the navigation type: sidebar, topnav, tabs, or none.

### 4.13
Write the navigation type into the classification section.

### 4.14
Decide the density: spacious, medium, or compact.

### 4.15
Write the density into the classification section.

### 4.16
Write classification notes explaining why these values were chosen.

### 4.17
Write confidence as high, medium, or low.

### 4.18
If any classification is uncertain, choose the conservative option and say so in the notes.

### 4.19
Update the step log to show Phase 4 is complete.

### 4.20
Stop and confirm Phase 4 is complete before moving on.

----------------------------------------

## PHASE 5 — BUILD THE PAGE BRIEF

### 5.1
Read section 1 and section 2 of the context file.

### 5.2
Write the page goal in concrete language.

### 5.3
Write the audience in concrete language.

### 5.4
Write the layout contract, including navigation expectations.

### 5.5
Write the required section order.

### 5.6
Write the primary CTA.

### 5.7
Write secondary CTAs if present.

### 5.8
Write the content inventory for metrics, if any.

### 5.9
Write the content inventory for tables or lists, if any.

### 5.10
Write the content inventory for forms, if any.

### 5.11
Write the content inventory for cards or panels, if any.

### 5.12
Write any other required components.

### 5.13
Write the visual contract using Master Plan UI/UX direction.

### 5.14
Write hierarchy rules.

### 5.15
Write spacing rules.

### 5.16
Write component limits and anti-clutter constraints.

### 5.17
Write the final brief text that will later be sent to the model.

### 5.18
Check that the brief is specific and not vague.

### 5.19
If the brief is still vague, strengthen it using only known Master Plan facts.

### 5.20
Update the step log to show Phase 5 is complete.

### 5.21
Stop and confirm Phase 5 is complete before moving on.

----------------------------------------

## PHASE 6 — DEFINE REFERENCE NEEDS

### 6.1
Read the classification section.

### 6.2
Read the brief section.

### 6.3
Write the reference criteria in this exact priority order:
1. device
2. page type
3. function
4. industry
5. navigation pattern
6. component needs
7. density and tone

### 6.4
Decide whether page templates are needed and write yes or no.

### 6.5
Decide whether navigation patterns are needed and write yes or no.

### 6.6
Decide whether section patterns are needed and write yes or no.

### 6.7
Decide whether component patterns are needed and write yes or no.

### 6.8
Decide whether icon or asset references are needed and write yes or no.

### 6.9
Write the full resource request list into the context file.

### 6.10
Update the step log to show Phase 6 is complete.

### 6.11
Stop and confirm Phase 6 is complete before moving on.

----------------------------------------

## PHASE 7 — RETRIEVE REFERENCES

### 7.1
Check whether `FIGMA_API_KEY` is available.

### 7.2
If available, attempt Figma reference retrieval using the criteria from Phase 6.

### 7.3
If Figma retrieval succeeds, write the candidate list into the context file.

### 7.4
If Figma retrieval fails, is missing, or is weak, write the failure into the context file.

### 7.5
If Figma is unavailable or weak, load internal seed pattern fallbacks.

### 7.6
Write whether the source is figma, seed, or mixed.

### 7.7
Rank the candidates by match quality.

### 7.8
Select the best references.

### 7.9
Write the selected references into the context file.

### 7.10
Write why each selected reference was chosen.

### 7.11
Write rejection notes for strong candidates that were not chosen, if relevant.

### 7.12
Update the step log to show Phase 7 is complete.

### 7.13
Stop and confirm Phase 7 is complete before moving on.

----------------------------------------

## PHASE 8 — ADAPT REFERENCES TO MASTER PLAN

### 8.1
Read the selected references.

### 8.2
Read the page brief.

### 8.3
Keep only structural ideas that support the page goal.

### 8.4
Discard decorative or irrelevant reference parts.

### 8.5
Replace generic reference content with Master Plan content.

### 8.6
Enforce Nebulla design rules over reference styling where they conflict.

### 8.7
Write what structure was kept.

### 8.8
Write what was discarded.

### 8.9
Write what was replaced with Master Plan content.

### 8.10
Confirm that required sections from the brief are still represented.

### 8.11
Update the step log to show Phase 8 is complete.

### 8.12
Stop and confirm Phase 8 is complete before moving on.

----------------------------------------

## PHASE 9 — ASSEMBLE THE GENERATION PACKAGE

### 9.1
Read the final brief text from the context file.

### 9.2
Read the adaptation notes from the context file.

### 9.3
Include the design system rules in the package.

### 9.4
Include the quality rules in the package.

### 9.5
Include the adapted structural guidance in the package.

### 9.6
Include the explicit output contract:
- React + Tailwind
- complete page or component code
- required sections present
- no cluttered or random decorative output

### 9.7
Write `model_used` into the context file.

### 9.8
Use the configured Grok code/text model for this generation step.

### 9.9
Do not treat this step as image generation.

### 9.10
Confirm the package is complete before any model call.

### 9.11
Update the step log to show Phase 9 is complete.

### 9.12
Stop and confirm Phase 9 is complete before moving on.

----------------------------------------

## PHASE 10 — GENERATE THE UI

### 10.1
Send the assembled package to the Grok code/text model.

### 10.2
Generate the UI code from the package only.

### 10.3
Do not invent a different product during generation.

### 10.4
Do not drop required sections from the brief during generation.

### 10.5
Write into the context file that generation ran.

### 10.6
Write any immediate generation warnings into the context file.

### 10.7
Update the step log to show Phase 10 is complete.

### 10.8
Stop and confirm Phase 10 is complete before moving on.

----------------------------------------

## PHASE 11 — VALIDATE THE OUTPUT

### 11.1
Read the required sections from the brief.

### 11.2
Check whether those required sections are present in the generated output.

### 11.3
Check whether the page type still matches the classification.

### 11.4
Check whether the primary CTA is present when the brief required one.

### 11.5
Check whether the structure is usable enough for refinement.

### 11.6
Write `quality_gate_result` as pass, repair, or weak.

### 11.7
If the output is clearly missing required brief elements, perform exactly one repair pass.

### 11.8
In the repair pass, correct only the deficiencies.

### 11.9
Do not enter an endless regeneration loop.

### 11.10
Write whether a repair pass was used.

### 11.11
Write any remaining missing required sections.

### 11.12
Update the step log to show Phase 11 is complete.

### 11.13
Stop and confirm Phase 11 is complete before moving on.

----------------------------------------

## PHASE 12 — DELIVER TO UI STUDIO BETA

### 12.1
Place the generated UI into UI Studio Beta preview.

### 12.2
Ensure the delivered UI is available for element selection.

### 12.3
Ensure the right Properties panel can refine the delivered UI.

### 12.4
Keep code export available if already supported.

### 12.5
Do not modify the original UI Studio / V0 page.

### 12.6
Write `preview_delivered = yes` when delivery succeeds.

### 12.7
Write `export_available = yes` or `no` according to reality.

### 12.8
Update the step log to show Phase 12 is complete.

### 12.9
Stop and confirm Phase 12 is complete before moving on.

----------------------------------------

## PHASE 13 — HUMAN REFINEMENT SUPPORT

### 13.1
Allow refinement through the Properties panel only as the primary editing surface.

### 13.2
Allow text edits.

### 13.3
Allow color edits.

### 13.4
Allow opacity edits.

### 13.5
Allow size edits.

### 13.6
Allow padding edits.

### 13.7
Allow margin edits.

### 13.8
Allow border edits.

### 13.9
Allow shadow edits.

### 13.10
Allow move up and move down.

### 13.11
Allow delete.

### 13.12
Do not reinterpret Master Plan product truth during refinement.

### 13.13
Record major user edits in the context file.

### 13.14
If the user accepts the result, write final status as accepted.

### 13.15
Update the step log to show Phase 13 activity.

----------------------------------------

## PHASE 14 — CLOSE THE CYCLE

### 14.1
Check that the context file contains Master Plan extracts.

### 14.2
Check that the context file contains classification decisions.

### 14.3
Check that the context file contains the brief.

### 14.4
Check that the context file contains reference decisions.

### 14.5
Check that the context file contains generation metadata.

### 14.6
Check that the context file contains output record data.

### 14.7
Check that major refinement notes are recorded if refinement happened.

### 14.8
Update the step log to the final state.

### 14.9
Set status to generated, refined, accepted, or failed according to the real outcome.

### 14.10
Stop. The cycle is closed.

----------------------------------------

## FINAL LAW

You must work like this:

**one subtask → write if required → only then next subtask**

Never do this:
- jump from Master Plan straight to code
- invent missing product truth
- stop only because Figma failed
- merge multiple subtasks into one vague action
- regenerate endlessly

Your job is to execute this manual exactly.

# UI Generation Trigger, Regeneration, and Preference Recovery

This section extends the UI Generation Engine Manual and Sequence.
It defines when generation starts, how regeneration is limited, and what happens when the user rejects the results.

---

## A. Automatic start trigger

### A.1
UI generation may start automatically when the Master Plan is complete enough for UI work.

### A.2
“Complete enough” means at least:
- product goal is known
- project type is known
- at least one meaningful page definition exists
- enough UI/UX direction exists to avoid pure invention

### A.3
When those conditions are met, the system may auto-trigger UI generation for the primary page or primary set of pages, using the same product timing pattern as the existing V0 trigger after Master Plan completion.

### A.4
Auto-trigger does not bypass the engine sequence.
Even when automatic, the engine must still follow:
verify → gather → classify → brief → references → generate → validate → deliver.

### A.5
Auto-trigger must write the cycle start into `nebulla-project/ui-generation-context.md`.

### A.6
If Master Plan is too weak, do not auto-generate rich UI.
Either continue discovery or produce only a clearly limited skeleton marked incomplete.

---

## B. Delivery target

### B.1
All generated UI from this engine is delivered to **UI Studio Beta**.

### B.2
The original UI Studio / V0 page remains untouched by this engine path.

### B.3
After delivery, the user can inspect the preview and refine with the Properties panel.

---

## C. Regeneration policy

### C.1
The user may request regeneration with a **Generate again** action.

### C.2
Maximum regenerations per page per generation cycle: **3**.

### C.3
Count only full generation attempts after the first delivered result.
Example:
- first automatic generation = attempt 1
- generate again = attempt 2
- generate again = attempt 3
- no further free regeneration after attempt 3

### C.4
Each regeneration must still run through the engine sequence.
Do not improvise a shortcut that skips brief/context updates.

### C.5
Before each regeneration, update `ui-generation-context.md` with:
- regeneration_count
- reason for regeneration if known
- previous quality_gate_result

### C.6
If regeneration is requested after the limit, do not generate again automatically.

---

## D. After 3 rejected or disliked generations

### D.1
When the user still dislikes the result after 3 generation attempts, stop blind regeneration.

### D.2
Switch to preference recovery mode.

### D.3
Ask one clear question to identify the problem.
Preferred wording:

“I can see this still isn’t right.  
What bothers you most — layout, colors, spacing, missing sections, or overall style?”

### D.4
Ask only one main question at a time.

### D.5
Write the user’s preference feedback into `ui-generation-context.md`.

### D.6
Based on the answer, choose one path only:

Path 1 — Guided improvement pass  
If the complaint is specific and actionable, run one controlled improvement generation using that feedback.

Path 2 — Manual refinement  
If the structure is mostly acceptable, direct the user to adjust text, color, spacing, border, shadow, order, or deletion in the Properties panel.

Path 3 — Partial redesign of one area  
If only one section is wrong, regenerate or restyle that section only when technically practical. Do not rebuild everything by default.

### D.7
Do not enter an unlimited generation loop after the recovery question.

---

## E. What must never happen

### E.1
Do not regenerate endlessly because the user is unhappy.

### E.2
Do not abandon Master Plan product truth just to chase visual preference.

### E.3
Do not invent a new product direction during regeneration.

### E.4
Do not silently consume extra generations beyond the max of 3 without user awareness.

### E.5
Do not send the user into a dead end with no next step after the limit.

---

## F. User-visible status

### F.1
While generation runs, show simple stage status to the user, such as:
- Reading Master Plan
- Preparing page brief
- Selecting references
- Generating UI
- Validating
- Ready in preview

### F.2
Internal detailed status continues to live in `ui-generation-context.md`.

### F.3
User-facing status should be short and non-technical.

---

## G. Context file requirements for this policy

Write and maintain at least these fields during the cycle:
- auto_triggered: yes/no
- regeneration_count: 0–3
- max_regenerations: 3
- preference_feedback:
- recovery_path: guided_improvement | manual_refinement | partial_redesign | none
- final_status: generated | refined | accepted | rejected | failed

---

## H. Operating rule

Automatic generation is allowed.  
Blind repetition is not.  

After 3 attempts, the system must stop guessing and either:
1. improve from explicit user preference, or
2. help the user refine manually.
