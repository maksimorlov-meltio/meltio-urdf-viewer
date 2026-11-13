/**
 * m600-cat-egg.js — Meltio M600 HMI · Front-door cat Easter egg (separate from the door animation).
 * Needs m600-front-door.js. Renders into door.catLayer (between the door frame and the leaf).
 *
 *   import './m600-front-door.js';
 *   import { M600CatEgg } from './m600-cat-egg.js';
 *   const egg = new M600CatEgg(document.querySelector('m600-front-door'), { mode: 'every3rd' });
 *
 * Wiring (automatic, via the door's events):
 *   door-opened  → if this open is an Easter-egg open: icon widens, story plays
 *                  eyes 1.0s · emerge 0.9s · walkOut 1.8s · around 1.4s · sit 2.4s · yawn 1.3s · stretch 1.3s · sleep
 *   door-closing → wake 0.45s (if asleep) · scared 0.65–0.7s · runIn 0.85s · in
 *   door-closed  → reset, icon shrinks back to normal width
 * Options: mode 'every3rd' (default) | 'always' | 'off' | number N (every Nth open) · storageKey for the open counter
 *          onPhase(phase) callback. Methods: play() · flee() · reset() · destroy().
 * The Easter egg is skipped entirely when prefers-reduced-motion is set.
 */
const CAT_CSS = `/* ===== cat ===== */
.cat{transform:translate(12px,20.6px) scale(.3);opacity:0;transition:transform .8s cubic-bezier(.2,.8,.2,1),opacity .5s}
.cat.ph-in{transition:none}
.cat.ph-eyes{transform:translate(12px,19.1px) scale(.45);opacity:1;transition:opacity .6s}
.cat.ph-emerge{transform:translate(12px,20.6px) scale(.5);opacity:1;transition:transform .9s cubic-bezier(.2,.8,.2,1),opacity .4s}
.cat.ph-walkOut,.cat.ph-around,.cat.ph-sit,.cat.ph-yawn,.cat.ph-stretch,.cat.ph-sleep,.cat.ph-wake,.cat.ph-scared{transform:translate(27px,20.6px) scale(.5);opacity:1;transition:transform 1.8s cubic-bezier(.35,.05,.4,1),opacity .3s}
.cat.ph-runIn{transform:translate(11px,20.6px) scale(.32);opacity:0;transition:transform .85s cubic-bezier(.5,0,.9,1),opacity .3s .55s}
.ph-eyes .cshadow{opacity:0}
.ph-runIn .face{transform:scaleX(-1)}
.peyes,.pw,.psi,.pst,.plo,.psc,.prun{display:none}
.ph-eyes .peyes{display:inline}
.ph-in .pw,.ph-emerge .pw,.ph-walkOut .pw,.ph-around .pw{display:inline}
.ph-sit .psi,.ph-yawn .psi{display:inline}
.ph-stretch .pst{display:inline}
.ph-sleep .plo,.ph-wake .plo{display:inline}
.ph-scared .psc{display:inline}
.ph-runIn .prun{display:inline}
/* eyes in the dark */
.glint{transform-box:fill-box;transform-origin:center;animation:eblink 1s both}
@keyframes eblink{0%{opacity:0}30%,62%{opacity:1;transform:none}68%{transform:scaleY(.1)}76%,100%{opacity:1;transform:none}}
/* walk */
.leg{transform-box:view-box;transform-origin:0 0}
.ph-walkOut .leg{animation:step .56s linear infinite}
.l1{animation-delay:-.14s!important}.l2{animation-delay:-.28s!important}.l3{animation-delay:-.42s!important}
@keyframes step{0%{transform:rotate(-22deg)}55%{transform:rotate(20deg)}70%{transform:translateY(-.8px) rotate(8deg)}85%{transform:translateY(-.6px) rotate(-12deg)}100%{transform:rotate(-22deg)}}
.ph-walkOut .torso{animation:bob .28s ease-in-out infinite alternate}
@keyframes bob{to{transform:translateY(-.4px)}}
.head{transform-box:fill-box;transform-origin:0% 100%}
.ph-walkOut .head{animation:nod .56s ease-in-out infinite}
@keyframes nod{50%{transform:translateY(.3px) rotate(3deg)}}
.ph-emerge .head{animation:sniffair .9s ease-in-out}
@keyframes sniffair{30%{transform:rotate(-14deg)}45%{transform:rotate(-10deg)}60%{transform:rotate(-15deg)}100%{transform:none}}
.ph-around .head{animation:lookaround 1.4s ease-in-out both}
@keyframes lookaround{0%{transform:none}25%,40%{transform:rotate(-14deg)}60%,75%{transform:rotate(10deg)}100%{transform:none}}
.ctail{transform-box:fill-box;transform-origin:100% 100%}
.ph-walkOut .ctail{animation:tsway 1.1s ease-in-out infinite alternate}
.ph-around .ctail,.ph-emerge .ctail{animation:tsway 1.6s ease-in-out infinite alternate}
@keyframes tsway{from{transform:rotate(-8deg)}to{transform:rotate(8deg)}}
.eyeC{display:none}
.wblink{transform-box:fill-box;transform-origin:center}
.ph-around .wblink{animation:blink 1.4s .6s both}
@keyframes blink{0%,40%,60%,100%{transform:scaleY(1)}50%{transform:scaleY(.1)}}
/* sit · look at you · yawn */
.psi{transform-box:view-box;transform-origin:3px 0;animation:sitdown .5s cubic-bezier(.2,.8,.2,1)}
@keyframes sitdown{from{transform:rotate(10deg) translateY(-.8px)}to{transform:none}}
.chest{transform-box:fill-box;transform-origin:50% 100%;animation:breathe 3.2s ease-in-out infinite}
@keyframes breathe{50%{transform:scaleY(1.03)}}
.stail{transform-box:fill-box;transform-origin:0% 50%;animation:flick 2.4s ease-in-out infinite}
@keyframes flick{0%,55%,100%{transform:none}70%{transform:rotate(-6deg)}82%{transform:rotate(3deg)}}
.hfront,.hyawn{opacity:0}
.hfront{transform-box:fill-box;transform-origin:50% 80%}
.ph-sit .hside{animation:hsideOut 2.2s .2s both}
.ph-sit .hfront{animation:hfrontIn 2.2s .2s both}
@keyframes hsideOut{0%{opacity:1}10%,90%{opacity:0}100%{opacity:1}}
@keyframes hfrontIn{0%{opacity:0}10%{opacity:1;transform:none}35%{transform:rotate(-12deg)}60%{transform:rotate(8deg)}90%{opacity:1;transform:none}100%{opacity:0}}
.feye{transform-box:fill-box;transform-origin:center}
.ph-sit .feye{animation:slowblink 2.2s .2s both}
@keyframes slowblink{0%,62%{transform:none}70%,80%{transform:scaleY(.12)}88%,100%{transform:none}}
.ph-yawn .hside{opacity:0}
.hyawn{transform-box:view-box;transform-origin:5.4px -6.6px}
.ph-yawn .hyawn{opacity:1;animation:yawn 1.3s ease-in-out both}
@keyframes yawn{0%{transform:none}35%,70%{transform:rotate(-18deg)}100%{transform:rotate(-4deg)}}
.ymouth{transform-box:fill-box;transform-origin:0% 0%}
.ph-yawn .ymouth{animation:mouth 1.3s ease-in-out both}
@keyframes mouth{0%{transform:scale(.15)}35%,70%{transform:scale(1)}100%{transform:scale(.1)}}
/* stretch */
.pst{transform-box:view-box;transform-origin:-4px 0;animation:stretchIn 1.3s ease-in-out}
@keyframes stretchIn{0%{transform:scaleX(.86) translateY(-.6px)}45%{transform:scaleX(1.08)}100%{transform:none}}
.ctail2{transform-box:fill-box;transform-origin:50% 100%;animation:quiver .12s linear infinite alternate}
@keyframes quiver{to{transform:rotate(5deg)}}
/* sleep · wake */
.plo{transform-box:view-box;transform-origin:0 0;animation:liedown .8s cubic-bezier(.2,.8,.2,1)}
@keyframes liedown{0%{transform:scaleY(1.6) rotate(6deg)}60%{transform:scaleY(.95)}100%{transform:none}}
.lbody{transform-box:fill-box;transform-origin:50% 100%;animation:breathe2 3.8s ease-in-out infinite}
@keyframes breathe2{50%{transform:scaleY(1.06)}}
.ph-sleep .eyeO{display:none}
.ph-sleep .eyeC{display:inline}
.lheadIn{transition:transform .3s cubic-bezier(.2,.8,.2,1)}
.ph-wake .lheadIn{transform:translateY(-1.4px) rotate(-8deg)}
.ltail{transform-box:fill-box;transform-origin:0% 50%}
.ph-sleep .ltail{animation:flick 4.5s 1s ease-in-out infinite}
.z{opacity:0;transform-box:fill-box;transform-origin:center}
.ph-sleep .z{animation:zz 3s .8s ease-out infinite}
.ph-sleep .z2{animation-delay:1.8s}
.ph-sleep .z3{animation-delay:2.8s}
@keyframes zz{0%{opacity:0;transform:translate(0,0) scale(.6)}20%{opacity:.9}100%{opacity:0;transform:translate(2px,-5px) scale(1.15)}}
/* scared */
.psc{transform-box:view-box;transform-origin:0 0;animation:puff .35s cubic-bezier(.2,.8,.2,1)}
@keyframes puff{0%{transform:scale(.85,.75)}50%{transform:translateY(-2.8px) scale(1.06,1.12)}100%{transform:none}}
.shv{animation:shiver .07s linear .35s infinite alternate}
@keyframes shiver{from{transform:translateX(-.2px)}to{transform:translateX(.2px)}}
.fur{animation:bristle .14s linear infinite alternate}
@keyframes bristle{to{opacity:.55}}
/* gallop: two key poses alternate */
.gA{animation:gal .3s steps(1) infinite}
.gB{animation:gal .3s steps(1) -.15s infinite}
@keyframes gal{0%{opacity:1}50%{opacity:0}}
.prun{animation:galbob .15s ease-in-out infinite alternate}
@keyframes galbob{to{transform:translateY(-.8px)}}
`;
const CAT_SVG = `<g class="cat ph-in">
<ellipse class="cshadow" cx="0" cy="0.35" rx="6" ry="0.65" fill="currentColor" fill-opacity="0.14" stroke="none"></ellipse>
<g class="face">
<g class="peyes">
<path fill="currentColor" fill-opacity="0.22" stroke="none" d="M-2.8 -10.4L-2.4 -12.8L-1 -11.2ZM2.8 -10.4L2.4 -12.8L1 -11.2Z"></path>
<g class="glint"><ellipse cx="-1.2" cy="-9" rx="0.6" ry="0.48" fill="#E8C468" stroke="none"></ellipse><ellipse cx="1.2" cy="-9" rx="0.6" ry="0.48" fill="#E8C468" stroke="none"></ellipse>
<ellipse cx="-1.2" cy="-9" rx="0.14" ry="0.4" fill="#07090b" stroke="none"></ellipse><ellipse cx="1.2" cy="-9" rx="0.14" ry="0.4" fill="#07090b" stroke="none"></ellipse></g>
</g>
<g class="pw">
<g opacity="0.5" stroke-width="1.25">
<g transform="translate(2.6 -4.2)"><path class="leg l3" d="M0 0L0.2 3.9Q0.25 4.2 0.9 4.2"></path></g>
<g transform="translate(-3.2 -4.4)"><path class="leg l1" d="M0 0Q-1.3 1.7 -0.5 2.8L-0.2 4Q-0.1 4.4 0.6 4.4"></path></g>
</g>
<g class="ctail"><path fill="currentColor" stroke="none" d="M-5.4 -6C-7.6 -6.6 -8.9 -8.6 -8.4 -10.9C-8.2 -11.8 -7.5 -12.1 -7 -11.7C-7.6 -10.6 -7.5 -8.6 -5.2 -6.9Z"></path><path class="bgs" stroke-width="0.35" d="M-8.6 -9.6L-7.8 -9.4M-8.3 -8.2L-7.5 -8.3"></path></g>
<g class="torso"><path fill="currentColor" stroke="none" d="M-5.6 -6.4C-4.4 -7.6 -1.2 -7.3 1.2 -7.4C2.8 -7.5 4.2 -7.4 4.9 -6.4C5.4 -5.6 5.2 -4.4 4.4 -3.8C3.6 -3.3 2.6 -3.5 1.6 -3.6C-0.4 -3.8 -2.6 -3.6 -4.2 -3.9C-5.6 -4.2 -6.3 -5.4 -5.6 -6.4Z"></path>
<path class="bgs" stroke-width="0.35" d="M-2.6 -7.25L-2.3 -6.4M-1.2 -7.35L-1 -6.5M0.2 -7.4L0.35 -6.55M2.7 -6.9C3.4 -6.2 3.6 -5.1 3.2 -4.3M-3.5 -6.9C-4.6 -6.4 -4.9 -5.2 -4.4 -4.3"></path></g>
<g class="head"><path fill="currentColor" stroke="none" d="M4.3 -6.9C3.9 -8.5 4.8 -9.9 6 -10.3L5.8 -12.4L7.4 -10.8C7.9 -10.9 8.4 -10.9 8.9 -10.7L10.1 -12.2L10 -9.9C10.5 -9.4 10.7 -8.8 10.6 -8.2C11.2 -8 11.4 -7.4 11 -7C10.4 -6.5 9.2 -6.2 8 -6.2C6.6 -6.2 5 -6.2 4.3 -6.9Z"></path><path class="bgf" stroke="none" d="M6.3 -10.5L6.2 -11.6L7 -10.8ZM9.4 -10.6L9.9 -11.5L9.9 -10.2Z"></path><g class="eyeO wblink"><ellipse class="bgf" stroke="none" cx="9" cy="-8.7" rx="0.45" ry="0.55"></ellipse><circle cx="9.15" cy="-8.88" r="0.13" fill="currentColor" stroke="none"></circle></g><path class="bgs eyeC" stroke-width="0.4" d="M8.5 -8.6Q9 -8.2 9.5 -8.6"></path><path class="bgf" stroke="none" d="M10.95 -7.35L10.55 -7.15L10.6 -7.55Z"></path><path class="bgs" stroke-width="0.3" d="M10.6 -7.1Q10.3 -6.7 9.8 -6.8"></path><path stroke-width="0.22" opacity="0.75" d="M10.3 -7.4L12.6 -8M10.3 -7.1L12.7 -7.1M10.3 -6.8L12.5 -6.3"></path></g>
<g stroke-width="1.25">
<g transform="translate(3.6 -4.2)"><path class="leg l0" d="M0 0L0.2 3.9Q0.25 4.2 0.9 4.2"></path></g>
<g transform="translate(-4.2 -4.4)"><path class="leg l2" d="M0 0Q-1.3 1.7 -0.5 2.8L-0.2 4Q-0.1 4.4 0.6 4.4"></path></g>
</g>
</g>
<g class="psi">
<path class="stail" stroke-width="1.2" d="M-4.4 -0.3C-2.4 0.5 1.4 0.5 3.8 0.3C5 0.2 5.8 -0.3 6 -1.2"></path>
<path class="chest" fill="currentColor" stroke="none" d="M-4.6 0C-5.8 -0.4 -6 -2.6 -5.2 -4.4C-4.4 -6.2 -2.6 -7.4 -0.8 -8.6C0.2 -9.3 0.8 -10 1 -10.8L3.6 -10.8C3.8 -9 3.6 -7.2 3.2 -5.2C3 -3.2 3.2 -1.4 3.4 0Z"></path>
<path class="bgs" stroke-width="0.45" d="M-4.2 -0.8C-3.6 -3.4 -1.4 -4.2 0.2 -3C0.8 -2.4 0.9 -1 0.8 0"></path>
<path class="bgs" stroke-width="0.32" d="M2.9 -8.6L3.3 -8M2.7 -7.7L3.2 -7.1M-3.6 -5.8L-3 -5.3M-2.6 -6.6L-2 -6.1"></path>
<path class="bgs" stroke-width="0.3" d="M5 -0.1L5.3 -0.8M2.2 0.4L2.4 -0.2"></path>
<g transform="translate(-4.4 -4.4)">
<g class="hside"><path fill="currentColor" stroke="none" d="M4.3 -6.9C3.9 -8.5 4.8 -9.9 6 -10.3L5.8 -12.4L7.4 -10.8C7.9 -10.9 8.4 -10.9 8.9 -10.7L10.1 -12.2L10 -9.9C10.5 -9.4 10.7 -8.8 10.6 -8.2C11.2 -8 11.4 -7.4 11 -7C10.4 -6.5 9.2 -6.2 8 -6.2C6.6 -6.2 5 -6.2 4.3 -6.9Z"></path><path class="bgf" stroke="none" d="M6.3 -10.5L6.2 -11.6L7 -10.8ZM9.4 -10.6L9.9 -11.5L9.9 -10.2Z"></path><g class="eyeO sblink"><ellipse class="bgf" stroke="none" cx="9" cy="-8.7" rx="0.45" ry="0.55"></ellipse><circle cx="9.15" cy="-8.88" r="0.13" fill="currentColor" stroke="none"></circle></g><path class="bgs eyeC" stroke-width="0.4" d="M8.5 -8.6Q9 -8.2 9.5 -8.6"></path><path class="bgf" stroke="none" d="M10.95 -7.35L10.55 -7.15L10.6 -7.55Z"></path><path class="bgs" stroke-width="0.3" d="M10.6 -7.1Q10.3 -6.7 9.8 -6.8"></path><path stroke-width="0.22" opacity="0.75" d="M10.3 -7.4L12.6 -8M10.3 -7.1L12.7 -7.1M10.3 -6.8L12.5 -6.3"></path></g>
<g class="hyawn"><path fill="currentColor" stroke="none" d="M4.3 -6.9C3.9 -8.5 4.8 -9.9 6 -10.3L5.8 -12.4L7.4 -10.8C7.9 -10.9 8.4 -10.9 8.9 -10.7L10.1 -12.2L10 -9.9C10.5 -9.4 10.7 -8.8 10.6 -8.2C11.2 -8 11.4 -7.4 11 -7C10.4 -6.5 9.2 -6.2 8 -6.2C6.6 -6.2 5 -6.2 4.3 -6.9Z"></path><path class="bgf" stroke="none" d="M6.3 -10.5L6.2 -11.6L7 -10.8ZM9.4 -10.6L9.9 -11.5L9.9 -10.2Z"></path><path class="bgs" stroke-width="0.4" d="M8.5 -8.6Q9 -8.2 9.5 -8.6"></path><path class="bgf" stroke="none" d="M10.95 -7.35L10.55 -7.15L10.6 -7.55Z"></path><path class="bgf ymouth" stroke="none" d="M10.7 -7L11.6 -5.9L9.7 -6.3Z"></path><path class="bgs" stroke-width="0.3" d="M10.9 -6.6L10.75 -6.1"></path><path stroke-width="0.22" opacity="0.75" d="M10.3 -7.4L12.6 -8M10.3 -7.1L12.7 -7.1M10.3 -6.8L12.5 -6.3"></path></g>
</g>
<g transform="translate(2.9 -11.9)"><g class="hfront"><path fill="currentColor" stroke="none" d="M-2.4 -0.2C-2.6 -1.6 -2.2 -2.6 -1.6 -3.2L-2 -5.2L-0.4 -3.8C0 -3.9 0.4 -3.9 0.8 -3.8L2.4 -5.2L2 -3.2C2.6 -2.6 3 -1.6 2.8 -0.2C2.4 1.2 1.2 1.8 0.2 1.8C-0.8 1.8 -2 1.2 -2.4 -0.2Z"></path><path class="bgf" stroke="none" d="M-1.5 -3.4L-1.7 -4.4L-0.8 -3.7ZM1.9 -3.4L2.1 -4.4L1.2 -3.7Z"></path><g class="feye"><ellipse class="bgf" stroke="none" cx="-0.9" cy="-1" rx="0.5" ry="0.62"></ellipse><ellipse class="bgf" stroke="none" cx="1.3" cy="-1" rx="0.5" ry="0.62"></ellipse><circle cx="-0.78" cy="-1.2" r="0.14" fill="currentColor" stroke="none"></circle><circle cx="1.42" cy="-1.2" r="0.14" fill="currentColor" stroke="none"></circle></g><path class="bgf" stroke="none" d="M-0.05 0.25H0.45L0.2 0.6Z"></path><path class="bgs" stroke-width="0.25" d="M0.2 0.6V0.9M0.2 0.9Q-0.2 1.2 -0.5 0.95M0.2 0.9Q0.6 1.2 0.9 0.95"></path><path stroke-width="0.22" opacity="0.75" d="M-1.6 0.3L-4.2 -0.2M-1.6 0.6L-4.3 0.7M-1.6 0.9L-4 1.5M2 0.3L4.6 -0.2M2 0.6L4.7 0.7M2 0.9L4.4 1.5"></path></g></g>
<path class="bgs" stroke-width="2" d="M3 -5L3.2 -0.3Q3.3 0 4.3 0"></path>
<path stroke-width="1.25" d="M3 -5L3.2 -0.3Q3.3 0 4.3 0"></path>
<path class="bgs" stroke-width="0.25" d="M3.75 -0.05V-0.45"></path>
</g>
<g class="pst">
<g opacity="0.5" stroke-width="1.25"><path d="M-3.4 -6L-3.6 -0.2"></path><path d="M2.2 -2.6L8 -0.3"></path></g>
<path class="ctail2" stroke-width="1.3" d="M-5.8 -8C-7.4 -9.6 -7.2 -12 -5.8 -13"></path>
<path fill="currentColor" stroke="none" d="M-6 -8.2C-5.2 -9.2 -3.6 -8.8 -2.6 -8.2C-0.4 -6.8 2.2 -4.6 4.2 -3.2C5 -2.6 4.6 -1.6 3.6 -1.7C1.2 -2 -1.8 -3.8 -3.8 -5C-5 -5.8 -6.6 -7 -6 -8.2Z"></path>
<path class="bgs" stroke-width="0.35" d="M-3.4 -8.1L-3.2 -7.2M-2 -7.3L-1.7 -6.5M-0.6 -6.4L-0.3 -5.6"></path>
<g stroke-width="1.25"><path d="M-4.6 -6.4L-4.8 -0.3Q-4.8 0 -4.1 0"></path><path d="M3 -2.2L8.6 -0.2Q9 0 9.5 0"></path></g>
<g transform="translate(-0.6 5.2)"><path fill="currentColor" stroke="none" d="M4.3 -6.9C3.9 -8.5 4.8 -9.9 6 -10.3L5.8 -12.4L7.4 -10.8C7.9 -10.9 8.4 -10.9 8.9 -10.7L10.1 -12.2L10 -9.9C10.5 -9.4 10.7 -8.8 10.6 -8.2C11.2 -8 11.4 -7.4 11 -7C10.4 -6.5 9.2 -6.2 8 -6.2C6.6 -6.2 5 -6.2 4.3 -6.9Z"></path><path class="bgf" stroke="none" d="M6.3 -10.5L6.2 -11.6L7 -10.8ZM9.4 -10.6L9.9 -11.5L9.9 -10.2Z"></path><path class="bgs" stroke-width="0.4" d="M8.5 -8.6Q9 -8.2 9.5 -8.6"></path><path class="bgf" stroke="none" d="M10.95 -7.35L10.55 -7.15L10.6 -7.55Z"></path><path class="bgf ymouth" stroke="none" d="M10.7 -7L11.6 -5.9L9.7 -6.3Z"></path><path class="bgs" stroke-width="0.3" d="M10.9 -6.6L10.75 -6.1"></path><path stroke-width="0.22" opacity="0.75" d="M10.3 -7.4L12.6 -8M10.3 -7.1L12.7 -7.1M10.3 -6.8L12.5 -6.3"></path></g>
</g>
<g class="plo">
<path class="lbody" fill="currentColor" stroke="none" d="M-6.2 0C-6.8 -2 -5.4 -4.4 -2.6 -4.8C0 -5.2 2.6 -4.8 4 -3.6C4.8 -2.8 4.8 -1.2 4.6 0Z"></path>
<path class="bgs" stroke-width="0.35" d="M-3.6 -4.6L-3.4 -3.8M-2.2 -4.9L-2 -4.1M-0.8 -5L-0.7 -4.2M-4.6 -1.2C-3.8 -2.4 -2.2 -2.6 -1.2 -1.6"></path>
<g transform="translate(-1.6 5.4)"><g class="lheadIn"><path fill="currentColor" stroke="none" d="M4.3 -6.9C3.9 -8.5 4.8 -9.9 6 -10.3L5.8 -12.4L7.4 -10.8C7.9 -10.9 8.4 -10.9 8.9 -10.7L10.1 -12.2L10 -9.9C10.5 -9.4 10.7 -8.8 10.6 -8.2C11.2 -8 11.4 -7.4 11 -7C10.4 -6.5 9.2 -6.2 8 -6.2C6.6 -6.2 5 -6.2 4.3 -6.9Z"></path><path class="bgf" stroke="none" d="M6.3 -10.5L6.2 -11.6L7 -10.8ZM9.4 -10.6L9.9 -11.5L9.9 -10.2Z"></path><g class="eyeO "><ellipse class="bgf" stroke="none" cx="9" cy="-8.7" rx="0.45" ry="0.55"></ellipse><circle cx="9.15" cy="-8.88" r="0.13" fill="currentColor" stroke="none"></circle></g><path class="bgs eyeC" stroke-width="0.4" d="M8.5 -8.6Q9 -8.2 9.5 -8.6"></path><path class="bgf" stroke="none" d="M10.95 -7.35L10.55 -7.15L10.6 -7.55Z"></path><path class="bgs" stroke-width="0.3" d="M10.6 -7.1Q10.3 -6.7 9.8 -6.8"></path><path stroke-width="0.22" opacity="0.75" d="M10.3 -7.4L12.6 -8M10.3 -7.1L12.7 -7.1M10.3 -6.8L12.5 -6.3"></path></g></g>
<path class="ltail" stroke-width="1.3" d="M-6 -0.3C-6.6 0.5 -3 0.7 1.4 0.5C3 0.45 4.6 0.2 6.2 -0.6"></path>
<path class="bgs" stroke-width="0.3" d="M-1 0.6V0.2M1.4 0.55V0.15"></path>
<g fill="currentColor" stroke="none" font-family="IBM Plex Mono, monospace" font-weight="500">
<text class="z" x="9.6" y="-6.5" font-size="2.6">z</text>
<text class="z z2" x="10.8" y="-8.4" font-size="3.1">z</text>
<text class="z z3" x="12" y="-10.6" font-size="3.6">z</text>
</g>
</g>
<g class="psc"><g class="shv">
<g opacity="0.5" stroke-width="1.25"><path d="M2.4 -5.4L2.6 0"></path><path d="M-3.6 -5L-3.8 0"></path></g>
<path stroke-width="2.8" d="M-5.2 -5.6C-6.6 -7 -6.9 -10 -6.1 -12.6"></path>
<path class="fur" stroke-width="0.8" d="M-6.8 -6.4L-8 -7.4M-7.4 -9L-8.6 -9.6M-7.3 -11.4L-8.3 -12.4M-6.4 -13.2L-6.7 -14.4M-5 -6.4L-3.9 -7.6M-4.8 -9.4L-3.8 -10.2M-5.2 -12.6L-4.4 -13.6"></path>
<path fill="currentColor" stroke="none" d="M-5.6 -4C-5.8 -8.4 -1.8 -11.2 1 -10.8C3.6 -10.4 5.2 -8 5 -4.6C3.8 -5.6 2.6 -6.2 1 -6.4C-1.4 -6.6 -3.8 -5.6 -5.6 -4Z"></path>
<path class="fur" stroke-width="0.9" d="M-5.4 -6.4L-6.4 -7.2L-4.9 -7.9L-5.3 -9.3L-3.6 -9.3L-3.4 -10.9L-1.8 -10.5L-1.1 -12L0.2 -11.1L1.6 -12.2L2.2 -10.8L3.8 -11.2L3.7 -9.8L5.3 -9.5L4.6 -8.2L6 -7.4"></path>
<path class="bgs" stroke-width="0.35" d="M-2.8 -9.8L-2.4 -9M-1 -10.4L-0.8 -9.6M0.8 -10.6L0.9 -9.8"></path>
<g stroke-width="1.25"><path d="M3.6 -4.8L3.9 -0.1Q4 0 4.6 0"></path><path d="M-4.6 -4.4L-5 -0.1Q-5 0 -4.4 0"></path></g>
<g transform="translate(-0.4 2.2)"><path fill="currentColor" stroke="none" d="M4.3 -6.9C3.9 -8.5 4.8 -9.9 6 -10.3L4.4 -11.4L7.4 -10.8C7.9 -10.9 8.4 -10.9 8.9 -10.7L8.8 -11.8L10 -9.9C10.5 -9.4 10.7 -8.8 10.6 -8.2C11.2 -8 11.4 -7.4 11 -7C10.4 -6.5 9.2 -6.2 8 -6.2C6.6 -6.2 5 -6.2 4.3 -6.9Z"></path><ellipse class="bgf" stroke="none" cx="9" cy="-8.6" rx="0.65" ry="0.8"></ellipse><ellipse cx="9.1" cy="-8.6" rx="0.16" ry="0.5" fill="currentColor" stroke="none"></ellipse><path class="bgf" stroke="none" d="M10.95 -7.35L10.55 -7.15L10.6 -7.55Z"></path><path class="bgf ymouth" stroke="none" d="M10.7 -7L11.6 -5.9L9.7 -6.3Z"></path><path class="bgs" stroke-width="0.3" d="M10.9 -6.6L10.75 -6.1"></path><path stroke-width="0.22" opacity="0.75" d="M10.3 -7.4L12.6 -8M10.3 -7.1L12.7 -7.1M10.3 -6.8L12.5 -6.3"></path></g>
</g></g>
<g class="prun">
<g class="gA">
<g opacity="0.5" stroke-width="1.2"><path d="M2.8 -5L6.6 -2"></path><path d="M-4.2 -5L-7.8 -2.2"></path></g>
<path stroke-width="1.5" d="M-6 -6L-10.4 -7.4"></path>
<path fill="currentColor" stroke="none" d="M-6 -6C-4 -7.4 0 -7.4 3.4 -7C5 -6.8 5.6 -5.8 5 -5C4 -4.6 2 -4.8 0 -4.8C-2 -4.8 -4.4 -4.6 -6 -5Z"></path>
<path class="bgs" stroke-width="0.35" d="M-2.4 -7L-2.2 -6.2M-0.8 -7.1L-0.6 -6.3"></path>
<g stroke-width="1.25"><path d="M3.6 -5L7.6 -2.6"></path><path d="M-5 -5L-8.6 -2.8"></path></g>
<g transform="translate(0.6 0.4)"><path fill="currentColor" stroke="none" d="M4.3 -6.9C3.9 -8.5 4.8 -9.9 6 -10.3L4.4 -11.4L7.4 -10.8C7.9 -10.9 8.4 -10.9 8.9 -10.7L8.8 -11.8L10 -9.9C10.5 -9.4 10.7 -8.8 10.6 -8.2C11.2 -8 11.4 -7.4 11 -7C10.4 -6.5 9.2 -6.2 8 -6.2C6.6 -6.2 5 -6.2 4.3 -6.9Z"></path><ellipse class="bgf" stroke="none" cx="9" cy="-8.6" rx="0.65" ry="0.8"></ellipse><ellipse cx="9.1" cy="-8.6" rx="0.16" ry="0.5" fill="currentColor" stroke="none"></ellipse><path class="bgf" stroke="none" d="M10.95 -7.35L10.55 -7.15L10.6 -7.55Z"></path><path class="bgs" stroke-width="0.3" d="M10.6 -7.1Q10.3 -6.7 9.8 -6.8"></path><path stroke-width="0.22" opacity="0.75" d="M10.3 -7.4L12.6 -8M10.3 -7.1L12.7 -7.1M10.3 -6.8L12.5 -6.3"></path></g>
</g>
<g class="gB">
<g opacity="0.5" stroke-width="1.2"><path d="M3.2 -4.6L1.6 0"></path><path d="M-2.8 -4.8L0 0"></path></g>
<path stroke-width="1.5" d="M-4 -5.6C-6.4 -6.6 -8 -6.4 -9.4 -7.2"></path>
<path fill="currentColor" stroke="none" d="M-4 -5C-3.6 -8.2 1.6 -8.4 3.4 -6.6C4.4 -5.6 3.8 -4.4 2.6 -4.4C0.4 -4.4 -2 -4 -4 -5Z"></path>
<g stroke-width="1.25"><path d="M2.6 -4.6L0.6 -0.2"></path><path d="M-3.6 -4.8L-1.2 -0.4"></path></g>
<g transform="translate(-1.2 1)"><path fill="currentColor" stroke="none" d="M4.3 -6.9C3.9 -8.5 4.8 -9.9 6 -10.3L4.4 -11.4L7.4 -10.8C7.9 -10.9 8.4 -10.9 8.9 -10.7L8.8 -11.8L10 -9.9C10.5 -9.4 10.7 -8.8 10.6 -8.2C11.2 -8 11.4 -7.4 11 -7C10.4 -6.5 9.2 -6.2 8 -6.2C6.6 -6.2 5 -6.2 4.3 -6.9Z"></path><ellipse class="bgf" stroke="none" cx="9" cy="-8.6" rx="0.65" ry="0.8"></ellipse><ellipse cx="9.1" cy="-8.6" rx="0.16" ry="0.5" fill="currentColor" stroke="none"></ellipse><path class="bgf" stroke="none" d="M10.95 -7.35L10.55 -7.15L10.6 -7.55Z"></path><path class="bgs" stroke-width="0.3" d="M10.6 -7.1Q10.3 -6.7 9.8 -6.8"></path><path stroke-width="0.22" opacity="0.75" d="M10.3 -7.4L12.6 -8M10.3 -7.1L12.7 -7.1M10.3 -6.8L12.5 -6.3"></path></g>
</g>
</g>
</g>
</g>`;

const OPEN_STORY = [['eyes', 1000], ['emerge', 900], ['walkOut', 1800], ['around', 1400], ['sit', 2400], ['yawn', 1300], ['stretch', 1300], ['sleep', 0]];

export class M600CatEgg {
  constructor(door, { mode = 'every3rd', storageKey = 'm600.frontDoor.openCount', onPhase = null } = {}) {
    this.door = door;
    this.mode = mode;
    this.storageKey = storageKey;
    this.onPhase = onPhase;
    this._timers = [];
    const root = door.shadowRoot;
    if (!root.getElementById('m600-cat-css')) {
      const st = document.createElement('style');
      st.id = 'm600-cat-css';
      st.textContent = CAT_CSS;
      root.appendChild(st);
    }
    door.catLayer.innerHTML = CAT_SVG;
    this.cat = door.catLayer.querySelector('.cat');
    this.phase = 'in';
    this._h = {
      opened: () => { if (this._shouldPlay()) this.play(); },
      closing: () => this.flee(),
      closed: () => this.reset()
    };
    door.addEventListener('door-opened', this._h.opened);
    door.addEventListener('door-closing', this._h.closing);
    door.addEventListener('door-closed', this._h.closed);
  }

  play() { this.door.wide = true; this._chain(OPEN_STORY); }

  flee() {
    const c = this.phase;
    if (c === 'in' || c === 'runIn') return;
    if (c === 'sleep' || c === 'wake') this._chain([['wake', 450], ['scared', 700], ['runIn', 850], ['in', 0]]);
    else if (c === 'eyes' || c === 'emerge') this._chain([['runIn', 850], ['in', 0]]);
    else this._chain([['scared', 650], ['runIn', 850], ['in', 0]]);
  }

  reset() { this._clear(); this._set('in'); this.door.wide = false; }

  destroy() {
    this.reset();
    this.door.removeEventListener('door-opened', this._h.opened);
    this.door.removeEventListener('door-closing', this._h.closing);
    this.door.removeEventListener('door-closed', this._h.closed);
    this.door.catLayer.innerHTML = '';
  }

  _shouldPlay() {
    if (this.mode === 'off') return false;
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
    let n = 0;
    try { n = parseInt(localStorage.getItem(this.storageKey) || '0', 10) + 1; localStorage.setItem(this.storageKey, String(n)); }
    catch (e) { this._n = (this._n || 0) + 1; n = this._n; }
    if (this.mode === 'always') return true;
    const every = this.mode === 'every3rd' ? 3 : Number(this.mode) || 3;
    return n % every === 0;
  }

  _set(ph) { this.phase = ph; this.cat.setAttribute('class', 'cat ph-' + ph); if (this.onPhase) this.onPhase(ph); }
  _clear() { this._timers.forEach(clearTimeout); this._timers = []; }
  _chain(steps) {
    this._clear();
    let t = 0;
    steps.forEach(([ph, ms]) => {
      if (t === 0) this._set(ph); else this._timers.push(setTimeout(() => this._set(ph), t));
      t += ms;
    });
  }
}
