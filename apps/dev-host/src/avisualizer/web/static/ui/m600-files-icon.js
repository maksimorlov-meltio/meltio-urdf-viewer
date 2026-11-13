/**
 * m600-files-icon.js — Meltio M600 HMI · "Files" bottom-bar icon with activate / deactivate animation.
 * Design: "Files 2 · white, lines re-type" — solid white page with a cut (folded) corner and three dark text lines.
 * Activate: two pages pop out behind it (spring, slight tilt) and the text lines quickly wipe and re-write.
 * Deactivate: the pages behind shrink and fade back; the front page never moves.
 *
 * <m600-files-icon active></m600-files-icon>
 *   el.active = true / false        (or toggle the `active` attribute)
 *
 * Styling: --icon-size (40px) · --m600-fg (inherits currentColor) · --m600-bg (#0F1216 — must match the
 *          button background, also on hover; used for the text lines, fold and back-page fill)
 * No dependencies. Uses the Web Animations API. Respects prefers-reduced-motion.
 */
const FILES_CSS = `
:host{display:inline-block;line-height:0;color:var(--m600-fg,currentColor)}
svg{width:var(--icon-size,40px);height:var(--icon-size,40px);overflow:visible}
.bgf{fill:var(--m600-bg,#0F1216);transition:fill .2s}
.bgs{stroke:var(--m600-bg,#0F1216);transition:stroke .2s}
.bk{transform-box:view-box;transform-origin:12.5px 12px;opacity:0;transform:scale(.6)}
`;
const BACK = 'M7.2 3H17.8A1.2 1.2 0 0 1 19 4.2V19.8A1.2 1.2 0 0 1 17.8 21H7.2A1.2 1.2 0 0 1 6 19.8V4.2A1.2 1.2 0 0 1 7.2 3Z';
const FILES_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
<g transform="translate(-1.6 1.6)">
<path class="bk b1 bgf" d="${BACK}"></path>
<path class="bk b0 bgf" d="${BACK}"></path>
<path fill="currentColor" d="M6 4.2A1.2 1.2 0 0 1 7.2 3H14L19 8V19.8A1.2 1.2 0 0 1 17.8 21H7.2A1.2 1.2 0 0 1 6 19.8Z"></path>
<path class="bgs" stroke-width="1.3" d="M14 3.6V7a1 1 0 0 0 1 1H18.4"></path>
<path class="ln bgs" stroke-width="1.5" d="M9 12.6H16" pathLength="7" stroke-dasharray="7 7"></path>
<path class="ln bgs" stroke-width="1.5" d="M9 15.4H16" pathLength="7" stroke-dasharray="7 7"></path>
<path class="ln bgs" stroke-width="1.5" d="M9 18.2H13" pathLength="4" stroke-dasharray="4 4"></path>
</g></svg>`;

const SPRING = 'cubic-bezier(.34,1.56,.64,1)';
const OUT = 'cubic-bezier(.2,.8,.2,1)';
const BACKS = [
  { on: 'translate(2.2px,-2px) rotate(5deg)', opacity: 0.85 },
  { on: 'translate(4.2px,-3.6px) rotate(10deg)', opacity: 0.6 },
];

class M600FilesIcon extends HTMLElement {
  static get observedAttributes() { return ['active']; }
  constructor() {
    super();
    const r = this.attachShadow({ mode: 'open' });
    r.innerHTML = `<style>${FILES_CSS}</style>${FILES_SVG}`;
    this._backs = [r.querySelector('.b0'), r.querySelector('.b1')];
    this._lines = [...r.querySelectorAll('.ln')];
    this._anims = [];
    this._state = false;
  }
  get active() { return this.hasAttribute('active'); }
  set active(v) { v ? this.setAttribute('active', '') : this.removeAttribute('active'); }
  connectedCallback() { if (this.active !== this._state) this._apply(this.active, true); }
  attributeChangedCallback() { if (this.isConnected && this.active !== this._state) this._apply(this.active, false); }

  _apply(on, instant) {
    this._state = on;
    const reduce = instant || matchMedia('(prefers-reduced-motion: reduce)').matches;
    // freeze where we are, so an interrupted animation reverses smoothly
    const from = this._backs.map((b) => { const cs = getComputedStyle(b); return { transform: cs.transform === 'none' ? 'none' : cs.transform, opacity: cs.opacity }; });
    this._anims.forEach((a) => a.cancel()); this._anims = [];
    this._backs.forEach((b, i) => {
      const to = on ? { transform: BACKS[i].on, opacity: BACKS[i].opacity } : { transform: 'scale(.6)', opacity: 0 };
      const a = b.animate([from[i], to], reduce ? { duration: 0, fill: 'forwards' } :
        on ? { duration: 800, delay: i * 110, easing: SPRING, fill: 'both' } : { duration: 600, delay: (1 - i) * 60, easing: OUT, fill: 'both' });
      this._anims.push(a);
    });
    if (on && !reduce) {
      this._lines.forEach((l, i) => {
        const len = +l.getAttribute('pathLength');
        this._anims.push(l.animate([
          { strokeDashoffset: 0, easing: 'ease-in' },
          { strokeDashoffset: len, offset: 0.35, easing: OUT },
          { strokeDashoffset: 0 },
        ], { duration: 620, delay: 80 + i * 170, fill: 'none' }));
      });
    }
  }
}
if (!customElements.get('m600-files-icon')) customElements.define('m600-files-icon', M600FilesIcon);
export { M600FilesIcon };
