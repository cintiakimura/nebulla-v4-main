import { fetchJson } from './apiFetch';
import {
  getBrowserProjectName,
  withProjectBody,
  withProjectQuery,
} from './nebulaProjectApi';
import {
  getWorkspaceModePreference,
  renameActiveProjectDisplayName,
} from './nebulaCloud';
import {
  buildProductIdentity,
  isWorkspaceLabelStub,
  looksLikeGoalStubName,
  type ProductIdentity,
} from '../../lib/productIdentity';

export async function persistProductIdentityClient(
  opts: {
    projectName: string;
    goal?: string;
    projectType?: string;
    userSet?: boolean;
    logoHint?: string;
  },
): Promise<ProductIdentity | null> {
  const built = buildProductIdentity(
    opts.goal || "",
    opts.projectType,
    opts.projectName,
    opts.userSet,
  );
  try {
    const res = await fetchJson<{ ok?: boolean; identity?: ProductIdentity }>(
      withProjectQuery('/api/ide/product-identity'),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(
          withProjectBody({
            projectName: built.projectName,
            logoInitials: built.logoInitials,
            logoHint: opts.logoHint || built.logoHint,
            goal: opts.goal,
            projectType: opts.projectType,
            userSet: Boolean(opts.userSet),
          }),
        ),
      },
    );
    return res.identity || built;
  } catch {
    return built;
  }
}

export async function fetchProductIdentityClient(): Promise<ProductIdentity | null> {
  try {
    const res = await fetchJson<{ ok?: boolean; identity?: ProductIdentity }>(
      withProjectQuery('/api/ide/product-identity'),
      { credentials: 'include' },
    );
    return res.identity || null;
  } catch {
    return null;
  }
}

/** Write §1 product name onto the header chip when the current label is a stub. */
export async function promoteWorkspaceChipFromProductName(name: string): Promise<string | null> {
  const trimmed = String(name || '').trim();
  if (!trimmed || looksLikeGoalStubName(trimmed) || isWorkspaceLabelStub(trimmed)) return null;
  const current = getBrowserProjectName().trim();
  if (current && !isWorkspaceLabelStub(current)) {
    return current;
  }
  const mode = getWorkspaceModePreference() || 'guest';
  try {
    const result = await renameActiveProjectDisplayName(trimmed, mode);
    await persistProductIdentityClient({
      projectName: result.projectName,
      userSet: false,
    });
    return result.projectName;
  } catch {
    return trimmed;
  }
}
