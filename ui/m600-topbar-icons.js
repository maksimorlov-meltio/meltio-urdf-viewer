/**
 * m600-topbar-icons.js — Meltio M600 HMI · top bar status icons with animations.
 * One file, five web components (no dependencies, Web Animations / CSS only, respects prefers-reduced-motion):
 *
 *   <m600-chiller state="idle|cooling">            thermometer + snowflake; cooling = blue, column runs up and down, snowflake turns
 *   <m600-movement active>                          solid 4-way arrows; nudge() (or setting `active`) pushes the arrows out one by one
 *   <m600-notifications severity="none|info|warning|alarm" count="3" [acknowledged]>
 *                                                   bell coloured by the most severe open issue, count badge (99+);
 *                                                   rings once when the count goes up; on alarm keeps ringing until `acknowledged`
 *   <m600-calendar active>                          solid calendar; pulse() (or `active`) pulses today
 *   <m600-settings active>                          sliders; knobs slide to new positions while active, slide back when not
 *
 * Styling (CSS custom properties, set on the button or any parent):
 *   --icon-size (24px) · --m600-fg (currentColor) · --m600-bg (#0F1216, must equal the bar background, also on hover)
 *   --m600-cool (#7CC8FF) · --m600-info (#5AA9FF) · --m600-warning (#F2C14E) · --m600-alarm (#FF5A52) · --m600-badge-alarm (#E5484D)
 */
const BASE_CSS = `
:host{display:inline-block;position:relative;line-height:0;color:var(--m600-fg,currentColor)}
svg{width:var(--icon-size,24px);height:var(--icon-size,24px);overflow:visible}
.bgf{fill:var(--m600-bg,#0F1216);transition:fill .2s}
.bgs{stroke:var(--m600-bg,#0F1216);transition:stroke .2s}
@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
`;
const svg = (inner) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
const SP = 'cubic-bezier(.34,1.56,.64,1)';

class M600Icon extends HTMLElement {
  constructor(css, inner) {
    super();
    this.attachShadow({ mode: 'open' }).innerHTML = `<style>${BASE_CSS}${css}</style>${svg(inner)}`;
    this.$ = (s) => this.shadowRoot.querySelector(s);
    this.$$ = (s) => [...this.shadowRoot.querySelectorAll(s)];
  }
  get active() { return this.hasAttribute('active'); }
  set active(v) { this.toggleAttribute('active', !!v); }
  _replay(el, cls) { el.classList.remove(cls); void el.getBoundingClientRect(); el.classList.add(cls); }
}

/* ---------- chiller ---------- */
class M600Chiller extends M600Icon {
  static get observedAttributes() { return ['state']; }
  constructor() {
    super(`
:host([state=cooling]){color:var(--m600-cool,#7CC8FF)}
.merc,.snow{transform-box:view-box}
.merc{transform-origin:10.7px 15.6px}
:host([state=cooling]) .merc{animation:merc .8s ease-in-out infinite alternate}
:host([state=cooling]) .snow{animation:snow 4s linear infinite}
@keyframes merc{from{transform:scaleY(1)}to{transform:scaleY(.25)}}
@keyframes snow{to{transform:rotate(360deg)}}`, `<path stroke-width="1.6" d="M8.6 13.9V5.4a2.1 2.1 0 0 1 4.2 0v8.5a4.1 4.1 0 1 1-4.2 0Z"></path><path class="merc" stroke-width="2.2" d="M10.7 15.6V8.2"></path><circle fill="currentColor" stroke="none" cx="10.7" cy="17.1" r="2.15"></circle><g class="snow" style="transform-origin:16.9px 6.4px"><path stroke-width="1.5" d="M16.90 8.90L16.90 3.90M14.73 7.65L19.07 5.15M19.07 7.65L14.73 5.15"></path></g>`);
  }
  get state() { return this.getAttribute('state') || 'idle'; }
  set state(v) { this.setAttribute('state', v); }
}

/* ---------- movement ---------- */
class M600Movement extends M600Icon {
  static get observedAttributes() { return ['active']; }
  constructor() {
    super(`
.ar{transform-box:view-box}
.go .ar-u{animation:nu .9s ${SP} both} .go .ar-d{animation:nd .9s ${SP} .08s both}
.go .ar-l{animation:nl .9s ${SP} .16s both} .go .ar-r{animation:nr .9s ${SP} .24s both}
@keyframes nu{0%,100%{transform:none}35%,55%{transform:translateY(-1.3px)}}
@keyframes nd{0%,100%{transform:none}35%,55%{transform:translateY(1.3px)}}
@keyframes nl{0%,100%{transform:none}35%,55%{transform:translateX(-1.3px)}}
@keyframes nr{0%,100%{transform:none}35%,55%{transform:translateX(1.3px)}}`, `<g class="ar ar-u"><path d="M12 9.6V4"></path><path fill="currentColor" stroke="none" d="M12 2.4L15.2 6.2H8.8Z"></path></g><g class="ar ar-d"><path d="M12 14.4V20"></path><path fill="currentColor" stroke="none" d="M12 21.6L8.8 17.8H15.2Z"></path></g><g class="ar ar-l"><path d="M9.6 12H4"></path><path fill="currentColor" stroke="none" d="M2.4 12L6.2 8.8V15.2Z"></path></g><g class="ar ar-r"><path d="M14.4 12H20"></path><path fill="currentColor" stroke="none" d="M21.6 12L17.8 15.2V8.8Z"></path></g><circle fill="currentColor" stroke="none" cx="12" cy="12" r="2.2"></circle>`);
  }
  attributeChangedCallback() { if (this.active) this.nudge(); }
  nudge() { this._replay(this.$('svg'), 'go'); }
}

/* ---------- notifications ---------- */
class M600Notifications extends M600Icon {
  static get observedAttributes() { return ['severity', 'count', 'acknowledged']; }
  constructor() {
    super(`
:host([severity=info]){color:var(--m600-info,#5AA9FF)}
:host([severity=warning]){color:var(--m600-warning,#F2C14E)}
:host([severity=alarm]){color:var(--m600-alarm,#FF5A52)}
.bell,.clap{transform-box:view-box}
.clap{transform-origin:12px 18px}
.ring .bell{animation:ring 1.3s both} .ring .clap{animation:clap 1.3s both}
:host([severity=alarm]:not([acknowledged])) .bell{animation:ringA 1.4s infinite}
@keyframes ring{0%{transform:none}12%{transform:rotate(16deg)}28%{transform:rotate(-14deg)}44%{transform:rotate(10deg)}60%{transform:rotate(-7deg)}76%{transform:rotate(3deg)}100%{transform:none}}
@keyframes ringA{0%{transform:none}10%{transform:rotate(14deg)}20%{transform:rotate(-12deg)}30%{transform:rotate(8deg)}40%{transform:rotate(-5deg)}50%,100%{transform:none}}
@keyframes clap{0%,8%{transform:none}20%{transform:translateX(-1px)}36%{transform:translateX(1px)}52%{transform:translateX(-.6px)}70%,100%{transform:none}}
.badge{position:absolute;top:-6px;left:calc(var(--icon-size,24px) * .62);min-width:17px;height:17px;padding:0 4px;box-sizing:border-box;border-radius:9px;
 border:2px solid var(--m600-bg,#0F1216);font:700 10px/13px system-ui,sans-serif;text-align:center;color:#fff;background:var(--m600-info,#5AA9FF);display:none}
.badge.show{display:block}
:host([severity=warning]) .badge{background:var(--m600-warning,#F2C14E);color:#1a1300}
:host([severity=alarm]) .badge{background:var(--m600-badge-alarm,#E5484D)}
.badge.pop{animation:pop .45s ${SP} both}
@keyframes pop{from{transform:scale(0)}to{transform:none}}`, `<g class="bell" style="transform-origin:12px 3.6px"><path fill="currentColor" stroke="none" d="M12 3.2a1.4 1.4 0 0 1 1.4 1.4v.5a6 6 0 0 1 4.6 5.8v4.2l1.6 2.1a.8.8 0 0 1-.6 1.3H5a.8.8 0 0 1-.6-1.3L6 15.1v-4.2a6 6 0 0 1 4.6-5.8v-.5A1.4 1.4 0 0 1 12 3.2Z"></path><g class="clap"><path fill="currentColor" stroke="none" d="M9.8 19.6h4.4a2.2 2.2 0 0 1-4.4 0Z"></path></g></g>`);
    const badge = document.createElement('span'); badge.className = 'badge'; this.shadowRoot.appendChild(badge);
    this._count = 0;
  }
  get severity() { return this.getAttribute('severity') || 'none'; }
  set severity(v) { this.setAttribute('severity', v); }
  get count() { return this._count; }
  set count(v) { this.setAttribute('count', String(v)); }
  /** One call for a status update: { severity, count } */
  setState({ severity, count } = {}) { if (severity) this.severity = severity; if (count !== undefined) this.count = count; }
  acknowledge() { this.setAttribute('acknowledged', ''); }
  attributeChangedCallback(name) {
    if (name === 'count') {
      const n = Math.max(0, parseInt(this.getAttribute('count'), 10) || 0);
      const b = this.$('.badge');
      b.textContent = n > 99 ? '99+' : String(n);
      b.classList.toggle('show', n > 0);
      if (n > this._count) { this._replay(b, 'pop'); this._replay(this.$('svg'), 'ring'); this.removeAttribute('acknowledged'); }
      this._count = n;
    }
    if (name === 'severity' && this.severity === 'alarm') this.removeAttribute('acknowledged');
  }
}

/* ---------- calendar ---------- */
class M600Calendar extends M600Icon {
  static get observedAttributes() { return ['active']; }
  constructor() {
    super(`
.today{transform-box:view-box}
.go .today{animation:today .7s ${SP} both}
@keyframes today{0%,100%{transform:none}45%{transform:scale(1.45)}}`, `<rect fill="currentColor" stroke="none" x="3.4" y="4.8" width="17.2" height="16" rx="2.3"></rect><path class="bgs" stroke-width="1.2" d="M3.4 9.4H20.6"></path><rect class="bgf" x="5.9" y="11.6" width="2.6" height="2.4" rx=".6"></rect><rect class="bgf" x="5.9" y="15.6" width="2.6" height="2.4" rx=".6"></rect><rect class="bgf" x="10.7" y="11.6" width="2.6" height="2.4" rx=".6"></rect><rect class="bgf" x="10.7" y="15.6" width="2.6" height="2.4" rx=".6"></rect><rect class="bgf" x="15.5" y="11.6" width="2.6" height="2.4" rx=".6"></rect><path class="bgs" stroke-width="3.2" d="M8 2.9V6.4M16 2.9V6.4"></path><path stroke-width="1.8" d="M8 2.9V6.4M16 2.9V6.4"></path><rect class="today bgf" x="15.5" y="15.6" width="2.6" height="2.4" rx=".6" style="transform-origin:16.8px 16.8px"></rect>`);
  }
  attributeChangedCallback() { if (this.active) this.pulse(); }
  pulse() { this._replay(this.$('svg'), 'go'); }
}

/* ---------- settings (sliders) ---------- */
class M600Settings extends M600Icon {
  static get observedAttributes() { return ['active']; }
  constructor() {
    super(`
.kn circle{transform-box:view-box;transition:transform .6s ${SP}}
.kn .k2{transition-delay:.06s} .kn .k3{transition-delay:.12s}
:host([active]) .k1{transform:translateX(7px)}
:host([active]) .k2{transform:translateX(-6px)}
:host([active]) .k3{transform:translateX(5px)}`, `<g class="sl" stroke-width="1.8"><path d="M3.5 6.5H20.5M3.5 12H20.5M3.5 17.5H20.5"></path></g><g class="kn"><circle class="k1" fill="currentColor" stroke="none" cx="8" cy="6.5" r="2.4"></circle><circle class="k2" fill="currentColor" stroke="none" cx="15.5" cy="12" r="2.4"></circle><circle class="k3" fill="currentColor" stroke="none" cx="10" cy="17.5" r="2.4"></circle></g>`);
  }
}

const defs = { 'm600-chiller': M600Chiller, 'm600-movement': M600Movement, 'm600-notifications': M600Notifications, 'm600-calendar': M600Calendar, 'm600-settings': M600Settings };
for (const [tag, cls] of Object.entries(defs)) if (!customElements.get(tag)) customElements.define(tag, cls);
export { M600Chiller, M600Movement, M600Notifications, M600Calendar, M600Settings };
