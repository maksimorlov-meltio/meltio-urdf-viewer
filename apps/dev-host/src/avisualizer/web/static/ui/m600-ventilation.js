/**
 * m600-ventilation.js — Meltio M600 HMI · Ventilation (enclosure fan) icon for the top bar.
 * Design: real axial fan (five curved blades, hub with label ring, square frame with inset edge and screw holes).
 * Running: the blades spin with a soft start / soft stop, and three curled wind lines blow out to the right
 * in short, fast gusts — all lines together (≈ 2 gusts per second). Stopped: just the fan, no wind.
 *
 * <m600-ventilation state="stopped|running" [alarm]></m600-ventilation>
 *   el.state = 'running' | 'stopped'
 *   el.alarm = true   → icon turns red (e.g. "Cooling fan alarm: airflow below safe threshold")
 *
 * Styling: --icon-size (24px) · --m600-fg (currentColor) · --m600-bg (#0F1216 — must equal the bar background,
 *          also on hover; used for the cut-outs) · --m600-alarm (#FF5A52)
 * No dependencies. Respects prefers-reduced-motion (no spin, wind shown static while running).
 */
const VENT_CSS = `
:host{display:inline-block;line-height:0;color:var(--m600-fg,currentColor)}
:host([alarm]){color:var(--m600-alarm,#FF5A52)}
svg{width:var(--icon-size,24px);height:var(--icon-size,24px);overflow:visible}
.bgf{fill:var(--m600-bg,#0F1216);transition:fill .2s}
.bgs{stroke:var(--m600-bg,#0F1216);transition:stroke .2s}
.rotor{transform-box:view-box;transform-origin:12px 12px;animation:spin 1.1s linear infinite;animation-play-state:paused}
@keyframes spin{to{transform:rotate(360deg)}}
.air{opacity:0;transition:opacity .45s ease}
:host([state=running]) .air{opacity:1}
.wa{stroke-dasharray:.55 1.45;stroke-dashoffset:.55;animation:gust .5s linear infinite;animation-play-state:paused}
:host([state=running]) .wa{animation-play-state:running}
@keyframes gust{0%{stroke-dashoffset:.55;opacity:0}20%{opacity:1}80%{opacity:1}100%{stroke-dashoffset:-1;opacity:0}}
@media (prefers-reduced-motion:reduce){.rotor,.wa{animation:none!important}.wa{stroke-dasharray:none}}
`;
const VENT_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><defs><linearGradient id="taper" gradientUnits="userSpaceOnUse" x1="16.2" y1="0" x2="20.4" y2="0"><stop offset="0" stop-color="currentColor" stop-opacity=".15"></stop><stop offset="1" stop-color="currentColor" stop-opacity="1"></stop></linearGradient></defs><g transform="translate(8.4 12) scale(0.7) translate(-12 -12)"><rect fill="currentColor" stroke="none" x="2.2" y="2.2" width="19.6" height="19.6" rx="3"></rect><circle class="bgf" cx="5" cy="5" r="1.05"></circle><circle class="bgf" cx="5" cy="19" r="1.05"></circle><circle class="bgf" cx="19" cy="5" r="1.05"></circle><circle class="bgf" cx="19" cy="19" r="1.05"></circle><circle class="bgf" cx="12" cy="12" r="9"></circle><rect class="bgs" fill="none" stroke-width=".5" x="3.3" y="3.3" width="17.4" height="17.4" rx="2.2"></rect><g class="rotor" style="transform-origin:12px 12px"><g class="bl"><path transform="rotate(0.00 12 12)" fill="currentColor" class="bgs" stroke-width=".55" stroke-linejoin="round" d="M10.60 9.12L10.23 8.82L9.78 8.57L9.28 8.39L8.72 8.27L8.13 8.23L7.50 8.26L6.86 8.38L6.20 8.58L5.54 8.87L4.90 9.24L4.28 9.70L3.69 10.23L3.79 8.82L4.19 7.44L4.91 6.17L5.92 5.12L7.17 4.35L8.54 3.90L9.94 3.75L10.67 4.05L11.31 4.41L11.87 4.83L12.34 5.28L12.73 5.75L13.04 6.24L13.27 6.74L13.43 7.24L13.52 7.74L13.54 8.22L13.51 8.68L13.40 9.12Z"></path><path transform="rotate(72.00 12 12)" fill="currentColor" class="bgs" stroke-width=".55" stroke-linejoin="round" d="M10.60 9.12L10.23 8.82L9.78 8.57L9.28 8.39L8.72 8.27L8.13 8.23L7.50 8.26L6.86 8.38L6.20 8.58L5.54 8.87L4.90 9.24L4.28 9.70L3.69 10.23L3.79 8.82L4.19 7.44L4.91 6.17L5.92 5.12L7.17 4.35L8.54 3.90L9.94 3.75L10.67 4.05L11.31 4.41L11.87 4.83L12.34 5.28L12.73 5.75L13.04 6.24L13.27 6.74L13.43 7.24L13.52 7.74L13.54 8.22L13.51 8.68L13.40 9.12Z"></path><path transform="rotate(144.00 12 12)" fill="currentColor" class="bgs" stroke-width=".55" stroke-linejoin="round" d="M10.60 9.12L10.23 8.82L9.78 8.57L9.28 8.39L8.72 8.27L8.13 8.23L7.50 8.26L6.86 8.38L6.20 8.58L5.54 8.87L4.90 9.24L4.28 9.70L3.69 10.23L3.79 8.82L4.19 7.44L4.91 6.17L5.92 5.12L7.17 4.35L8.54 3.90L9.94 3.75L10.67 4.05L11.31 4.41L11.87 4.83L12.34 5.28L12.73 5.75L13.04 6.24L13.27 6.74L13.43 7.24L13.52 7.74L13.54 8.22L13.51 8.68L13.40 9.12Z"></path><path transform="rotate(216.00 12 12)" fill="currentColor" class="bgs" stroke-width=".55" stroke-linejoin="round" d="M10.60 9.12L10.23 8.82L9.78 8.57L9.28 8.39L8.72 8.27L8.13 8.23L7.50 8.26L6.86 8.38L6.20 8.58L5.54 8.87L4.90 9.24L4.28 9.70L3.69 10.23L3.79 8.82L4.19 7.44L4.91 6.17L5.92 5.12L7.17 4.35L8.54 3.90L9.94 3.75L10.67 4.05L11.31 4.41L11.87 4.83L12.34 5.28L12.73 5.75L13.04 6.24L13.27 6.74L13.43 7.24L13.52 7.74L13.54 8.22L13.51 8.68L13.40 9.12Z"></path><path transform="rotate(288.00 12 12)" fill="currentColor" class="bgs" stroke-width=".55" stroke-linejoin="round" d="M10.60 9.12L10.23 8.82L9.78 8.57L9.28 8.39L8.72 8.27L8.13 8.23L7.50 8.26L6.86 8.38L6.20 8.58L5.54 8.87L4.90 9.24L4.28 9.70L3.69 10.23L3.79 8.82L4.19 7.44L4.91 6.17L5.92 5.12L7.17 4.35L8.54 3.90L9.94 3.75L10.67 4.05L11.31 4.41L11.87 4.83L12.34 5.28L12.73 5.75L13.04 6.24L13.27 6.74L13.43 7.24L13.52 7.74L13.54 8.22L13.51 8.68L13.40 9.12Z"></path></g><circle fill="currentColor" stroke="none" cx="12" cy="12" r="3.3"></circle><circle class="bgs" fill="none" stroke-width=".6" cx="12" cy="12" r="2.3"></circle><circle class="bgf" cx="12" cy="12" r=".75"></circle></g></g><g class="air" stroke-width="1.3"><path class="wa wa0" pathLength="1" stroke="url(#taper)" stroke-width="1.3" d="M16.4 8H21.6A1.7 1.7 0 1 0 19.9 6.3"></path><path class="wa wa1" pathLength="1" stroke="url(#taper)" stroke-width="1.3" d="M17.2 12H23.4A1.9 1.9 0 1 1 21.5 13.9"></path><path class="wa wa2" pathLength="1" stroke="url(#taper)" stroke-width="1.3" d="M16.4 16H20.6A1.5 1.5 0 1 1 19.1 17.5"></path></g></svg>`;

class M600Ventilation extends HTMLElement {
  static get observedAttributes() { return ['state']; }
  constructor() {
    super();
    this.attachShadow({ mode: 'open' }).innerHTML = `<style>${VENT_CSS}</style>${VENT_SVG}`;
    this._rotor = this.shadowRoot.querySelector('.rotor');
    this._raf = 0;
  }
  get state() { return this.getAttribute('state') || 'stopped'; }
  set state(v) { this.setAttribute('state', v); }
  get alarm() { return this.hasAttribute('alarm'); }
  set alarm(v) { this.toggleAttribute('alarm', !!v); }
  connectedCallback() { this._apply(true); }
  attributeChangedCallback() { if (this.isConnected) this._apply(false); }

  // soft start / soft stop: ramp the spin animation's playback rate
  _apply(instant) {
    const anim = this._rotor.getAnimations()[0];
    if (!anim) return;
    const on = this.state === 'running';
    cancelAnimationFrame(this._raf);
    if (instant || matchMedia('(prefers-reduced-motion: reduce)').matches) {
      anim.playbackRate = 1; on ? anim.play() : anim.pause(); return;
    }
    const from = anim.playState === 'running' ? anim.playbackRate : 0, to = on ? 1 : 0;
    const dur = on ? 700 : 1100, t0 = performance.now();
    anim.playbackRate = Math.max(from, 0.001); anim.play();
    const step = (now) => {
      const k = Math.min(1, (now - t0) / dur), e = on ? k * k : 1 - Math.pow(1 - k, 2);
      anim.playbackRate = Math.max(0.001, from + (to - from) * e);
      if (k < 1) this._raf = requestAnimationFrame(step);
      else if (!on) anim.pause();
    };
    this._raf = requestAnimationFrame(step);
  }
}
if (!customElements.get('m600-ventilation')) customElements.define('m600-ventilation', M600Ventilation);
export { M600Ventilation };
