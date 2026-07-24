# UI Generation Context

This file is the source of truth for one UI generation cycle.  
Each step must read this file, update it, and pass forward only through this record.  
Do not rely on chat memory for decisions already written here.

---

## 0. Cycle identity

- context_id:
- project_name:
- page_name:
- created_at:
- status: `in_progress | generated | refined | accepted | failed`
- current_step:

---

## 1. Master Plan extracts

### 1.1 Project identity
- product_goal:
- target_user:
- project_type:

### 1.2 Product understanding
- product_function:
- industry:
- priority_features:
  - 
  - 

### 1.3 Page definition
- page_name:
- page_purpose:
- primary_actions:
  - 
- secondary_actions:
  - 
- required_sections:
  - 
- navigation_role:

### 1.4 UI/UX direction
- visual_tone:
- palette:
- density:
- typography_notes:
- style_constraints:
- explicit_do:
  - 
- explicit_dont:
  - 

---

## 2. Classification decisions

- device:
- page_type:
- function:
- industry:
- complexity:
- navigation_type:
- density:
- classification_notes:
- confidence: `high | medium | low`

---

## 3. Generation brief

### 3.1 Page goal
- 

### 3.2 Audience
- 

### 3.3 Layout contract
- navigation:
- section_order:
  1.
  2.
  3.
- primary_cta:
- secondary_ctas:
  - 

### 3.4 Content inventory
- metrics:
  - 
- tables_or_lists:
  - 
- forms:
  - 
- cards_or_panels:
  - 
- other_components:
  - 

### 3.5 Visual contract
- color_direction:
- hierarchy_rules:
- spacing_rules:
- component_limits:

### 3.6 Final brief text
> Paste the full brief that will be sent to generation here.

---

## 4. Reference selection

### 4.1 Selection criteria used
- device:
- page_type:
- function:
- industry:
- navigation_pattern:
- component_needs:
- density_tone:

### 4.2 Resource types requested
- page_templates:
- navigation_patterns:
- section_patterns:
- component_patterns:
- icons_assets:
- other:

### 4.3 Candidates retrieved
- source: `figma | seed | mixed`
- candidates:
  1. id/name — reason
  2. id/name — reason
  3. id/name — reason

### 4.4 Selected references
- selected:
  1. id/name — why selected
  2. id/name — why selected
- rejected_notes:

### 4.5 Adaptation notes
- what structure was kept:
- what was discarded:
- what was replaced with Master Plan content:

---

## 5. Generation package

- model_used:
- design_system_rules_applied: `yes | no`
- quality_rules_applied: `yes | no`
- figma_used: `yes | no`
- figma_status: `success | failed | missing_key | weak_matches`
- fallback_used: `yes | no`
- repair_pass_used: `yes | no`
- selected_references:
  - id — why selected
- generation_warnings:
  - 

---

## 6. Output record

- output_type: `react_tailwind_page`
- preview_delivered: `yes | no`
- export_available: `yes | no`
- missing_required_sections:
  - 
- quality_gate_result: `pass | repair | weak`

---

## 7. Human refinement

- refined_by_user: `yes | no`
- major_edits:
  - text:
  - color:
  - spacing:
  - layout:
  - deleted_elements:
- final_status: `accepted | rejected | pending`

---

## 8. Step log

Write one line after each completed step:

1. Step 1 verify — 
2. Step 2 gather — 
3. Step 3 classify — 
4. Step 4 brief — 
5. Step 5 criteria — 
6. Step 6 retrieve — 
7. Step 7 adapt — 
8. Step 8 generate — 
9. Step 9 deliver — 
10. Step 10 refine — 
11. Step 11 metadata — 

---

## Rules for using this file

1. Every step must read the current file before acting.
2. Every step must write its decisions back before the next step starts.
3. Later steps may not contradict earlier written decisions without an explicit revision note.
4. If Figma fails, record the failure here and continue with fallback.
5. This file is the source of truth for the generation cycle.
