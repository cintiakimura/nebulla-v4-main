export type WorkspaceTreeNode = {
  name: string;
  path: string;
  children: WorkspaceTreeNode[];
  isFile: boolean;
};

/** Build a sorted folder-first tree from slash-separated relative paths (same shape as Source Control). */
export function buildWorkspaceFileTree(paths: string[]): WorkspaceTreeNode[] {
  const root: WorkspaceTreeNode = { name: '', path: '', children: [], isFile: false };
  const byPath = new Map<string, WorkspaceTreeNode>();
  byPath.set('', root);

  const sorted = [...new Set(paths)].sort((a, b) => a.localeCompare(b));
  for (const fullPath of sorted) {
    const clean = fullPath.replace(/^\/+|\/+$/g, '');
    if (!clean) continue;
    const parts = clean.split('/').filter(Boolean);
    let acc = '';
    let parent = root;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      acc = acc ? `${acc}/${part}` : part;
      const isFile = i === parts.length - 1;
      let node = byPath.get(acc);
      if (!node) {
        node = { name: part, path: acc, children: [], isFile };
        byPath.set(acc, node);
        parent.children.push(node);
      } else if (isFile) {
        node.isFile = true;
      }
      parent = node;
    }
  }

  const sortNodes = (nodes: WorkspaceTreeNode[]) => {
    nodes.sort((a, b) => {
      if (a.isFile !== b.isFile) return a.isFile ? 1 : -1;
      return a.name.localeCompare(b.name);
    });
    nodes.forEach((n) => sortNodes(n.children));
  };
  sortNodes(root.children);
  return root.children;
}
