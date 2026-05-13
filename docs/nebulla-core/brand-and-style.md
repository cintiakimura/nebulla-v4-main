# Nebulla Core — brand & style

Structured tokens (colors, typography, radius, spacing) live in [`tokens.yaml`](./tokens.yaml).

---

## Brand & style

This design system is anchored in the **Sophisticated Clarity** visual north star, tailored for the high-cognition environment of a professional IDE. The brand personality is focused, ethereal, and precise, aiming to reduce developer fatigue through a calm, low-friction interface.

The aesthetic blends **Modern Corporate** structure with subtle **Glassmorphism**. It utilizes layered depth to organize complex information hierarchies without relying on heavy visual separators. The emotional response is one of **quiet power**—an expansive workspace that feels both infinite (the nebula theme) and meticulously organized (the geometric panels).

## Colors

The palette is optimized for long-duration focus, defaulting to a high-clarity **light mode**. The system utilizes a **Bright Nebula** base, where the interface is dominated by clean, airy surfaces to reduce visual weight.

## Typography

This design system employs a strict **no-bold** policy for standard UI elements to maintain a professional, lightweight density. Hierarchical distinction is achieved through subtle shifts in font size (13px to 14px for primary UI) and color opacity rather than weight.

**Inter** is the primary typeface for all interface labels, inputs, and navigation. For code blocks, a high-legibility monospace font is used at the same 13px base size to ensure vertical alignment across the IDE's grid.

## Layout & spacing

The layout philosophy follows a **modular panel** approach. Information is divided into logical zones (navigation, editor, inspector, console) separated by either ultra-fine 1px borders or subtle tonal shifts.

The rhythm is tight and systematic, utilizing an **8px base grid** optimized for density. Standard margins are set at **12px** for container internal padding, while component-to-component spacing is kept at **8px** so the interface remains compact for professional workflows.

## Elevation & depth

Depth is conveyed through **subtle tonal recessions** and translucent layering rather than heavy shadows. The background is the lightest layer.

## Shapes

The shape language is defined by **softened geometrics**. Primary containers—panels, buttons, and input fields—use a uniform **8px border radius**. Large surfaces like the main editor may use **0px** radius where they meet the viewport edge to maximize screen real estate.

## Components

### Buttons & actions

Buttons are low-profile. Primary actions use a solid fill of primary container violet (`#7c3aed`) or secondary blue (`#244dd9` from tokens) with white text. Secondary actions are ghost-styled with 1px borders. Hover states use a subtle shift in background brightness. Buttons use the standard 8px radius.

### Input fields

Inputs are borderless by default in the panel layer, using a slightly more recessed background than their parent. On focus, a 1px primary-colored border appears with an 8px radius.

### Navigation tree (file explorer)

Items use 13px Inter. Active files are indicated by a 2px vertical glow strip on the left edge and a subtle blue background tint. Icons should be mono-line and 14px.

### Tabs

Tabs are rectangular with an 8px top-only radius. The active tab is distinguished by a 1px border that connects to the main editor panel for a unified surface.

### Status bar

A solid bar at the bottom of the interface. In light mode, use a soft sky-blue or very light gray. All text in the status bar is 11px (**label-sm**).
