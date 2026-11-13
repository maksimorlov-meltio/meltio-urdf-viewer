/**
 * m600-top-door.js — Meltio M600 HMI · Top door icon with opening / closing animation.
 * VIEWER NOTE (2026-11-11): this copy differs from Maksim's hand-off in the drawing only - his picks "A" and
 * then "A2" from docs/top-door-options-2026-11-11.html and docs/top-door-options-2-2026-11-11.html:
 *   - the body is taller (y 7.2-21 instead of 10.9-21), so the closed icon is as tall as the other bar icons;
 *     hatch, hinge, arc, end mark and slot moved up by 3.7 units with it;
 *   - the front shows the machine door: a small window (7 x 5.6) and a short, thin bar handle on its right
 *     (a cut-out, class .bgs). The line under the window from "A2" was removed and the handle made smaller
 *     at his request the same day.
 * Behaviour, API and events are unchanged. The original hand-off file is in git history (commit a0666d4b).
 * Design: solid enclosure with a front window (glass glare), solid top hatch hinged at the back (hinge-pin cut-out),
 * opens max 45°. While it moves, a dotted swing arc appears piece by piece in step with the hatch (and disappears
 * piece by piece on closing). A short end mark shows only when fully open. A dark slot with a thin lit line opens on top.
 *
 * <m600-top-door position="0..1" motion="opening|closing|idle"></m600-top-door>
 *
 * Drive it from the machine:   el.setState({ position: 0.42, motion: 'opening' })
 * Demo / no position feedback: el.open(1200) · el.close(1200) · el.stop()
 *
 * Events (bubble, composed): top-door-opening · top-door-opened · top-door-closing · top-door-closed · top-door-stopped
 * Styling: --icon-size (40px) · --m600-fg (inherits currentColor) · --m600-bg (#0F1216 — must match the button
 *          background, also on hover; used for the window, slot and hinge-pin cut-outs)
 * No dependencies. Respects prefers-reduced-motion (open()/close() jump to the end state).
 */
const TD_CSS = `
:host{display:inline-block;line-height:0;color:var(--m600-fg,currentColor)}
svg{width:var(--icon-size,40px);height:var(--icon-size,40px);overflow:visible}
.bgf{fill:var(--m600-bg,#0F1216);transition:fill .2s}
.bgs{stroke:var(--m600-bg,#0F1216);transition:stroke .2s}
`;
const ARC = 'M17.10 4.09A13.2 13.2 0 0 0 14.40 -2.43';
const TD_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
<mask id="arcMask" maskUnits="userSpaceOnUse" x="0" y="-9.7" width="26" height="20">
<path id="mk" stroke="#fff" stroke-width="3" stroke-linecap="butt" pathLength="1" stroke-dasharray="1 1" stroke-dashoffset="1" d="${ARC}"></path></mask>
<g id="arc" mask="url(#arcMask)" stroke-width="1" opacity="0"><path stroke-dasharray="1 1.8" stroke-opacity=".8" d="${ARC}"></path></g>
<path id="tick" stroke-width="1" opacity="0" d="M13.53 -1.75L15.27 -3.1"></path>
<rect fill="currentColor" stroke="none" x="4" y="7.2" width="16" height="13.8" rx="1.2"></rect>
<path class="bgf" stroke="none" d="M8.6 12.4H14A0.8 0.8 0 0 1 14.8 13.2V17.2A0.8 0.8 0 0 1 14 18H8.6A0.8 0.8 0 0 1 7.8 17.2V13.2A0.8 0.8 0 0 1 8.6 12.4Z"></path>
<path stroke-width=".8" stroke-opacity=".55" d="M9.83 16.78L11.98 14.52M12.42 16.78L13.71 15.38"></path>
<path class="bgs" stroke-width=".8" d="M17.3 14.1V16.3"></path>
<g id="slot" opacity="0"><rect class="bgf" stroke="none" x="5.6" y="7.2" width="12.8" height="2.6" rx=".6"></rect><path stroke-width="1" stroke-opacity=".8" d="M7.2 8.7H16.8"></path></g>
<g id="lid"><rect fill="currentColor" stroke="none" x="4" y="4.7" width="16" height="2" rx=".8"></rect><circle class="bgf" stroke="none" cx="5.2" cy="5.7" r=".55"></circle></g>
</svg>`;

const MAX_ANGLE = 45;          // degrees
const HINGE = [4, 5.7];        // hinge pin, back top corner

class M600TopDoor extends HTMLElement {
  static get observedAttributes() { return ['position', 'motion']; }
  constructor() {
    super();
    const r = this.attachShadow({ mode: 'open' });
    r.innerHTML = `<style>${TD_CSS}</style>${TD_SVG}`;
    this._el = { lid: r.getElementById('lid'), slot: r.getElementById('slot'), arc: r.getElementById('arc'), mk: r.getElementById('mk'), tick: r.getElementById('tick') };
    this._p = 0; this._motion = 'idle'; this._raf = 0;
    this._render();
  }
  get position() { return this._p; }
  get motion() { return this._motion; }
  attributeChangedCallback(name, _o, v) {
    if (name === 'position') this.setState({ position: parseFloat(v) || 0 });
    if (name === 'motion') this.setState({ motion: v || 'idle' });
  }
  /** Drive from real door feedback. position 0 = closed … 1 = open; motion 'opening' | 'closing' | 'idle'. */
  setState({ position, motion } = {}) {
    if (typeof position === 'number' && isFinite(position)) this._p = Math.max(0, Math.min(1, position));
    if (motion && motion !== this._motion) {
      const prev = this._motion; this._motion = motion;
      if (motion === 'opening') this._emit('top-door-opening');
      else if (motion === 'closing') this._emit('top-door-closing');
      else if (prev !== 'idle') this._emit(this._p >= 1 ? 'top-door-opened' : this._p <= 0 ? 'top-door-closed' : 'top-door-stopped');
    }
    this._render();
  }
  /** Demo helpers (time-based, no position feedback). */
  open(ms = 1200) { this._run(1, ms); }
  close(ms = 1200) { this._run(0, ms); }
  stop() { cancelAnimationFrame(this._raf); this.setState({ motion: 'idle' }); }

  _run(target, ms) {
    cancelAnimationFrame(this._raf);
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { this.setState({ position: target, motion: target ? 'opening' : 'closing' }); this.setState({ motion: 'idle' }); return; }
    const from = this._p, dist = Math.abs(target - from);
    if (!dist) return;
    const dur = ms * dist, t0 = performance.now();
    this.setState({ motion: target > from ? 'opening' : 'closing' });
    const step = (now) => {
      const k = Math.min(1, (now - t0) / dur);
      this.setState({ position: from + (target - from) * k });
      if (k < 1) this._raf = requestAnimationFrame(step); else this.setState({ motion: 'idle' });
    };
    this._raf = requestAnimationFrame(step);
  }
  _render() {
    const p = this._p;
    const q = 1 - Math.pow(1 - p, 3);                         // soft stop near fully open / closed
    const e = this._el;
    e.lid.setAttribute('transform', `rotate(${(-MAX_ANGLE * q).toFixed(2)} ${HINGE[0]} ${HINGE[1]})`);
    // dotted swing arc: revealed piece by piece in step with the hatch
    e.mk.setAttribute('stroke-dashoffset', (1 - q).toFixed(4));
    e.arc.setAttribute('opacity', p > 0.001 ? '1' : '0');
    e.tick.setAttribute('opacity', p >= 0.999 ? '.85' : '0');
    // dark slot with lit line opens on top
    const s = Math.max(0, Math.min(1, (q - 0.12) / 0.8));
    e.slot.setAttribute('opacity', s > 0 ? '1' : '0');
    e.slot.setAttribute('transform', `translate(0 7.2) scale(1 ${s.toFixed(3)}) translate(0 -7.2)`);
  }
  _emit(type) { this.dispatchEvent(new CustomEvent(type, { bubbles: true, composed: true, detail: { position: this._p } })); }
}
if (!customElements.get('m600-top-door')) customElements.define('m600-top-door', M600TopDoor);
export { M600TopDoor };
