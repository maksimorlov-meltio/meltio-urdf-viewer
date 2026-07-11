import * as api from "./api";

export const when = (iso: string) => new Date(iso).toLocaleDateString();
export const daysUntil = (iso: string) =>
  Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000));

export function sliceMeta(s: api.SliceVersion, prints: number): string {
  const bits = [s.profileName, `${s.layerCount} layers`, `${s.estimatedWeightG} g`];
  if (s.slicerVersion) bits.push(`slicer ${s.slicerVersion}`);
  if (s.simAvailable) bits.push("sim");
  if (prints > 0) bits.push(`${prints} print${prints === 1 ? "" : "s"}`);
  if (s.isLegacy) {
    bits.push(when(s.createdAt));
    if (prints === 0 && s.expiresAt) {
      bits.push(`(auto-deletes in ${daysUntil(s.expiresAt)} days unless printed)`);
    }
  }
  return bits.join(" · ");
}
