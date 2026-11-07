// Advisory UI-gating catalog; view.* keys derive from sidebar titles via tabPermissionKey.
export const WORKSPACE_PERMISSIONS = [
  { key: "view.overview", label: "Overview", group: "Workspace views" },
  { key: "view.documents", label: "Documents", group: "Workspace views" },
  { key: "view.collections", label: "Collections", group: "Workspace views" },
  { key: "view.templates", label: "Templates", group: "Workspace views" },
  { key: "view.shared", label: "Shared", group: "Workspace views" },
  { key: "view.settings", label: "Settings", group: "Workspace views" },
  { key: "settings.manage", label: "Manage settings", group: "Administration" },
];

export const ROLE_STORAGE_KEY = "docs.workspace.roles";

export function normalizeRoleId(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function mergeWorkspaceRoles(customRoles = []) {
  const byId = new Map();

  customRoles.forEach((role) => {
    if (!role?.id) return;
    byId.set(role.id, {
      ...role,
      permissions: Array.isArray(role.permissions) ? role.permissions : [],
      system: Boolean(role.system),
    });
  });

  return Array.from(byId.values());
}

export function getRoleById(roles, roleId) {
  return (
    roles.find((role) => role.id === roleId) ||
    roles.find((role) => role.id === "manager") ||
    roles[0]
  );
}

export function roleHasPermission(roles, roleId, permissionKey) {
  if (!roles?.length) {
    return true;
  }

  const role = getRoleById(roles, roleId);
  return Boolean(role?.permissions?.includes(permissionKey));
}

export function tabPermissionKey(title) {
  const normalized = normalizeRoleId(title);
  return `view.${normalized}`;
}
