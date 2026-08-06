// URDF robot construction: XML → parsed model → Three.js hierarchy.
// Extracted verbatim from urdf_viewer.js (step-5 phase B2). Boundary rule:
// no page-DOM/window access here — `doc` is an XML Document the caller parsed,
// and everything stateful (mesh loading/caching, styling, per-link material
// registries, joint-state bookkeeping) is injected via hooks:
//
//   buildRobotTree(parsed, urdfUrl, {
//     loadMeshObject,  // (filename, urdfUrl) -> Promise<Object3D>
//     styleMeshTree,   // (object3d) -> void
//     onLinkVisual,    // (linkName, meshObject) -> void  (material registries)
//     onJointState,    // (state, initialValue) -> void   (apply + register)
//   })
import * as THREE from "three";

function parseVec3(text, fallback = [0, 0, 0]) {
  if (!text) {
    return [...fallback];
  }
  const values = text.trim().split(/\s+/).map((v) => Number(v));
  if (values.length !== 3 || values.some((v) => !Number.isFinite(v))) {
    return [...fallback];
  }
  return values;
}

function parseOrigin(node) {
  if (!node) {
    return {
      xyz: [0, 0, 0],
      rpy: [0, 0, 0],
    };
  }
  return {
    xyz: parseVec3(node.getAttribute("xyz"), [0, 0, 0]),
    rpy: parseVec3(node.getAttribute("rpy"), [0, 0, 0]),
  };
}

function applyOriginTransform(target, origin) {
  target.position.set(origin.xyz[0], origin.xyz[1], origin.xyz[2]);
  target.rotation.set(origin.rpy[0], origin.rpy[1], origin.rpy[2], "XYZ");
}

function clamp(value, min, max) {
  const lower = Math.min(min, max);
  const upper = Math.max(min, max);
  return Math.max(lower, Math.min(upper, value));
}

function getImmediateChildrenByTag(parent, tagName) {
  const target = tagName.toLowerCase();
  return Array.from(parent.children).filter((child) => child.tagName.toLowerCase() === target);
}

function getFirstImmediateChildByTag(parent, tagName) {
  return getImmediateChildrenByTag(parent, tagName)[0] || null;
}

export function parseUrdfDocument(doc) {
  const robotNode = doc.querySelector("robot");
  if (!robotNode) {
    throw new Error("URDF has no <robot> root");
  }

  const links = new Map();
  for (const linkNode of robotNode.querySelectorAll("link")) {
    const name = linkNode.getAttribute("name") || "unnamed_link";
    const visuals = [];
    for (const visualNode of getImmediateChildrenByTag(linkNode, "visual")) {
      const originNode = getFirstImmediateChildByTag(visualNode, "origin");
      const geometryNode = getFirstImmediateChildByTag(visualNode, "geometry");
      const meshNode = geometryNode ? getFirstImmediateChildByTag(geometryNode, "mesh") : null;
      if (!meshNode) {
        continue;
      }

      visuals.push({
        filename: meshNode.getAttribute("filename") || "",
        scale: parseVec3(meshNode.getAttribute("scale"), [1, 1, 1]),
        origin: parseOrigin(originNode),
      });
    }

    links.set(name, { name, visuals });
  }

  const joints = [];
  for (const jointNode of robotNode.querySelectorAll("joint")) {
    const name = jointNode.getAttribute("name") || "unnamed_joint";
    const type = (jointNode.getAttribute("type") || "fixed").toLowerCase();
    const parentNode = getFirstImmediateChildByTag(jointNode, "parent");
    const childNode = getFirstImmediateChildByTag(jointNode, "child");
    if (!parentNode || !childNode) {
      continue;
    }

    const axisNode = getFirstImmediateChildByTag(jointNode, "axis");
    const limitNode = getFirstImmediateChildByTag(jointNode, "limit");

    const axis = parseVec3(axisNode ? axisNode.getAttribute("xyz") : "", [0, 0, 1]);
    const lower = limitNode ? Number(limitNode.getAttribute("lower")) : Number.NaN;
    const upper = limitNode ? Number(limitNode.getAttribute("upper")) : Number.NaN;

    joints.push({
      name,
      type,
      parent: parentNode.getAttribute("link") || "",
      child: childNode.getAttribute("link") || "",
      origin: parseOrigin(getFirstImmediateChildByTag(jointNode, "origin")),
      axis,
      lower,
      upper,
    });
  }

  return {
    robotName: robotNode.getAttribute("name") || "robot",
    links,
    joints,
  };
}

async function attachVisualsForLink(linkGroup, linkNode, urdfUrl, hooks) {
  const visualLoads = linkNode.visuals.map(async (visual) => {
    if (!visual.filename) {
      return;
    }

    const wrapper = new THREE.Group();
    applyOriginTransform(wrapper, visual.origin);
    wrapper.scale.set(visual.scale[0], visual.scale[1], visual.scale[2]);

    const meshObject = await hooks.loadMeshObject(visual.filename, urdfUrl);
    hooks.styleMeshTree(meshObject);
    hooks.onLinkVisual(linkNode.name, meshObject);

    wrapper.add(meshObject);
    linkGroup.add(wrapper);
  });

  await Promise.all(visualLoads);
}

export async function buildRobotTree(parsed, urdfUrl, hooks) {
  const linksByName = parsed.links;
  const childrenByParent = new Map();
  const childLinks = new Set();

  for (const joint of parsed.joints) {
    if (!childrenByParent.has(joint.parent)) {
      childrenByParent.set(joint.parent, []);
    }
    childrenByParent.get(joint.parent).push(joint);
    childLinks.add(joint.child);
  }

  let rootLink = "";
  for (const key of linksByName.keys()) {
    if (!childLinks.has(key)) {
      rootLink = key;
      break;
    }
  }
  if (!rootLink) {
    rootLink = linksByName.keys().next().value;
  }

  const rootGroup = new THREE.Group();
  rootGroup.name = parsed.robotName;
  const visited = new Set();

  async function visitLink(linkName, parentGroup) {
    if (!linksByName.has(linkName) || visited.has(linkName)) {
      return;
    }
    visited.add(linkName);

    const linkGroup = new THREE.Group();
    linkGroup.name = `link:${linkName}`;
    parentGroup.add(linkGroup);

    await attachVisualsForLink(linkGroup, linksByName.get(linkName), urdfUrl, hooks);

    const childJoints = childrenByParent.get(linkName) || [];
    for (const joint of childJoints) {
      const jointFrame = new THREE.Group();
      jointFrame.name = `joint_frame:${joint.name}`;
      applyOriginTransform(jointFrame, joint.origin);
      linkGroup.add(jointFrame);

      let childParent = jointFrame;

      if (joint.type === "revolute" || joint.type === "continuous" || joint.type === "prismatic") {
        const axisRaw = new THREE.Vector3(joint.axis[0], joint.axis[1], joint.axis[2]);
        const axis = axisRaw.lengthSq() > 0 ? axisRaw.normalize() : new THREE.Vector3(0, 0, 1);

        const motionGroup = new THREE.Group();
        motionGroup.name = `joint_motion:${joint.name}`;
        jointFrame.add(motionGroup);

        const defaultLower = joint.type === "prismatic" ? -0.2 : -Math.PI;
        const defaultUpper = joint.type === "prismatic" ? 0.2 : Math.PI;
        const lower = Number.isFinite(joint.lower) ? joint.lower : defaultLower;
        const upper = Number.isFinite(joint.upper) ? joint.upper : defaultUpper;
        const initial = clamp(0, lower, upper);

        const state = {
          name: joint.name,
          kind: joint.type === "prismatic" ? "linear" : "angular",
          axis,
          motionGroup,
          lower,
          upper,
          value: initial,
          valueEl: null,
        };
        hooks.onJointState(state, initial);

        childParent = motionGroup;
      }

      await visitLink(joint.child, childParent);
    }
  }

  await visitLink(rootLink, rootGroup);
  return rootGroup;
}
