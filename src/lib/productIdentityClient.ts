import { fetchJson } from './apiFetch';
import { withProjectBody, withProjectQuery } from './nebulaProjectApi';
import {
  buildProductIdentity,
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
