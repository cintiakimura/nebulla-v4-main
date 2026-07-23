import * as React from "react";

export type GreetingUser = { name: string } | null | undefined;

type Props = { user: GreetingUser };

/** Friendly greeting that never crashes when user is missing. */
export function SafeUserGreeting({ user }: Props) {
  const name =
    user && typeof user.name === "string" && user.name.trim()
      ? user.name.trim()
      : "there";

  return <p className="text-sm text-foreground">Hello, {name}!</p>;
}
