/**
 * INTENTIONALLY BUGGY — system test draft.
 */
import * as React from "react";

export type GreetingUser = { name: string } | null | undefined;

type Props = { user: GreetingUser };

/** Buggy: reads user.name with no guard. */
export function SafeUserGreeting({ user }: Props) {
  return (
    <p className="text-sm text-foreground">
      Hello, {user.name}!
    </p>
  );
}
