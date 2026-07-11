// Thin client for the platform API. Same-origin fetches; in production the
// Cloudflare Access session cookie rides along automatically. The file browser
// is multi-panel, so data calls take an explicit `scope` (an org id, or the
// sentinel "private") sent as the X-Org-Id header.

export const PRIVATE = "private";

function http(url: string, init: RequestInit = {}): Promise<Response> {
  return fetch(url, init);
}

async function asJson<T>(r: Response): Promise<T> {
  if (!r.ok) throw new Error((await r.text()) || r.statusText);
  return r.json() as Promise<T>;
}

const scoped = (scope: string, init: RequestInit = {}): RequestInit => ({
  ...init,
  headers: { ...(init.headers as Record<string, string>), "X-Org-Id": scope },
});
const jsonBody = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

export interface Org {
  id: string;
  name: string;
  slug: string;
  capabilities?: string[];
}
export interface Me {
  id: string;
  email: string;
  displayName: string;
  role: string;
  roleLabel: string;
  capabilities: string[];
  isAdmin: boolean;
  isSuperuser: boolean;
  version?: string;
  renderUrl?: string;
  canStream: boolean; // role grants the server-side-rendering capability
  streamPref: { always: boolean }; // on = open every part in the streamed viewer
  org: Org;
  orgs: Org[];
  private: { enabled: boolean; capabilities: string[] };
}

export interface PermMatrix {
  capabilities: { key: string; label: string }[];
  roles: { key: string; label: string; capabilities: string[] }[];
  editable: boolean;
  lockedRoles: string[];
  lockedCapabilities: string[];
}

export interface AdminOrg {
  id: string;
  name: string;
  slug: string;
  userCount: number;
  slicerPref: string;
}
export interface AuditEvent {
  id: string;
  createdAt: string;
  actor: string;
  action: string;
  targetType: string;
  targetId: string | null;
  orgId: string | null;
  detail: Record<string, unknown> | null;
}
export interface Project {
  id: string;
  name: string;
  orgId: string;
  partCount: number;
  createdAt: string;
  updatedAt: string;
  isFavorite: boolean;
}
export interface StlFile {
  id: string;
  filename: string;
  sizeBytes: number;
  createdAt: string;
  uploadedBy: string | null;
}
export interface Part {
  id: string;
  name: string;
  projectId: string | null;
  createdAt: string;
  createdBy: string | null;
  updatedAt: string;
  isPrivate: boolean;
  isFavorite: boolean;
  stlCount: number;
  latestFile: StlFile | null;
  sliceCount: number;
  latestSlice: { id: string; version: number; createdAt: string } | null;
}
export interface SliceVersion {
  id: string;
  version: number; // auto-generated, sequential per part
  name: string; // user-given label (separate from version)
  profileName: string;
  slicerVersion?: string;
  layerCount: number;
  totalExtrusionMm: number;
  estimatedWeightG: number;
  gcodeFilename: string;
  isCurrent: boolean;
  isLegacy: boolean;
  supersededAt: string | null;
  expiresAt: string | null;
  simAvailable: boolean;
  toolpathAvailable: boolean;
  printCount: number;
  createdAt: string;
  slicedBy: string | null;
}
export interface PrintRun {
  id: string;
  partId: string;
  sliceVersionId: string;
  sliceVersion: number;
  label: string;
  status: string;
  createdAt: string;
  recordedBy: string | null;
}
export interface AdminUser {
  id: string;
  email: string;
  displayName: string;
  role: string;
  orgId: string;
  orgSlug: string;
  memberships: { orgId: string; role: string }[];
}

export const getMe = () => http("/api/me").then((r) => asJson<Me>(r));
// NOTE: the slicer's remote-scene mode fetches /api/render/token directly (token +
// ICE servers); the shell no longer needs a render helper here.
export const getPermissions = () =>
  http("/api/permissions").then((r) => asJson<PermMatrix>(r));
export const setRoleCapabilities = (role: string, capabilities: string[]) =>
  http(`/api/permissions/roles/${role}`, {
    ...jsonBody({ capabilities }),
    method: "PUT",
  }).then((r) => asJson<PermMatrix>(r));
export const setStreamPref = (always: boolean) =>
  http("/api/me/stream-pref", { ...jsonBody({ always }), method: "PATCH" }).then((r) =>
    asJson<{ always: boolean }>(r),
  );

// --- Projects (scoped) ---
export const listProjects = (scope: string) =>
  http("/api/projects", scoped(scope))
    .then((r) => asJson<{ projects: Project[] }>(r))
    .then((d) => d.projects);
export const createProject = (scope: string, name: string) =>
  http("/api/projects", scoped(scope, jsonBody({ name }))).then((r) =>
    asJson<Project>(r),
  );
export const patchProject = (
  scope: string,
  id: string,
  patch: { name?: string; favorite?: boolean },
) =>
  http(`/api/projects/${id}`, scoped(scope, { ...jsonBody(patch), method: "PATCH" })).then(
    (r) => asJson<Project>(r),
  );
export const deleteProject = (scope: string, id: string) =>
  http(`/api/projects/${id}`, scoped(scope, { method: "DELETE" })).then((r) => asJson(r));

// --- Parts (scoped) ---
export const listParts = (scope: string, projectId?: string) =>
  http(projectId ? `/api/parts?project_id=${projectId}` : "/api/parts", scoped(scope))
    .then((r) => asJson<{ parts: Part[] }>(r))
    .then((d) => d.parts);
export const deletePart = (scope: string, id: string) =>
  http(`/api/parts/${id}`, scoped(scope, { method: "DELETE" })).then((r) => asJson(r));
export const patchPart = (
  scope: string,
  id: string,
  patch: { name?: string; projectId?: string | null; orgId?: string; favorite?: boolean },
) =>
  http(`/api/parts/${id}`, scoped(scope, { ...jsonBody(patch), method: "PATCH" })).then(
    (r) => asJson<Part>(r),
  );
export const duplicatePart = (scope: string, id: string) =>
  http(`/api/parts/${id}/duplicate`, scoped(scope, { method: "POST" })).then((r) =>
    asJson<Part>(r),
  );

export async function uploadStl(
  scope: string,
  file: File,
  name: string,
  projectId?: string,
): Promise<Part> {
  const form = new FormData();
  form.append("name", name);
  form.append("file", file);
  if (projectId) form.append("project_id", projectId);
  return http("/api/parts", scoped(scope, { method: "POST", body: form })).then((r) =>
    asJson<Part>(r),
  );
}

// --- Slices / prints (scoped) ---
export const listSlices = (scope: string, partId: string) =>
  http(`/api/parts/${partId}/slices`, scoped(scope))
    .then((r) => asJson<{ slices: SliceVersion[] }>(r))
    .then((d) => d.slices);
export const gcodeUrl = (scope: string, sliceId: string) =>
  `/api/slices/${sliceId}/gcode?org=${encodeURIComponent(scope)}`;
export const simUrl = (scope: string, sliceId: string) =>
  `/api/slices/${sliceId}/simulation?org=${encodeURIComponent(scope)}`;
export const recordPrint = (scope: string, sliceId: string, label: string) =>
  http(`/api/slices/${sliceId}/prints`, scoped(scope, jsonBody({ label }))).then((r) =>
    asJson<PrintRun>(r),
  );
export const listPrints = (scope: string, partId: string) =>
  http(`/api/parts/${partId}/prints`, scoped(scope))
    .then((r) => asJson<{ prints: PrintRun[] }>(r))
    .then((d) => d.prints);

// --- Profiles (scoped library; factory ★, org-shared + approval, private) ---
export interface ProfileEntry {
  id: string;
  kind: string; // "profile" | "machine"
  name: string;
  scope: string; // factory | org | private
  factory: boolean;
  status: string; // active | pending | archived
  version: number;
  createdBy: string | null;
  sharedFrom: string | null; // name of the profile this was shared/copied from
  machineName?: string | null; // a profile's machine label
}
export const listProfiles = (scope: string) =>
  http("/api/profiles", scoped(scope)).then((r) =>
    asJson<{ profiles: ProfileEntry[]; canApprove: boolean; canManage: boolean }>(r),
  );
export const listMachines = (scope: string) =>
  http("/api/machines", scoped(scope)).then((r) =>
    asJson<{ machines: ProfileEntry[]; canApprove: boolean; canManage: boolean }>(r),
  );
export const shareMachine = (scope: string, id: string, targetOrgId: string) =>
  http(
    `/api/machines/${id}/share`,
    scoped(scope, jsonBody({ org_id: targetOrgId })),
  ).then((r) => asJson<ProfileEntry>(r));
export const approveMachine = (scope: string, id: string) =>
  http(`/api/machines/${id}/approve`, scoped(scope, { method: "POST" })).then((r) =>
    asJson<ProfileEntry>(r),
  );
export const renameMachine = (scope: string, id: string, name: string) =>
  http(
    `/api/machines/${id}`,
    scoped(scope, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    }),
  ).then((r) => asJson<ProfileEntry>(r));
export const rejectMachine = (scope: string, id: string) =>
  http(`/api/machines/${id}/reject`, scoped(scope, { method: "POST" }));
export const deleteMachine = (scope: string, id: string) =>
  http(`/api/machines/${id}`, scoped(scope, { method: "DELETE" }));
export const shareProfile = (scope: string, id: string, targetOrgId: string) =>
  http(
    `/api/profiles/${id}/share`,
    scoped(scope, jsonBody({ org_id: targetOrgId })),
  ).then((r) => asJson<ProfileEntry>(r));
export const approveProfile = (scope: string, id: string) =>
  http(`/api/profiles/${id}/approve`, scoped(scope, { method: "POST" })).then((r) =>
    asJson<ProfileEntry>(r),
  );
export const renameProfile = (scope: string, id: string, name: string) =>
  http(
    `/api/profiles/${id}`,
    scoped(scope, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    }),
  ).then((r) => asJson<ProfileEntry>(r));
export const rejectProfile = (scope: string, id: string) =>
  http(`/api/profiles/${id}/reject`, scoped(scope, { method: "POST" }));
export const deleteProfile = (scope: string, id: string) =>
  http(`/api/profiles/${id}`, scoped(scope, { method: "DELETE" }));

// --- Admin (org-managed server-side; no scope header needed) ---
export const listUsers = () =>
  http("/api/admin/users")
    .then((r) => asJson<{ users: AdminUser[] }>(r))
    .then((d) => d.users);
export const setUserRole = (userId: string, role: string) =>
  http(`/api/admin/users/${userId}`, { ...jsonBody({ role }), method: "PATCH" }).then(
    (r) => asJson<AdminUser>(r),
  );
export const addMembership = (userId: string, orgId: string, role?: string) =>
  http(`/api/admin/users/${userId}/orgs`, jsonBody({ orgId, role })).then((r) => asJson(r));
export const setMembershipRole = (userId: string, orgId: string, role: string) =>
  http(`/api/admin/users/${userId}/orgs/${orgId}`, { ...jsonBody({ role }), method: "PATCH" }).then(
    (r) => asJson(r),
  );
export const removeMembership = (userId: string, orgId: string) =>
  http(`/api/admin/users/${userId}/orgs/${orgId}`, { method: "DELETE" }).then((r) => asJson(r));

export interface OrgSettings {
  id: string;
  name: string;
  slug: string;
  slicerPref: string;
  availableSlicerVersions: string[];
}
export const getOrgSettings = () =>
  http("/api/admin/org").then((r) => asJson<OrgSettings>(r));
export const setOrgSlicerPref = (slicerPref: string) =>
  http("/api/admin/org", { ...jsonBody({ slicerPref }), method: "PATCH" }).then((r) => asJson(r));
export const listOrgs = () =>
  http("/api/admin/orgs")
    .then((r) => asJson<{ orgs: AdminOrg[] }>(r))
    .then((d) => d.orgs);
export const createOrg = (name: string, slug?: string) =>
  http("/api/admin/orgs", jsonBody({ name, slug })).then((r) => asJson<AdminOrg>(r));
export const setOrgSlicer = (orgId: string, slicerPref: string) =>
  http(`/api/admin/orgs/${orgId}`, { ...jsonBody({ slicerPref }), method: "PATCH" }).then(
    (r) => asJson(r),
  );
export const listAudit = (limit = 100) =>
  http(`/api/admin/audit?limit=${limit}`)
    .then((r) => asJson<{ events: AuditEvent[] }>(r))
    .then((d) => d.events);
