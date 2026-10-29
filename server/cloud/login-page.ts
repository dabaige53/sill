import { copy } from "../../design-system/copy.ts";
import tokens from "../../design-system/tokens.json" with { type: "json" };
import { authStyles } from "./auth-page.ts";

// Login-only styles keep consent and callback pages unchanged.
const loginStyles = `
body:has(>.login-page){min-height:100svh;min-height:100dvh;align-items:center}
.login-page{padding-top:max(var(--space-24),env(safe-area-inset-top));padding-bottom:max(var(--space-24),env(safe-area-inset-bottom))}
.login-page h1{margin:var(--space-20) 0 var(--space-24)}
.login-page form{display:grid;gap:var(--space-16)}
.login-page .auth-field{position:relative;min-width:0}
.login-page .auth-field input{margin:0;height:calc(var(--space-48) + var(--space-8));padding:var(--space-24) var(--space-16) var(--space-4);font-size:var(--text-input);background:var(--surface);transition:border-color ${tokens.motion.detailFade}ms ease,background-color ${tokens.motion.detailFade}ms ease}
.login-page .auth-field label{position:absolute;left:var(--space-16);top:var(--space-16);max-width:calc(100% - var(--space-32));color:var(--muted);font-size:var(--text-input);font-weight:400;line-height:1.5;transform-origin:left top;pointer-events:none;transition:transform ${tokens.motion.detailFade}ms cubic-bezier(0.23,1,0.32,1),color ${tokens.motion.detailFade}ms ease}
.login-page .auth-field input:focus~label,.login-page .auth-field input:not(:placeholder-shown)~label,.login-page .auth-field input:autofill~label{transform:translateY(calc(-1 * var(--space-8))) scale(.75)}
.login-page .auth-field input:focus{border-color:var(--accent);background:var(--card)}
.login-page .auth-field input:focus~label{color:var(--accent)}
.login-page .password-wrap input{padding-right:var(--space-64)}
.login-page .password-wrap label{max-width:calc(100% - var(--space-64) - var(--space-16))}
.login-page .reveal{top:var(--space-6);right:var(--space-4);color:var(--muted);display:grid;place-items:center}
.login-page .reveal svg{grid-area:1/1;width:var(--space-20);height:var(--space-20);transition:opacity ${tokens.motion.detailFade}ms ease,transform ${tokens.motion.detailFade}ms cubic-bezier(0.23,1,0.32,1)}
.login-page .reveal .eye-off{opacity:0;transform:scale(.9)}
.login-page .reveal[aria-pressed=true] .eye-on{opacity:0;transform:scale(.9)}
.login-page .reveal[aria-pressed=true] .eye-off{opacity:1;transform:scale(1)}
.login-page button{transition:transform ${tokens.motion.detailFade}ms cubic-bezier(0.23,1,0.32,1),opacity ${tokens.motion.detailFade}ms ease}
.login-page button:active:not(:disabled){opacity:1;transform:scale(${tokens.motion.pressScale})}
.login-page form>button[type=submit]{display:flex;align-items:center;justify-content:center;gap:var(--space-8);min-height:var(--space-48);margin-top:var(--space-8)}
.login-page form[aria-busy=true]>button[type=submit]{opacity:1;cursor:wait}
.login-page form[aria-busy=true]>button[type=submit]::before{content:"";width:var(--space-16);height:var(--space-16);border:2px solid currentColor;border-right-color:transparent;border-radius:var(--pill-radius);animation:login-spin .8s linear infinite}
.login-page #status{display:block;min-height:var(--space-24);margin:var(--space-16) 0 0;text-align:left}
.login-page #status:empty{visibility:hidden}
@keyframes login-spin{to{transform:rotate(360deg)}}
@media(hover:hover) and (pointer:fine){.login-page .reveal:hover{color:var(--ink)}}
@media(prefers-reduced-motion:reduce){.login-page button,.login-page .auth-field label,.login-page .reveal svg{transition:none}.login-page form[aria-busy=true]>button[type=submit]::before{animation:none}}
`;
// Lucide Eye / EyeOff paths, ISC license; decorative copies share one accessible button.
const passwordGlyphs = `<svg class="eye-on" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/></svg><svg class="eye-off" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m2 2 20 20M10.58 10.587a2 2 0 0 0 2.828 2.83M9.88 5.09A10.94 10.94 0 0 1 12 4.9c4.418 0 8.2 2.7 10 7.1a13.5 13.5 0 0 1-3.23 4.54M6.61 6.61A13.53 13.53 0 0 0 2 12c1.8 4.4 5.582 7.1 10 7.1a10.9 10.9 0 0 0 5.39-1.49"/></svg>`;

// @design auth-login
export function loginPage({
	setup = false,
	failed = false,
	authorizing = false,
	returnLocation = "/",
	emailEnabled = false,
}: {
	setup?: boolean;
	failed?: boolean;
	authorizing?: boolean;
	returnLocation?: string;
	emailEnabled?: boolean;
} = {}) {
	return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><link rel="icon" type="image/png" sizes="256x256" href="/assets/sill-icon.png"><link rel="manifest" href="/manifest.webmanifest"><link rel="apple-touch-icon" sizes="256x256" href="/assets/sill-icon.png"><meta name="mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-title" content="Sill"><meta name="apple-mobile-web-app-status-bar-style" content="black-translucent"><meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)"><meta name="theme-color" content="#1c1c1f" media="(prefers-color-scheme: dark)"><title>Sill · ${copy(setup ? "server.loginpage.0139e54b9887" : "server.loginpage.1e2df9c3075a")}</title><style>${authStyles}${loginStyles}</style><main class="login-page"><img class="auth-logo" src="/assets/sill-icon.png" alt=""><h1 id="title" tabindex="-1">${copy(setup ? "server.loginpage.53ae50023ff4" : "auth.loginTitle")}</h1>${authorizing ? `<p class="auth-context">${copy("server.loginpage.a855357eeff0")}</p>` : ""}<form id="password-form">${setup ? "" : `<div class="auth-field"><input id="email" name="email" type="email" autocomplete="username" autocapitalize="none" spellcheck="false" placeholder=" " maxlength="254" required><label for="email">${copy("server.loginpage.73075237fd0f")}</label></div>`}<div class="auth-field password-wrap"><input id="password" name="password" type="password" autocomplete="${setup ? "new-password" : "current-password"}" ${setup ? 'minlength="12"' : ""} maxlength="256" placeholder=" " required><label for="password">${copy(setup ? "server.loginpage.566f6ab7157d" : "server.loginpage.a621ab606db2")}</label><button type="button" id="reveal" class="reveal" aria-label="${copy("auth.showPassword")}" aria-pressed="false">${passwordGlyphs}</button></div><button type="submit">${copy(setup ? "server.loginpage.68084c3895c1" : "server.loginpage.a4e09c4c209d")}</button></form>${setup || !emailEnabled ? "" : `<div id="alternate" class="login-links"><button type="button" class="text-button" id="forgot">${copy("auth.forgotPassword")}</button><button type="button" id="email-login" class="text-button">${copy("auth.emailLogin")}</button></div><form id="email-form" hidden><div id="email-address" class="auth-field"><input id="backup-email" name="email" type="email" autocomplete="email" autocapitalize="none" spellcheck="false" placeholder=" " maxlength="254" required><label for="backup-email">${copy("server.loginpage.73075237fd0f")}</label></div><button type="submit" id="email-submit">${copy("auth.sendLogin")}</button></form><button type="button" id="back" class="text-button back" hidden>${copy("auth.backPassword")}</button>`}<p id="status" role="status" aria-live="polite" aria-atomic="true">${failed ? copy("server.loginpage.10b3b4e93036") : ""}</p></main><script>
 const $=id=>document.getElementById(id),status=$('status');let mode='password',busy=false,waiting=false,checking=false,continued=false;
 // The original tab owns continuation. A cross-tab signal is only a hint; the server session is authoritative.
 async function continueLogin(){if(!waiting||checking||continued)return;checking=true;try{const response=await fetch('/auth/session',{cache:'no-store'});if(response.ok){continued=true;location.assign(${JSON.stringify(returnLocation).replace(/</g, "\\u003c")});}}catch{}finally{checking=false;}}
 let loginChannel;try{loginChannel=new BroadcastChannel('sill-auth');loginChannel.onmessage=event=>{if(event.data==='session-changed')void continueLogin();};}catch{}
 window.addEventListener('focus',continueLogin);window.addEventListener('pageshow',continueLogin);document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')void continueLogin();});
 function show(next){if(busy)return;waiting=false;mode=next;$('email-address').hidden=false;const password=next==='password';$('password-form').hidden=!password;$('alternate').hidden=!password;$('email-form').hidden=password;$('back').hidden=password;$('title').textContent=password?${JSON.stringify(copy("auth.loginTitle"))}:next==='reset'?${JSON.stringify(copy("auth.resetTitle"))}:${JSON.stringify(copy("auth.emailLogin"))};$('email-submit').textContent=next==='reset'?${JSON.stringify(copy("auth.sendReset"))}:${JSON.stringify(copy("auth.sendLogin"))};if(!password)$('backup-email').value=$('email').value;else $('email').value=$('backup-email').value;status.textContent='';$('title').focus();}
 $('reveal').onclick=()=>{const visible=$('password').type==='password';$('password').type=visible?'text':'password';$('reveal').setAttribute('aria-pressed',String(visible));$('reveal').setAttribute('aria-label',visible?${JSON.stringify(copy("auth.hidePassword"))}:${JSON.stringify(copy("auth.showPassword"))});};
 $('email-login')?.addEventListener('click',()=>show('email'));$('forgot')?.addEventListener('click',()=>show('reset'));$('back')?.addEventListener('click',()=>show('password'));
 async function submit(event,path,extra={}){event.preventDefault();if(busy)return;const form=event.target,button=form.querySelector('button[type=submit]'),idleLabel=button.textContent,processing=${JSON.stringify(copy("login.processing"))};busy=true;button.textContent=processing;form.setAttribute('aria-busy','true');button.disabled=true;status.textContent=${JSON.stringify(copy("login.processing"))};try{const response=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...Object.fromEntries(new FormData(form)),...extra})});const data=await response.json();if(!response.ok){status.textContent=response.status===429?${JSON.stringify(copy("login.rateLimited"))}:response.status===401?${JSON.stringify(copy("login.unauthenticated"))}:response.status===403?${JSON.stringify(copy("login.forbidden"))}:${JSON.stringify(copy("login.unavailable"))};return;}if(data.location){location.assign(data.location);return;}status.textContent=data.message;if(form.id==='email-form'){waiting=mode==='email';$('email-address').hidden=true;$('title').textContent=${JSON.stringify(copy("auth.checkEmail"))};$('email-submit').textContent=${JSON.stringify(copy("auth.resendEmail"))};}$('password').value='';}catch{status.textContent=${JSON.stringify(copy("login.network"))};}finally{busy=false;button.disabled=false;if(button.textContent===processing)button.textContent=idleLabel;form.removeAttribute('aria-busy');}}
 $('password-form').addEventListener('submit',e=>submit(e,'${setup ? "/auth/password/update" : "/auth/password"}'));
 $('email-form')?.addEventListener('submit',e=>submit(e,'/auth/login',{setupPassword:mode==='reset'}));
 </script></html>`;
}
