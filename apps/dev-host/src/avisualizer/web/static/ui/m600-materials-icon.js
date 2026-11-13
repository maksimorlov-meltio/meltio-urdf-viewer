/**
 * m600-materials-icon.js — Meltio M600 HMI · "Materials" bottom-bar icon with activate / deactivate animation.
 * Design: today's outline spool + "Spring 2 · double bounce".
 * Activate: the spool turns back (unwinding), the wire runs from the right side of the spool strictly up,
 *           overshoots and settles with a soft double bounce; the spool bounces twice with it.
 * Deactivate: the wire retracts and the spool winds back to its rest position.
 *
 * <m600-materials-icon active></m600-materials-icon>
 *   el.active = true / false        (or toggle the `active` attribute)
 *
 * Styling: --icon-size (40px) · --m600-fg (inherits currentColor)
 * No dependencies. Uses the Web Animations API. Respects prefers-reduced-motion.
 */
const MAT_CSS = `
:host{display:inline-block;line-height:0;color:var(--m600-fg,currentColor)}
svg{width:var(--icon-size,40px);height:var(--icon-size,40px);overflow:visible}
.spool{transform-box:view-box;transform-origin:12px 12px}
.wwrap{transform-box:view-box;transform-origin:21px 12px}
.wire{stroke-dasharray:11 11;stroke-dashoffset:11}
`;
const MAT_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
<g class="wwrap"><path class="wire" d="M21 12V1" pathLength="11"></path></g>
<g class="spool"><circle cx="12" cy="12" r="9"></circle><circle cx="12" cy="12" r="2.6"></circle>
<path d="M12 3v6.4"></path><path d="M4.2 16.5l5.6-3.2"></path><path d="M19.8 16.5l-5.6-3.2"></path></g>
</svg>`;

const IO = 'ease-in-out';
const OUT = 'cubic-bezier(.2,.8,.2,1)';
const STD = 'cubic-bezier(.4,0,.2,1)';

class M600MaterialsIcon extends HTMLElement {
  static get observedAttributes() { return ['active']; }
  constructor() {
    super();
    const r = this.attachShadow({ mode: 'open' });
    r.innerHTML = `<style>${MAT_CSS}</style>${MAT_SVG}`;
    this._spool = r.querySelector('.spool');
    this._wrap = r.querySelector('.wwrap');
    this._wire = r.querySelector('.wire');
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
    const cs = getComputedStyle(this._spool);
    const spoolFrom = cs.transform === 'none' ? 'rotate(0deg)' : cs.transform;
    const wireFrom = parseFloat(getComputedStyle(this._wire).strokeDashoffset) || (on ? 11 : 0);
    this._anims.forEach((a) => a.cancel()); this._anims = [];
    const fin = { fill: 'forwards' };
    if (reduce) {
      this._anims.push(this._spool.animate([{ transform: on ? 'rotate(-120deg)' : 'rotate(0deg)' }], { duration: 0, ...fin }));
      this._anims.push(this._wire.animate([{ strokeDashoffset: on ? 0 : 11 }], { duration: 0, ...fin }));
      return;
    }
    if (on) {
      // spool: unwind to -140°, then double bounce and settle at -120°   (total ≈ 1.37 s)
      this._anims.push(this._spool.animate([
        { transform: spoolFrom, easing: 'cubic-bezier(.3,.7,.3,1)' },
        { transform: 'rotate(-140deg)', offset: 0.47, easing: IO },
        { transform: 'rotate(-106deg)', offset: 0.60, easing: IO },
        { transform: 'rotate(-128deg)', offset: 0.73, easing: IO },
        { transform: 'rotate(-117deg)', offset: 0.87, easing: IO },
        { transform: 'rotate(-120deg)' },
      ], { duration: 1370, ...fin }));
      // wire draws straight up
      this._anims.push(this._wire.animate([{ strokeDashoffset: wireFrom }, { strokeDashoffset: 0 }],
        { duration: 650, easing: OUT, ...fin }));
      // wire spring: overshoot, undershoot, small overshoot, settle
      this._anims.push(this._wrap.animate([
        { transform: 'none', easing: IO },
        { transform: 'scaleY(1.14)', offset: 0.18, easing: IO },
        { transform: 'scaleY(.94)', offset: 0.43, easing: IO },
        { transform: 'scaleY(1.05)', offset: 0.68, easing: IO },
        { transform: 'scaleY(.99)', offset: 0.88 },
        { transform: 'none' },
      ], { duration: 830, delay: 540 }));
    } else {
      this._anims.push(this._spool.animate([{ transform: spoolFrom }, { transform: 'rotate(0deg)' }],
        { duration: 720, easing: STD, ...fin }));
      this._anims.push(this._wire.animate([{ strokeDashoffset: wireFrom }, { strokeDashoffset: 11 }],
        { duration: 720, easing: STD, ...fin }));
    }
  }
}
if (!customElements.get('m600-materials-icon')) customElements.define('m600-materials-icon', M600MaterialsIcon);
export { M600MaterialsIcon };
