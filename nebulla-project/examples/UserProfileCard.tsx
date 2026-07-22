import * as React from "react";

export type UserProfileData = {
  id: string;
  name: string;
  avatarUrl?: string | null;
  bio?: string | null;
  tags?: string[] | null;
};

export type UserProfile = UserProfileData | null | undefined;

type Props = {
  user: UserProfile;
};

/** Normalize nullable user data for safe UI rendering. */
export function normalizeUserProfile(user: UserProfile): UserProfileData {
  if (!user || typeof user !== "object") {
    return {
      id: "guest",
      name: "Guest",
      avatarUrl: null,
      bio: "",
      tags: [],
    };
  }
  return {
    id: typeof user.id === "string" && user.id.trim() ? user.id : "guest",
    name: typeof user.name === "string" && user.name.trim() ? user.name.trim() : "Guest",
    avatarUrl: typeof user.avatarUrl === "string" && user.avatarUrl.trim() ? user.avatarUrl : null,
    bio: typeof user.bio === "string" ? user.bio : "",
    tags: Array.isArray(user.tags) ? user.tags.filter((t): t is string => typeof t === "string") : [],
  };
}

/**
 * shadcn-style profile card — safe for null user data and SSR (stable markup).
 */
export function UserProfileCard({ user }: Props) {
  const profile = normalizeUserProfile(user);
  const initials = profile.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <div className="w-full max-w-sm rounded-xl border border-border bg-card p-6 text-card-foreground shadow-sm">
      <div className="flex items-center gap-4">
        {profile.avatarUrl ? (
          <img
            src={profile.avatarUrl}
            alt=""
            className="h-14 w-14 rounded-full object-cover"
          />
        ) : (
          <div
            aria-hidden
            className="flex h-14 w-14 items-center justify-center rounded-full bg-secondary text-sm font-medium text-secondary-foreground"
          >
            {initials || "?"}
          </div>
        )}
        <div className="min-w-0 space-y-1">
          <h3 className="truncate text-base font-semibold leading-none">{profile.name}</h3>
          <p className="text-xs text-muted-foreground">Profile</p>
        </div>
      </div>
      {profile.bio ? (
        <p className="mt-4 text-sm text-muted-foreground">{profile.bio}</p>
      ) : null}
      {profile.tags.length > 0 ? (
        <ul className="mt-3 flex flex-wrap gap-2">
          {profile.tags.map((tag) => (
            <li
              key={`${profile.id}-${tag}`}
              className="rounded-md bg-secondary px-2 py-0.5 text-xs text-secondary-foreground"
            >
              {tag}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
