import * as React from "react";

export type GreetingUser = { name: string } | null | undefined;

type Props = {
  user: GreetingUser;
  /** Optional className for layout parents */
  className?: string;
};

/**
 * Friendly greeting that never crashes when user is missing.
 * Built with Guardian checklist #2 (null/undefined) in mind.
 */
export function SafeUserGreeting({ user, className }: Props) {
  const name =
    user && typeof user.name === "string" && user.name.trim()
      ? user.name.trim()
      : "there";

  return (
    <p className={className ?? "text-sm text-foreground"}>
      Hello, {name}!
    </p>
  );
}
