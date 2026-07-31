/**
 * Draft §4 page blocks for Mind Map routes that are not in the plan (propose only).
 */
export function draftSection4AmendmentsForRoutes(
  extraRoutes: string[],
): string {
  const routes = [...new Set(extraRoutes.map((r) => r.trim()).filter((r) => r.startsWith("/")))];
  if (!routes.length) return "";
  const blocks = routes.map((route) => {
    const name =
      route === "/"
        ? "Home"
        : route
            .split("/")
            .filter(Boolean)
            .pop()!
            .replace(/[-_]/g, " ")
            .replace(/\b\w/g, (c) => c.toUpperCase());
    return [
      `### ${name} \`${route}\``,
      `- **Purpose:** (describe this page)`,
      `- **primary_actions:** …`,
      `- **data_entities:** …`,
      `- **authz:** …`,
      `- **empty_state:** …`,
      `- **error_state:** …`,
      `- **nav_links:** …`,
    ].join("\n");
  });
  return [
    "<!-- Proposed §4 additions from Mind Map (review + Accept to merge) -->",
    "",
    ...blocks,
  ].join("\n");
}
