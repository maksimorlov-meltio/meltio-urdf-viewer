import { useEffect, useRef, useState } from "react";
import * as api from "./api";
import { sliceMeta, when } from "./format";

// What's being dragged between panels: a part (move) or a profile (share).
type DragItem =
  | { kind: "part"; partId: string; fromScope: string }
  | {
      kind: "library"; // a profile or machine preset (shared the same way)
      itemKind: "profile" | "machine";
      id: string;
      name: string;
      fromScope: string;
    };

export function Browser({
  me,
  reloadKey,
  bumpReload,
  openSlicer,
  onError,
}: {
  me: api.Me | null;
  reloadKey: number;
  bumpReload: () => void;
  openSlicer: (partId?: string, sliceId?: string, scope?: string) => void;
  onError: (m: string) => void;
}) {
  // Shared so a part/profile can be dragged from one panel into another.
  const dragRef = useRef<DragItem | null>(null);
  if (!me) return null;
  const panels: { scope: string; title: string; caps: string[] }[] = [];
  if (me.private?.enabled)
    panels.push({ scope: api.PRIVATE, title: "Private", caps: me.private.capabilities });
  for (const o of me.orgs)
    panels.push({ scope: o.id, title: o.name, caps: o.capabilities ?? [] });
  // Open the first org by default (Private starts collapsed); each panel then
  // remembers its own open/closed state for the session (see ScopePanel).
  const defaultOpenScope = me.orgs[0]?.id ?? panels[0]?.scope;
  return (
    <div className="panels">
      {panels.map((p) => (
        <ScopePanel
          key={p.scope}
          scope={p.scope}
          title={p.title}
          caps={p.caps}
          myEmail={me.email}
          defaultOpen={p.scope === defaultOpenScope}
          reloadKey={reloadKey}
          bumpReload={bumpReload}
          dragRef={dragRef}
          openSlicer={openSlicer}
          onError={onError}
        />
      ))}
    </div>
  );
}

function ScopePanel({
  scope,
  title,
  caps,
  myEmail,
  defaultOpen,
  reloadKey,
  bumpReload,
  dragRef,
  openSlicer,
  onError,
}: {
  scope: string;
  title: string;
  caps: string[];
  myEmail: string;
  defaultOpen: boolean;
  reloadKey: number;
  bumpReload: () => void;
  dragRef: React.MutableRefObject<DragItem | null>;
  openSlicer: (partId?: string, sliceId?: string, scope?: string) => void;
  onError: (m: string) => void;
}) {
  const isPrivate = scope === api.PRIVATE;
  const can = (c: string) => caps.includes(c);
  // Remember each panel's open/closed state for the session (survives view
  // switches and reloads); fall back to the caller's default the first time.
  const collapseKey = `panel.collapsed:${scope}`;
  const [collapsed, setCollapsed] = useState(() => {
    const saved = sessionStorage.getItem(collapseKey);
    return saved !== null ? saved === "1" : !defaultOpen;
  });
  useEffect(() => {
    sessionStorage.setItem(collapseKey, collapsed ? "1" : "0");
  }, [collapseKey, collapsed]);
  const [projects, setProjects] = useState<api.Project[]>([]);
  const [parts, setParts] = useState<api.Part[]>([]);
  const [profiles, setProfiles] = useState<api.ProfileEntry[]>([]);
  const [machines, setMachines] = useState<api.ProfileEntry[]>([]);
  const [canApprove, setCanApprove] = useState(false);
  const [canManage, setCanManage] = useState(false);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [slicesBy, setSlicesBy] = useState<Record<string, api.SliceVersion[]>>({});
  const [printsBy, setPrintsBy] = useState<Record<string, api.PrintRun[]>>({});
  const [dropTarget, setDropTarget] = useState<string | null>(null); // project id or "root"
  const fileInput = useRef<HTMLInputElement>(null);
  const uploadTarget = useRef<string | null>(null); // project id to upload into
  const [namePrompt, setNamePrompt] = useState<{
    title: string;
    initial: string;
    submitLabel: string;
    placeholder?: string;
    onSubmit: (value: string) => void;
  } | null>(null);

  async function reload() {
    try {
      const [projs, allParts, profs, machs] = await Promise.all([
        api.listProjects(scope),
        api.listParts(scope),
        api.listProfiles(scope),
        api.listMachines(scope),
      ]);
      setProjects(projs);
      setParts(allParts);
      setProfiles(profs.profiles);
      setMachines(machs.machines);
      setCanApprove(profs.canApprove);
      setCanManage(profs.canManage);
    } catch (e) {
      onError(String(e));
    }
  }
  useEffect(() => {
    reload();
  }, [reloadKey, scope]);

  const isOpen = (k: string) => open.has(k);
  function toggle(k: string, onOpen?: () => void) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else {
        next.add(k);
        onOpen?.();
      }
      return next;
    });
  }

  async function ensurePart(partId: string) {
    if (slicesBy[partId] && printsBy[partId]) return;
    try {
      const [sl, pr] = await Promise.all([
        api.listSlices(scope, partId),
        api.listPrints(scope, partId),
      ]);
      setSlicesBy((m) => ({ ...m, [partId]: sl }));
      setPrintsBy((m) => ({ ...m, [partId]: pr }));
    } catch (e) {
      onError(String(e));
    }
  }
  async function refreshPart(partId: string) {
    try {
      const [sl, pr] = await Promise.all([
        api.listSlices(scope, partId),
        api.listPrints(scope, partId),
      ]);
      setSlicesBy((m) => ({ ...m, [partId]: sl }));
      setPrintsBy((m) => ({ ...m, [partId]: pr }));
    } catch (e) {
      onError(String(e));
    }
  }

  function newProject() {
    setNamePrompt({
      title: "New project",
      initial: "",
      submitLabel: "Create",
      placeholder: "Project name",
      onSubmit: async (name) => {
        try {
          await api.createProject(scope, name);
          await reload();
        } catch (e) {
          onError(String(e));
        }
      },
    });
  }

  function pickUpload(projectId: string | null) {
    uploadTarget.current = projectId;
    fileInput.current?.click();
  }
  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) {
      try {
        await api.uploadStl(scope, f, f.name, uploadTarget.current ?? undefined);
        await reload();
      } catch (err) {
        onError(String(err));
      }
    }
    if (fileInput.current) fileInput.current.value = "";
  }

  async function uploadFiles(files: FileList, projectId: string | null) {
    const stls = Array.from(files).filter((f) => f.name.toLowerCase().endsWith(".stl"));
    if (stls.length === 0) {
      onError("Only .stl files can be uploaded.");
      return;
    }
    try {
      for (const f of stls) await api.uploadStl(scope, f, f.name, projectId ?? undefined);
      await reload();
    } catch (e) {
      onError(String(e));
    }
  }

  async function drop(e: React.DragEvent, projectId: string | null) {
    e.preventDefault();
    setDropTarget(null);
    const files = e.dataTransfer?.files;
    if (files && files.length) {
      await uploadFiles(files, projectId); // desktop file drop → upload here
      return;
    }
    const d = dragRef.current; // internal part move / profile share (cross-panel)
    dragRef.current = null;
    if (!d) return;
    try {
      if (d.kind === "library") {
        // Drop a profile/machine into another panel → share a copy into that scope
        // (pending approval for orgs, unless you're an admin there).
        if (d.fromScope === scope) return; // same scope: nothing to share
        if (!canManage) {
          onError("You don't have permission to add to this scope.");
          return;
        }
        const share = d.itemKind === "machine" ? api.shareMachine : api.shareProfile;
        await share(d.fromScope, d.id, scope);
        bumpReload();
        return;
      }
      if (d.fromScope === scope) {
        await api.patchPart(scope, d.partId, { projectId });
      } else {
        // Cross-panel: relocate the part to this scope (org id or Private)…
        await api.patchPart(d.fromScope, d.partId, { orgId: scope });
        if (projectId) await api.patchPart(scope, d.partId, { projectId });
      }
      bumpReload();
    } catch (err) {
      onError(String(err));
    }
  }

  async function deletePart(partId: string) {
    if (!confirm("Delete this part and all its data?")) return;
    try {
      await api.deletePart(scope, partId);
      await reload();
    } catch (e) {
      onError(String(e));
    }
  }

  function renamePart(part: api.Part) {
    setNamePrompt({
      title: "Rename part",
      initial: part.name,
      submitLabel: "Rename",
      onSubmit: async (name) => {
        if (name === part.name) return;
        try {
          await api.patchPart(scope, part.id, { name });
          await reload();
        } catch (e) {
          onError(String(e));
        }
      },
    });
  }

  function renameProject(proj: api.Project) {
    setNamePrompt({
      title: "Rename project",
      initial: proj.name,
      submitLabel: "Rename",
      onSubmit: async (name) => {
        if (name === proj.name) return;
        try {
          await api.patchProject(scope, proj.id, { name });
          await reload();
        } catch (e) {
          onError(String(e));
        }
      },
    });
  }
  async function deleteProject(p: api.Project) {
    if (p.partCount > 0) {
      onError("Project is not empty — move or delete its parts first.");
      return;
    }
    try {
      await api.deleteProject(scope, p.id);
      await reload();
    } catch (e) {
      onError(String(e));
    }
  }
  function recordPrint(s: api.SliceVersion, partId: string) {
    setNamePrompt({
      title: "Record print",
      initial: "Print",
      submitLabel: "Record",
      placeholder: "e.g. machine / date",
      onSubmit: async (label) => {
        try {
          await api.recordPrint(scope, s.id, label);
          await refreshPart(partId);
        } catch (e) {
          onError(String(e));
        }
      },
    });
  }

  async function toggleFavorite(part: api.Part) {
    try {
      await api.patchPart(scope, part.id, { favorite: !part.isFavorite });
      bumpReload(); // re-sort; favouriting a part also favourites its folder
    } catch (e) {
      onError(String(e));
    }
  }
  async function toggleProjectFavorite(proj: api.Project) {
    try {
      await api.patchProject(scope, proj.id, { favorite: !proj.isFavorite });
      await reload();
    } catch (e) {
      onError(String(e));
    }
  }
  async function duplicatePart(part: api.Part) {
    try {
      await api.duplicatePart(scope, part.id);
      await reload();
    } catch (e) {
      onError(String(e));
    }
  }
  // Profiles + machine presets share the same CRUD/share/approve, dispatched by kind.
  const isMachine = (p: api.ProfileEntry) => p.kind === "machine";
  async function approveProfile(p: api.ProfileEntry) {
    try {
      await (isMachine(p) ? api.approveMachine : api.approveProfile)(scope, p.id);
      await reload();
    } catch (e) {
      onError(String(e));
    }
  }
  async function rejectProfile(p: api.ProfileEntry) {
    if (!window.confirm(`Reject “${p.name}”? The shared copy will be removed.`)) return;
    try {
      await (isMachine(p) ? api.rejectMachine : api.rejectProfile)(scope, p.id);
      await reload();
    } catch (e) {
      onError(String(e));
    }
  }
  async function deleteProfile(p: api.ProfileEntry) {
    if (!window.confirm(`Delete “${p.name}”?`)) return;
    try {
      await (isMachine(p) ? api.deleteMachine : api.deleteProfile)(scope, p.id);
      await reload();
    } catch (e) {
      onError(String(e));
    }
  }
  function renameProfile(p: api.ProfileEntry) {
    setNamePrompt({
      title: isMachine(p) ? "Rename machine" : "Rename profile",
      initial: p.name,
      submitLabel: "Rename",
      onSubmit: async (name) => {
        try {
          await (isMachine(p) ? api.renameMachine : api.renameProfile)(scope, p.id, name);
          await reload();
        } catch (e) {
          onError(String(e));
        }
      },
    });
  }

  const unfiled = parts.filter((p) => !p.projectId);
  const inProject = (pid: string) => parts.filter((p) => p.projectId === pid);

  function renderPart(part: api.Part) {
    const key = `part:${part.id}`;
    const slices = slicesBy[part.id];
    const prints = printsBy[part.id] ?? [];
    const current = slices?.find((s) => s.isCurrent);
    const legacy = slices?.filter((s) => !s.isCurrent) ?? [];
    return (
      <div key={part.id}>
        <Row
          kind="part"
          expandable
          expanded={isOpen(key)}
          onToggle={() => toggle(key, () => ensurePart(part.id))}
          icon="●"
          label={part.name}
          meta={`${part.sliceCount} slice${part.sliceCount === 1 ? "" : "s"}`}
          favorite={part.isFavorite}
          onToggleFavorite={() => toggleFavorite(part)}
          draggable={can("upload_part")}
          onDragStart={() => (dragRef.current = { kind: "part", partId: part.id, fromScope: scope })}
          actions={
            <>
              {can("slice") && (
                <button className="act" onClick={(e) => { e.stopPropagation(); openSlicer(part.id, undefined, scope); }}>
                  Open
                </button>
              )}
              <RowMenu
                items={[
                  ...(can("upload_part")
                    ? [
                        { label: "Rename", onClick: () => renamePart(part) },
                        { label: "Duplicate", onClick: () => duplicatePart(part) },
                      ]
                    : []),
                  ...(can("delete_part")
                    ? [{ label: "Delete part", onClick: () => deletePart(part.id), danger: true }]
                    : []),
                ]}
              />
            </>
          }
        />
        {isOpen(key) && (
          <div className={`children ${part.projectId ? "" : "children-root"}`}>
            {slices === undefined ? (
              <div className="tnode muted note">Loading…</div>
            ) : slices.length === 0 ? (
              <div className="tnode muted note">Not sliced yet — open in the slicer.</div>
            ) : (
              <>
                {current && renderSlice(current, part, prints)}
                {legacy.length > 0 && (
                  <>
                    <Row
                      kind="group"
                      expandable
                      expanded={isOpen(`legacy:${part.id}`)}
                      onToggle={() => toggle(`legacy:${part.id}`)}
                      icon="○"
                      label={`Previous versions (${legacy.length})`}
                    />
                    {isOpen(`legacy:${part.id}`) && (
                      <div className="children">
                        {legacy.map((s) => renderSlice(s, part, prints))}
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </div>
        )}
      </div>
    );
  }

  function renderSlice(s: api.SliceVersion, part: api.Part, prints: api.PrintRun[]) {
    const key = `slice:${s.id}`;
    const mine = prints.filter((p) => p.sliceVersionId === s.id);
    return (
      <div key={s.id}>
        <Row
          kind="slice"
          expandable={mine.length > 0}
          expanded={isOpen(key)}
          onToggle={() => toggle(key)}
          icon="◆"
          label={s.name ? `${s.name} — v${s.version}` : `v${s.version}`}
          meta={sliceMeta(s, mine.length)}
          onClick={() => openSlicer(part.id, s.id, scope)}
          actions={
            <RowMenu
              items={[
                { label: "Download G-code", onClick: () => window.open(api.gcodeUrl(scope, s.id), "_blank") },
                ...(s.simAvailable
                  ? [{ label: "Download simulation", onClick: () => window.open(api.simUrl(scope, s.id), "_blank") }]
                  : []),
                ...(can("record_print")
                  ? [{ label: "Record print", onClick: () => recordPrint(s, part.id) }]
                  : []),
              ]}
            />
          }
        />
        {isOpen(key) && mine.length > 0 && (
          <div className="children">
            {mine.map((p) => (
              <Row
                key={p.id}
                kind="print"
                icon="▪"
                label={p.label}
                meta={`${when(p.createdAt)} · 3D viewer coming soon`}
                onClick={() => onError("Print 3D viewer is coming soon.")}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  function renderProfile(p: api.ProfileEntry) {
    const pending = p.status === "pending";
    const scopeLabel = p.factory
      ? "Factory · read-only"
      : pending
        ? "Pending approval"
        : p.scope === "private"
          ? "Private"
          : "Org";
    const bits = [scopeLabel];
    if (!p.factory) bits.push(`v${p.version}`);
    if (p.kind !== "machine" && p.machineName) bits.push(p.machineName); // its machine
    if (p.createdBy) bits.push(p.createdBy);
    if (p.sharedFrom) bits.push(`shared from ${p.sharedFrom}`);
    const meta = bits.join(" · ");
    const mine = !!p.createdBy && p.createdBy === myEmail;
    const editable = !p.factory && (isPrivate || canApprove || mine);
    return (
      <Row
        key={p.id}
        kind={pending ? "profile pending" : "profile"}
        icon={p.factory ? "★" : "◇"}
        label={p.name}
        meta={meta}
        draggable
        onDragStart={() =>
          (dragRef.current = {
            kind: "library",
            itemKind: p.kind === "machine" ? "machine" : "profile",
            id: p.id,
            name: p.name,
            fromScope: scope,
          })
        }
        actions={
          <>
            {pending && canApprove && (
              <>
                <button
                  className="act"
                  onClick={(e) => { e.stopPropagation(); approveProfile(p); }}
                >
                  Approve
                </button>
                <button
                  className="act"
                  onClick={(e) => { e.stopPropagation(); rejectProfile(p); }}
                >
                  Reject
                </button>
              </>
            )}
            {editable && (
              <RowMenu
                items={[
                  { label: "Rename profile", onClick: () => renameProfile(p) },
                  { label: "Delete profile", onClick: () => deleteProfile(p), danger: true },
                ]}
              />
            )}
          </>
        }
      />
    );
  }

  const partCount = parts.length;
  const projCount = projects.length;
  return (
    <div className={`panel ${isPrivate ? "private" : ""}`}>
      <input ref={fileInput} type="file" accept=".stl" hidden onChange={onFile} />
      <div
        className={`panel-head ${dropTarget === "root" ? "dragover" : ""}`}
        onClick={() => setCollapsed((c) => !c)}
        onDragOver={(e) => { e.preventDefault(); setDropTarget("root"); }}
        onDragLeave={() => setDropTarget(null)}
        onDrop={(e) => drop(e, null)}
      >
        <span className={`panel-toggle ${collapsed ? "" : "open"}`} title={collapsed ? "Expand" : "Collapse"}>
          ▸
        </span>
        <span className="panel-title">{title}</span>
        <span className="panel-count">
          {projCount > 0 && `${projCount} project${projCount === 1 ? "" : "s"} · `}
          {partCount} part{partCount === 1 ? "" : "s"}
        </span>
        <div className="tools" onClick={(e) => e.stopPropagation()}>
          {can("create_project") && (
            <button className="tool-btn" onClick={newProject}>+ New project</button>
          )}
          {can("upload_part") && (
            <button className="tool-btn primary" onClick={() => pickUpload(null)}>
              ↑ Upload STL
            </button>
          )}
        </div>
      </div>

      {!collapsed && (
        <div
          className={`tree ${dropTarget === "root" ? "drop-root" : ""}`}
          onDragOver={(e) => { e.preventDefault(); setDropTarget("root"); }}
          onDragLeave={() => setDropTarget(null)}
          onDrop={(e) => drop(e, null)}
        >
          <div>
            <Row
              kind="folder"
              expandable
              expanded={isOpen(`profiles:${scope}`)}
              onToggle={() => toggle(`profiles:${scope}`)}
              icon="▤"
              label="Profiles"
              meta={`${profiles.length} profile${profiles.length === 1 ? "" : "s"}`}
            />
            {isOpen(`profiles:${scope}`) && (
              <div className="children proj-children">
                {profiles.length === 0 ? (
                  <div className="tnode muted note">No profiles yet.</div>
                ) : (
                  profiles.map(renderProfile)
                )}
              </div>
            )}
          </div>

          <div>
            <Row
              kind="folder"
              expandable
              expanded={isOpen(`machines:${scope}`)}
              onToggle={() => toggle(`machines:${scope}`)}
              icon="▤"
              label="Machines"
              meta={`${machines.length} machine${machines.length === 1 ? "" : "s"}`}
            />
            {isOpen(`machines:${scope}`) && (
              <div className="children proj-children">
                {machines.length === 0 ? (
                  <div className="tnode muted note">No machines yet.</div>
                ) : (
                  machines.map(renderProfile)
                )}
              </div>
            )}
          </div>

          {projects.map((proj) => (
            <div key={proj.id}>
              <Row
                kind="folder"
                expandable
                expanded={isOpen(`p:${proj.id}`)}
                onToggle={() => toggle(`p:${proj.id}`)}
                icon="■"
                label={proj.name}
                meta={`${proj.partCount} part${proj.partCount === 1 ? "" : "s"}`}
                favorite={proj.isFavorite}
                onToggleFavorite={
                  can("create_project") ? () => toggleProjectFavorite(proj) : undefined
                }
                dropActive={dropTarget === proj.id}
                onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDropTarget(proj.id); }}
                onDragLeave={() => setDropTarget(null)}
                onDrop={(e) => { e.stopPropagation(); drop(e, proj.id); }}
                actions={
                  <RowMenu
                    items={[
                      ...(can("upload_part")
                        ? [{ label: "Upload STL here", onClick: () => pickUpload(proj.id) }]
                        : []),
                      ...(can("create_project")
                        ? [{ label: "Rename project", onClick: () => renameProject(proj) }]
                        : []),
                      ...(can("create_project") && proj.partCount === 0
                        ? [{ label: "Delete project", onClick: () => deleteProject(proj), danger: true }]
                        : []),
                    ]}
                  />
                }
              />
              {isOpen(`p:${proj.id}`) && (
                <div className="children proj-children">
                  {inProject(proj.id).length === 0 ? (
                    <div className="tnode muted note">Empty — upload or drag a part here.</div>
                  ) : (
                    inProject(proj.id).map(renderPart)
                  )}
                </div>
              )}
            </div>
          ))}

          <div className="children root-files">
            {unfiled.length === 0 && projects.length === 0 ? (
              <div className="tnode muted note">
                {isPrivate
                  ? "Private space is empty — upload an STL."
                  : "No files yet — upload an STL or create a project."}
              </div>
            ) : (
              unfiled.map(renderPart)
            )}
          </div>
        </div>
      )}
      {namePrompt && (
        <PromptModal {...namePrompt} onClose={() => setNamePrompt(null)} />
      )}
    </div>
  );
}

function PromptModal({
  title,
  initial,
  submitLabel,
  placeholder,
  onSubmit,
  onClose,
}: {
  title: string;
  initial: string;
  submitLabel: string;
  placeholder?: string;
  onSubmit: (value: string) => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState(initial);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    // On touch (iOS), select-all pops the copy/paste callout and blocks typing; just put
    // the cursor at the end. Select-all only with a fine pointer (desktop convenience).
    const coarse = window.matchMedia?.("(pointer: coarse)").matches;
    if (coarse) el.setSelectionRange(el.value.length, el.value.length);
    else el.select();
  }, []);
  function submit() {
    const v = value.trim();
    if (!v) return;
    onClose();
    onSubmit(v);
  }
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>
        <input
          ref={ref}
          type="text"
          className="modal-input"
          value={value}
          placeholder={placeholder}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
            else if (e.key === "Escape") onClose();
          }}
        />
        <div className="modal-actions">
          <button className="tool-btn" onClick={onClose}>
            Cancel
          </button>
          <button className="tool-btn primary" onClick={submit} disabled={!value.trim()}>
            {submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function Row(props: {
  kind: string;
  icon: string;
  label: string;
  meta?: string;
  expandable?: boolean;
  expanded?: boolean;
  onToggle?: () => void;
  onClick?: () => void;
  draggable?: boolean;
  onDragStart?: () => void;
  dropActive?: boolean;
  onDragOver?: (e: React.DragEvent) => void;
  onDragLeave?: () => void;
  onDrop?: (e: React.DragEvent) => void;
  actions?: React.ReactNode;
  favorite?: boolean;
  onToggleFavorite?: () => void;
}) {
  const {
    kind, label, meta, expandable, expanded, onToggle, onClick,
    draggable, onDragStart, dropActive, onDragOver, onDragLeave, onDrop, actions,
    favorite, onToggleFavorite,
  } = props;
  return (
    <div
      className={`tnode ${kind} ${dropActive ? "dragover" : ""}`}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onClick={onClick ?? onToggle}
    >
      <span
        className={`chev ${expandable ? (expanded ? "open" : "closed") : "leaf"}`}
        title={expandable ? (expanded ? "Collapse" : "Expand") : undefined}
        onClick={(e) => {
          if (expandable && onToggle) {
            e.stopPropagation();
            onToggle();
          }
        }}
      >
        {expandable ? "▸" : ""}
      </span>
      {onToggleFavorite ? (
        <button
          className={`star ${favorite ? "on" : ""}`}
          title={favorite ? "Unfavourite" : "Favourite"}
          onClick={(e) => { e.stopPropagation(); onToggleFavorite(); }}
        >
          {favorite ? "★" : "☆"}
        </button>
      ) : (
        <span className="star-spacer" />
      )}
      <span className="lbl">{label}</span>
      {meta && <span className="meta">{meta}</span>}
      {actions && <span className="acts">{actions}</span>}
    </div>
  );
}


type MenuItem = { label: string; onClick: () => void; danger?: boolean };

/** One quiet overflow affordance per row, instead of a spray of inline buttons. */
function RowMenu({ items }: { items: MenuItem[] }) {
  const [open, setOpen] = useState(false);
  if (items.length === 0) return null;
  return (
    <span className="rowmenu" onClick={(e) => e.stopPropagation()}>
      <button className="kebab" title="Actions" onClick={() => setOpen((o) => !o)}>
        ⋯
      </button>
      {open && (
        <>
          <div className="rowmenu-backdrop" onClick={() => setOpen(false)} />
          <div className="rowmenu-pop">
            {items.map((it, i) => (
              <button
                key={i}
                className={it.danger ? "danger" : ""}
                onClick={() => {
                  setOpen(false);
                  it.onClick();
                }}
              >
                {it.label}
              </button>
            ))}
          </div>
        </>
      )}
    </span>
  );
}
