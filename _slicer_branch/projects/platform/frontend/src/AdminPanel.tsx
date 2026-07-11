import { useEffect, useState } from "react";
import * as api from "./api";

export function AdminPanel({ me, onError }: { me: api.Me | null; onError: (m: string) => void }) {
  const [users, setUsers] = useState<api.AdminUser[]>([]);
  const [org, setOrg] = useState<api.OrgSettings | null>(null);
  const [perm, setPerm] = useState<api.PermMatrix | null>(null);
  const [orgs, setOrgs] = useState<api.AdminOrg[]>([]);
  const [newOrg, setNewOrg] = useState("");
  const [auditEvents, setAuditEvents] = useState<api.AuditEvent[]>([]);
  const roles =["org_operator", "org_user", "org_admin", "meltio_support", "superuser"];
  const isSuper = !!me?.isSuperuser;
  const loadOrgs = () => api.listOrgs().then(setOrgs).catch((e) => onError(String(e)));
  const load = () => {
    api.listUsers().then(setUsers).catch((e) => onError(String(e)));
    api.getOrgSettings().then(setOrg).catch((e) => onError(String(e)));
    api.getPermissions().then(setPerm).catch((e) => onError(String(e)));
    if (isSuper) {
      loadOrgs();
      api.listAudit().then(setAuditEvents).catch((e) => onError(String(e)));
    }
  };
  useEffect(() => {
    load();
  }, []);

  async function changeSlicer(pref: string) {
    try {
      await api.setOrgSlicerPref(pref);
      setOrg((o) => (o ? { ...o, slicerPref: pref } : o));
    } catch (e) {
      onError(String(e));
    }
  }
  async function change(u: api.AdminUser, role: string) {
    try {
      await api.setUserRole(u.id, role);
      await load();
    } catch (e) {
      onError(String(e));
    }
  }
  async function toggleCap(roleKey: string, capKey: string, on: boolean) {
    if (!perm) return;
    const role = perm.roles.find((r) => r.key === roleKey);
    if (!role) return;
    const next = on
      ? Array.from(new Set([...role.capabilities, capKey]))
      : role.capabilities.filter((c) => c !== capKey);
    try {
      setPerm(await api.setRoleCapabilities(roleKey, next));
    } catch (e) {
      onError(String(e));
    }
  }
  async function addOrg() {
    const name = newOrg.trim();
    if (!name) return;
    try {
      await api.createOrg(name);
      setNewOrg("");
      loadOrgs();
    } catch (e) {
      onError(String(e));
    }
  }
  const orgRoles = ["org_operator", "org_user", "org_admin"];
  const slicerVersions = org?.availableSlicerVersions ?? [];
  const MAX_ORGS = 5;
  const orgName = (id: string) => orgs.find((o) => o.id === id)?.name ?? id.slice(0, 8);
  async function changeOrgSlicer(orgId: string, pref: string) {
    try {
      await api.setOrgSlicer(orgId, pref);
      setOrgs((os) => os.map((o) => (o.id === orgId ? { ...o, slicerPref: pref } : o)));
    } catch (e) {
      onError(String(e));
    }
  }
  async function addUserOrg(userId: string, orgId: string) {
    if (!orgId) return;
    try {
      await api.addMembership(userId, orgId);
      await load();
    } catch (e) {
      onError(String(e));
    }
  }
  async function setMemberRole(userId: string, orgId: string, role: string) {
    try {
      await api.setMembershipRole(userId, orgId, role);
      await load();
    } catch (e) {
      onError(String(e));
    }
  }
  async function removeUserOrg(userId: string, orgId: string) {
    try {
      await api.removeMembership(userId, orgId);
      await load();
    } catch (e) {
      onError(String(e));
    }
  }
  return (
    <>
      {org && !isSuper && (
        <div className="card admin-card">
          <h2>Organisation — {org.slug}</h2>
          <label className="org-setting">
            <span>Slicer version</span>
            <select value={org.slicerPref} onChange={(e) => changeSlicer(e.target.value)}>
              <option value="latest">Always newest</option>
              {org.availableSlicerVersions.map((v) => (
                <option key={v} value={v}>
                  Pinned · {v}
                </option>
              ))}
            </select>
          </label>
          <p className="muted">
            “Always newest” auto-updates as the slicer evolves; pinning keeps this
            org on a specific version.
          </p>
        </div>
      )}
      {isSuper && (
        <div className="card admin-card">
          <h2>Organisations ({orgs.length})</h2>
          <div className="org-create">
            <input
              type="text"
              placeholder="New organisation name"
              value={newOrg}
              onChange={(e) => setNewOrg(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addOrg()}
            />
            <button className="tool-btn primary" onClick={addOrg}>Create org</button>
          </div>
          <table className="users rtable">
            <thead>
              <tr>
                <th>Name</th>
                <th>Slug</th>
                <th>Users</th>
                <th>Slicer version</th>
              </tr>
            </thead>
            <tbody>
              {orgs.map((o) => (
                <tr key={o.id}>
                  <td data-label="Name">{o.name}</td>
                  <td className="muted" data-label="Slug">{o.slug}</td>
                  <td className="muted" data-label="Users">{o.userCount}</td>
                  <td data-label="Slicer">
                    <select
                      value={o.slicerPref}
                      onChange={(e) => changeOrgSlicer(o.id, e.target.value)}
                    >
                      <option value="latest">Always newest</option>
                      {slicerVersions.map((v) => (
                        <option key={v} value={v}>
                          Pinned · {v}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="card">
        <h2>Users ({users.length})</h2>
        <table className="users rtable">
          <thead>
            <tr>
              <th>Email</th>
              <th>Home org</th>
              <th>Role</th>
              {isSuper && (
                <>
                  <th>Organisations</th>
                  <th>Add to org</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td data-label="Email">{u.email}</td>
                <td className="muted" data-label="Home org">{u.orgSlug}</td>
                <td data-label="Role">
                  <select value={u.role} onChange={(e) => change(u, e.target.value)}>
                    {roles.map((r) => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                </td>
                {isSuper && (
                  <>
                    <td data-label="Organisations">
                      <div className="memberships">
                        <div className="mrow">
                          <span className="mname">{orgName(u.orgId)}</span>
                          <span className="mbadge">home · {u.role}</span>
                        </div>
                        {u.memberships.map((m) => (
                          <div className="mrow" key={m.orgId}>
                            <span className="mname">{orgName(m.orgId)}</span>
                            <select
                              className="chip-role"
                              value={m.role}
                              onChange={(e) => setMemberRole(u.id, m.orgId, e.target.value)}
                            >
                              {orgRoles.map((r) => (
                                <option key={r} value={r}>{r}</option>
                              ))}
                            </select>
                            <button
                              className="mremove"
                              title="Remove from org"
                              onClick={() => removeUserOrg(u.id, m.orgId)}
                            >
                              ×
                            </button>
                          </div>
                        ))}
                      </div>
                    </td>
                    <td data-label="Add to org">
                      {1 + u.memberships.length < MAX_ORGS ? (
                        <select
                          className="org-add"
                          value=""
                          onChange={(e) => addUserOrg(u.id, e.target.value)}
                        >
                          <option value="">+ Add to org…</option>
                          {orgs
                            .filter(
                              (o) =>
                                o.id !== u.orgId &&
                                !u.memberships.some((m) => m.orgId === o.id),
                            )
                            .map((o) => (
                              <option key={o.id} value={o.id}>
                                {o.name}
                              </option>
                            ))}
                        </select>
                      ) : (
                        <span className="muted mlimit">Max {MAX_ORGS}</span>
                      )}
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {perm && (
        <div className="card admin-card" style={{ marginTop: "1.2rem" }}>
          <h2>Roles &amp; permissions</h2>
          {perm.editable && (
            <p className="muted">
              Toggle a capability to change what a role can do. Superuser and
              “Manage platform” are locked.
            </p>
          )}
          <table className="perm rtable">
            <thead>
              <tr>
                <th>Capability</th>
                {perm.roles.map((r) => (
                  <th key={r.key}>{r.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {perm.capabilities.map((c) => {
                const capLocked = perm.lockedCapabilities.includes(c.key);
                return (
                  <tr key={c.key}>
                    <td className="cap-name">{c.label}</td>
                    {perm.roles.map((r) => {
                      const has = r.capabilities.includes(c.key);
                      const locked =
                        !perm.editable || capLocked || perm.lockedRoles.includes(r.key);
                      return (
                        <td key={r.key} className="cell-check" data-label={r.label}>
                          {locked ? (
                            has ? "✓" : "·"
                          ) : (
                            <input
                              type="checkbox"
                              checked={has}
                              onChange={(e) => toggleCap(r.key, c.key, e.target.checked)}
                            />
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {isSuper && (
        <div className="card admin-card" style={{ marginTop: "1.2rem" }}>
          <h2>Audit log</h2>
          <table className="users audit rtable">
            <thead>
              <tr>
                <th>When</th>
                <th>Who</th>
                <th>Action</th>
                <th>Target</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {auditEvents.length === 0 ? (
                <tr>
                  <td className="muted" colSpan={5}>No events yet.</td>
                </tr>
              ) : (
                auditEvents.map((e) => (
                  <tr key={e.id}>
                    <td className="muted" data-label="When">{new Date(e.createdAt).toLocaleString()}</td>
                    <td data-label="Who">{e.actor || "—"}</td>
                    <td data-label="Action">{e.action}</td>
                    <td className="muted" data-label="Target">
                      {e.targetType}
                      {e.targetId ? ` ${e.targetId.slice(0, 8)}` : ""}
                    </td>
                    <td className="muted" data-label="Details">
                      {e.detail
                        ? Object.entries(e.detail)
                            .map(([k, v]) => `${k}: ${v ?? "—"}`)
                            .join(" · ")
                        : ""}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
