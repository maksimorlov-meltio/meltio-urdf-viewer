/**
 * m600-front-door.js — Meltio M600 HMI · Front door icon with opening / closing animation.
 * Design: option D — solid door slab with the knob cut out, thin rounded frame, hinge on the left.
 * The door turns 45° toward the viewer (opens from right to left), soft stop. Driven only by position — no extra movement.
 *
 * <m600-front-door position="0..1" motion="opening|closing|idle"></m600-front-door>
 *
 * Drive it from the machine:   el.setState({ position: 0.42, motion: 'opening' })
 * Demo / no position feedback: el.open(2500) · el.close(2500) · el.stop()
 *
 * Events (bubble, composed): door-opening · door-opened · door-closing · door-closed · door-stopped
 * Styling: --icon-size (40px) · --m600-fg (#F1F3F5) · --m600-bg (#0F1216, must match the button background,
 *          also on hover) · --m600-interior (#07090B)
 * Layers: el.catLayer is an empty <g> between the frame and the door, used by m600-cat-egg.js.
 * No dependencies. Respects prefers-reduced-motion.
 */
const DOOR_CSS = `
:host{display:inline-block;line-height:0;--icon-size:40px;color:var(--m600-fg,#F1F3F5)}
svg{height:var(--icon-size);width:var(--icon-size);overflow:visible;transition:width .5s cubic-bezier(.2,.8,.2,1)}
svg.wide{width:calc(var(--icon-size) * 1.5)}
.bgf{fill:var(--m600-bg,#0F1216);transition:fill .2s}
.bgs{stroke:var(--m600-bg,#0F1216);transition:stroke .2s}
.floor{opacity:0;transition:opacity .5s}
.floor.wide{opacity:1}
@media (prefers-reduced-motion:reduce){svg,.floor{transition:none}}
`;
const DOOR_SVG = `<svg class="fsvg" viewBox="0 0 36 24" preserveAspectRatio="xMinYMid slice" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
<path id="dark" d="M7.2 5.3H16.8V18.7H7.2Z" fill="var(--m600-interior,#07090B)" stroke="none" opacity="0"></path>
<path d="M6.6 3.4H17.4A1.2 1.2 0 0 1 18.6 4.6V19.4A1.2 1.2 0 0 1 17.4 20.6H6.6A1.2 1.2 0 0 1 5.4 19.4V4.6A1.2 1.2 0 0 1 6.6 3.4Z"></path>
<path id="floor" class="floor" d="M18.6 20.6H33"></path>
<g id="cat-layer"></g>
<path id="leaf" fill="currentColor" stroke-width="0.8"></path>
<circle id="knob" class="bgf" r="1.2" stroke="none"></circle>
</svg>`;

function geometry(p) {
  // Option D: solid door slab, thin frame, hinge on the left. The door turns 45° toward the viewer
  // (opening from right to left): its free edge moves left and grows taller (perspective).
  // Ease-out on the angle (soft stop). Driven only by position — no other movement.
  p = Math.max(0, Math.min(1, p));
  const q = 1 - Math.pow(1 - p, 3);
  const th = 45 * q * Math.PI / 180, c = Math.cos(th), s = Math.sin(th);
  const x0 = 7.2, W = 9.6, hT = 5.3, hB = 18.7;
  const ex = x0 + W * c, eT = hT - 2 * s, eB = hB + 1.8 * s;
  const f = (n) => n.toFixed(2);
  const t = 0.8;
  return {
    leaf: 'M' + f(x0) + ' ' + f(hT) + 'L' + f(ex) + ' ' + f(eT) + 'L' + f(ex) + ' ' + f(eB) + 'L' + f(x0) + ' ' + f(hB) + 'Z',
    kx: f(x0 + (ex - x0) * t),
    ky: f((hT + (eT - hT) * t + hB + (eB - hB) * t) / 2),
    dark: f(Math.min(1, p * 5))
  };
}

export class M600FrontDoor extends HTMLElement {
  static get observedAttributes() { return ['position', 'motion']; }

  constructor() {
    super();
    const root = this.attachShadow({ mode: 'open' });
    root.innerHTML = '<style>' + DOOR_CSS + '</style>' + DOOR_SVG;
    const $ = (id) => root.getElementById(id);
    this.$ = { svg: root.querySelector('svg'), shake: $('shake'), dark: $('dark'), floor: $('floor'), cat: $('cat-layer'),
               leaf: $('leaf'), knob: $('knob') };
    this._p = 0;
    this._m = 'idle';
    this._raf = 0;
    this._render();
  }

  attributeChangedCallback(name, _old, val) {
    if (name === 'position') this.setState({ position: parseFloat(val) || 0 });
    if (name === 'motion') this.setState({ motion: val || 'idle' });
  }

  get position() { return this._p; }
  set position(v) { this.setState({ position: v }); }
  get motion() { return this._m; }
  get catLayer() { return this.$.cat; }
  get wide() { return this.$.svg.classList.contains('wide'); }
  set wide(on) { this.$.svg.classList.toggle('wide', !!on); this.$.floor.classList.toggle('wide', !!on); }

  /** position 0 = closed … 1 = open; motion 'opening' | 'closing' | 'idle' */
  setState({ position = this._p, motion = this._m } = {}) {
    const prevP = this._p, prevM = this._m;
    this._p = Math.max(0, Math.min(1, Number(position)));
    this._m = motion;
    this._render();
    if (this._m !== prevM) {
      if (this._m === 'opening') this._emit('door-opening');
      else if (this._m === 'closing') this._emit('door-closing');
      else if (this._p > 0 && this._p < 1) this._emit('door-stopped');
    }
    if (prevP < 1 && this._p >= 1) this._emit('door-opened');
    if (prevP > 0 && this._p <= 0) this._emit('door-closed');
  }

  open(ms = 2500) { this._animate(1, ms); }
  close(ms = 2500) { this._animate(0, ms); }
  stop() { cancelAnimationFrame(this._raf); this.setState({ motion: 'idle' }); }

  _animate(target, ms) {
    cancelAnimationFrame(this._raf);
    const dir = target > this._p ? 1 : -1;
    if ((dir > 0 && this._p >= 1) || (dir < 0 && this._p <= 0)) return;
    this.setState({ motion: dir > 0 ? 'opening' : 'closing' });
    let last = performance.now();
    const step = (t) => {
      const p = this._p + dir * (t - last) / ms;
      last = t;
      if (dir > 0 ? p >= 1 : p <= 0) { this.setState({ position: dir > 0 ? 1 : 0, motion: 'idle' }); return; }
      this.setState({ position: p });
      this._raf = requestAnimationFrame(step);
    };
    this._raf = requestAnimationFrame(step);
  }

  _render() {
    const g = geometry(this._p);
    const $ = this.$;
    $.leaf.setAttribute('d', g.leaf);
    $.knob.setAttribute('cx', g.kx);
    $.knob.setAttribute('cy', g.ky);
    $.dark.setAttribute('opacity', g.dark);
  }

  _emit(type) { this.dispatchEvent(new CustomEvent(type, { bubbles: true, composed: true, detail: { position: this._p } })); }
}

if (!customElements.get('m600-front-door')) customElements.define('m600-front-door', M600FrontDoor);
