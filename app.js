/* 9 Meridian customer portal interactions */
(function () {
  "use strict";

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const state = { authMode: "signin", user: null, token: "", selectedFile: null, panel: "overview" };
  const TOKEN_KEY = "9m_session";

  function getStoredToken() { return localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY) || ""; }
  function storeToken(token, remember) {
    localStorage.removeItem(TOKEN_KEY); sessionStorage.removeItem(TOKEN_KEY);
    (remember ? localStorage : sessionStorage).setItem(TOKEN_KEY, token);
    state.token = token;
  }
  function clearToken() { localStorage.removeItem(TOKEN_KEY); sessionStorage.removeItem(TOKEN_KEY); state.token = ""; }

  async function api(path, options = {}) {
    const headers = { ...(options.body ? { "Content-Type": "application/json" } : {}), ...(options.headers || {}) };
    if (state.token) headers.Authorization = `Bearer ${state.token}`;
    let response;
    try { response = await fetch(path, { ...options, headers }); }
    catch { throw new Error("The local 9 Meridian server is not reachable. Run ‘npm start’ from the project folder."); }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 401 && state.token) clearToken();
      throw new Error(data.message || "Something went wrong. Please try again.");
    }
    return data;
  }

  function toast(title, message = "", type = "success") {
    const region = $("#toastRegion");
    const item = document.createElement("div");
    item.className = `toast ${type}`;
    const icon = document.createElement("i"); icon.textContent = type === "error" ? "!" : "✓";
    const copy = document.createElement("span");
    const strong = document.createElement("b"); strong.textContent = title;
    const small = document.createElement("small"); small.textContent = message;
    copy.append(strong, small); item.append(icon, copy); region.append(item);
    window.setTimeout(() => { item.style.opacity = "0"; item.style.transform = "translateX(20px)"; window.setTimeout(() => item.remove(), 250); }, 4200);
  }

  function initials(name = "") { return name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join("").toUpperCase() || "9M"; }
  function firstName(name = "") { return name.trim().split(/\s+/)[0] || "there"; }
  function setBusy(button, busy, label) {
    button.disabled = busy; button.classList.toggle("loading", busy);
    const target = $(".submit-label", button);
    if (target) target.textContent = busy ? "Securing your workspace…" : label;
  }

  /* Landing navigation and reveal motion */
  const siteHeader = $("#siteHeader");
  window.addEventListener("scroll", () => siteHeader.classList.toggle("scrolled", scrollY > 24), { passive: true });
  $("#mobileMenu").addEventListener("click", event => {
    const open = $("#siteNav").classList.toggle("open"); event.currentTarget.setAttribute("aria-expanded", String(open));
  });
  $$("#siteNav a").forEach(link => link.addEventListener("click", () => $("#siteNav").classList.remove("open")));
  const revealObserver = new IntersectionObserver(entries => entries.forEach(entry => { if (entry.isIntersecting) { entry.target.classList.add("visible"); revealObserver.unobserve(entry.target); } }), { threshold: .13 });
  $$(".reveal:not(.visible)").forEach(el => revealObserver.observe(el));

  if (matchMedia("(pointer:fine)").matches) {
    $$('[data-tilt]').forEach(card => {
      card.addEventListener("mousemove", event => {
        const rect = card.getBoundingClientRect(); const x = (event.clientX - rect.left) / rect.width; const y = (event.clientY - rect.top) / rect.height;
        card.style.setProperty("--mx", `${x * 100}%`); card.style.setProperty("--my", `${y * 100}%`);
        card.style.transform = `rotateX(${(0.5 - y) * 5}deg) rotateY(${(x - 0.5) * 6}deg) translateY(-3px)`;
      });
      card.addEventListener("mouseleave", () => { card.style.transform = ""; });
    });
  }

  const featureData = {
    pulse: ["+18.2%", "Momentum across active work"], workspace: ["24", "Live workstreams, one clear view"],
    feedback: ["4.9/5", "Customer signal in real time"], security: ["100%", "Signed and encrypted sessions"]
  };
  $$(".feature-tab").forEach(button => button.addEventListener("click", () => {
    $$(".feature-tab").forEach(item => item.classList.remove("active")); button.classList.add("active");
    const [metric, description] = featureData[button.dataset.feature];
    $("#featureMetric").animate([{ opacity: 0, transform: "translateY(5px)" }, { opacity: 1, transform: "none" }], { duration: 280 });
    $("#featureMetric").textContent = metric; $("#featureDescription").textContent = description;
  }));

  /* Particle meridian — canvas-native, dependency free */
  function initMeridian() {
    const canvas = $("#meridianCanvas"); const context = canvas.getContext("2d");
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const points = Array.from({ length: 330 }, (_, index) => {
      const y = 1 - (index / 329) * 2; const radius = Math.sqrt(1 - y * y); const angle = Math.PI * (3 - Math.sqrt(5)) * index;
      return { x: Math.cos(angle) * radius, y, z: Math.sin(angle) * radius, seed: Math.random() };
    });
    const motes = Array.from({ length: 70 }, () => ({ x: Math.random(), y: Math.random(), size: Math.random() * 1.5 + .3, speed: Math.random() * .00016 + .00003, alpha: Math.random() * .5 + .1 }));
    let width = 0, height = 0, dpr = 1, pointerX = 0, pointerY = 0;
    function resize() { dpr = Math.min(devicePixelRatio || 1, 1.75); width = canvas.clientWidth; height = canvas.clientHeight; canvas.width = Math.max(1, width * dpr); canvas.height = Math.max(1, height * dpr); context.setTransform(dpr, 0, 0, dpr, 0, 0); if (width < 2 || height < 2) { pointerX = 0; pointerY = 0; } }
    resize(); window.addEventListener("resize", resize);
    canvas.parentElement.addEventListener("pointermove", event => { if (width > 1 && height > 1) { pointerX = event.clientX / width - .5; pointerY = event.clientY / height - .5; } }, { passive: true });
    function frame(time) {
      if (width < 2 || height < 2 || !Number.isFinite(pointerX) || !Number.isFinite(pointerY)) { pointerX = 0; pointerY = 0; if (!reduced) requestAnimationFrame(frame); return; }
      context.clearRect(0, 0, width, height);
      const mobile = width < 800; const cx = width * (mobile ? .55 : .68) + pointerX * 20; const cy = height * (mobile ? .35 : .49) + pointerY * 15; const size = Math.min(width, height) * (mobile ? .30 : .37);
      const rotation = (reduced ? .3 : time * .00011) + pointerX * .18; const tilt = -.18 + pointerY * .08; const cos = Math.cos(rotation), sin = Math.sin(rotation), cosT = Math.cos(tilt), sinT = Math.sin(tilt);
      const glow = context.createRadialGradient(cx, cy, 0, cx, cy, size * 1.2); glow.addColorStop(0, "rgba(0,240,255,.10)"); glow.addColorStop(.45, "rgba(0,114,255,.055)"); glow.addColorStop(1, "rgba(0,0,0,0)"); context.fillStyle = glow; context.fillRect(cx-size*1.3,cy-size*1.3,size*2.6,size*2.6);
      motes.forEach(mote => { mote.y -= mote.speed * 16; if (mote.y < 0) mote.y = 1; const mx = mote.x * width, my = mote.y * height; context.fillStyle = `rgba(0,210,255,${mote.alpha})`; context.fillRect(mx,my,mote.size,mote.size); });
      context.save(); context.translate(cx, cy); context.strokeStyle = "rgba(0,240,255,.14)"; context.lineWidth = .7;
      [0, .31, -.31].forEach(offset => { context.beginPath(); context.ellipse(0, offset * size, size * Math.sqrt(1-offset*offset), size * .25, rotation*.4, 0, Math.PI*2); context.stroke(); });
      [-.55, 0, .55].forEach(offset => { context.beginPath(); context.ellipse(0,0,size*.33,size,offset + rotation*.18,0,Math.PI*2); context.stroke(); });
      context.restore();
      const projected = points.map(point => { const rx = point.x * cos - point.z * sin, rz = point.x * sin + point.z * cos; const ry = point.y * cosT - rz * sinT, z = point.y * sinT + rz * cosT; const perspective = 1 + z * .16; return { x: cx + rx * size * perspective, y: cy + ry * size * perspective, z, seed: point.seed }; });
      projected.sort((a,b) => a.z-b.z).forEach(point => { const alpha = .12 + (point.z + 1) * .28; const pulse = .65 + Math.sin(time*.002 + point.seed*12)*.35; context.beginPath(); context.fillStyle = `rgba(0,${190 + Math.round(point.seed*65)},255,${alpha*pulse})`; context.arc(point.x,point.y,(point.seed*1.25+.35)*(1+point.z*.25),0,Math.PI*2); context.fill(); });
      context.save(); context.translate(cx,cy); context.rotate(rotation*.35); context.strokeStyle = "rgba(70,220,255,.35)"; context.lineWidth = 1; context.shadowColor = "#00e5ff"; context.shadowBlur = 8; context.beginPath(); context.ellipse(0,0,size*1.1,size*.19,.4,0,Math.PI*2); context.stroke(); context.restore();
      const core = context.createRadialGradient(cx,cy,0,cx,cy,size*.18); core.addColorStop(0,"rgba(210,255,255,.82)"); core.addColorStop(.15,"rgba(0,240,255,.45)"); core.addColorStop(1,"rgba(0,114,255,0)"); context.fillStyle=core; context.beginPath(); context.arc(cx,cy,size*.2,0,Math.PI*2); context.fill();
      if (!reduced) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }
  initMeridian();

  /* Auth modal */
  const authModal = $("#authModal"), authForm = $("#authForm"), authSubmit = $(".auth-submit");
  function openModal(modal) { modal.hidden = false; document.body.classList.add("modal-open"); window.setTimeout(() => $("input:not([type=hidden])", modal)?.focus(), 70); }
  function closeModal(modal) { modal.hidden = true; if ($$(".modal-backdrop:not([hidden])").length === 0) document.body.classList.remove("modal-open"); }
  function switchAuth(mode) {
    state.authMode = mode; const signup = mode === "signup";
    $$(".signup-only", authForm).forEach(el => el.hidden = !signup); $$(".signin-only", authForm).forEach(el => el.hidden = signup);
    $(".auth-tabs").classList.toggle("signup", signup); $("#signinTab").setAttribute("aria-selected", String(!signup)); $("#signupTab").setAttribute("aria-selected", String(signup));
    $("#authKicker").textContent = signup ? "Begin your meridian" : "Welcome back"; $("#authTitle").textContent = signup ? "Create your workspace." : "Enter your workspace.";
    $("#authSubtitle").textContent = signup ? "One minute to a clearer way of working." : "Use your account details to continue.";
    $(".submit-label", authSubmit).textContent = signup ? "Create account" : "Sign in securely";
    authForm.password.autocomplete = signup ? "new-password" : "current-password"; clearForm(authForm); $("#authAlert").hidden = true;
  }
  function openAuth(mode) { switchAuth(mode); openModal(authModal); }
  $$('[data-auth]').forEach(button => button.addEventListener("click", () => openAuth(button.dataset.auth)));
  $$('[data-auth-tab]').forEach(button => button.addEventListener("click", () => switchAuth(button.dataset.authTab)));
  $$('[data-close-modal]').forEach(button => button.addEventListener("click", () => closeModal(authModal)));
  authModal.addEventListener("mousedown", event => { if (event.target === authModal) closeModal(authModal); });
  document.addEventListener("keydown", event => { if (event.key === "Escape") $$(".modal-backdrop:not([hidden])").forEach(closeModal); });
  $(".password-toggle").addEventListener("click", event => { const input = authForm.password; input.type = input.type === "password" ? "text" : "password"; event.currentTarget.setAttribute("aria-label", input.type === "password" ? "Show password" : "Hide password"); });

  function passwordScore(password) { return [password.length >= 8, /[A-Z]/.test(password), /[a-z]/.test(password), /\d/.test(password), /[^A-Za-z0-9]/.test(password)].filter(Boolean).length; }
  authForm.password.addEventListener("input", () => {
    if (state.authMode !== "signup") return; const score = passwordScore(authForm.password.value); const names = ["—","Weak","Weak","Medium","Strong","Strong"];
    const colors = ["var(--bad)","var(--bad)","var(--bad)","var(--warn)","var(--cyan)","var(--good)"];
    $(".password-strength > i span").style.cssText = `width:${score*20}%;background:${colors[score]}`; $(".password-strength b").textContent = names[score];
  });
  function clearForm(form) { $$(".field",form).forEach(field => { field.classList.remove("invalid"); const err=$(".field-error",field); if(err) err.textContent=""; }); }
  function fieldError(input, message) { const field=input.closest(".field"); if(field){ field.classList.add("invalid"); const target=$(".field-error",field); if(target) target.textContent=message; } }
  function validateAuth() {
    clearForm(authForm); let valid = true; const email = authForm.email.value.trim(); const password = authForm.password.value;
    if (!/^\S+@\S+\.\S+$/.test(email)) { fieldError(authForm.email,"Enter a valid email address."); valid=false; }
    if (password.length < 8) { fieldError(authForm.password,"Password must be at least 8 characters."); valid=false; }
    if (state.authMode === "signup") {
      if (authForm.fullName.value.trim().length < 2) { fieldError(authForm.fullName,"Enter your full name."); valid=false; }
      if (passwordScore(password) < 3) { fieldError(authForm.password,"Add uppercase, lowercase, a number, or a symbol."); valid=false; }
      if (authForm.confirmPassword.value !== password) { fieldError(authForm.confirmPassword,"Passwords do not match."); valid=false; }
      if (!authForm.terms.checked) { showAuthAlert("Please agree to the terms to continue."); valid=false; }
    }
    return valid;
  }
  function showAuthAlert(message) { const alert=$("#authAlert"); alert.textContent=message; alert.hidden=false; }
  authForm.addEventListener("submit", async event => {
    event.preventDefault(); $("#authAlert").hidden=true; if(!validateAuth()) return;
    const signup=state.authMode === "signup"; const label=signup?"Create account":"Sign in securely"; setBusy(authSubmit,true,label);
    try {
      const body = signup ? { fullName:authForm.fullName.value.trim(),email:authForm.email.value.trim(),password:authForm.password.value } : { email:authForm.email.value.trim(),password:authForm.password.value };
      const result = await api(signup?"/api/auth/register":"/api/auth/login",{method:"POST",body:JSON.stringify(body)});
      storeToken(result.token, signup || authForm.remember?.checked); state.user=result.user; closeModal(authModal); showDashboard(); toast(signup?"Workspace created":"Welcome back",`${firstName(result.user.fullName)}, your Meridian is ready.`);
    } catch(error) { showAuthAlert(error.message); }
    finally { setBusy(authSubmit,false,label); }
  });
  $("#forgotPassword").addEventListener("click", async () => { const email=authForm.email.value.trim(); if(!/^\S+@\S+\.\S+$/.test(email)){fieldError(authForm.email,"Enter your email first.");return;} try{await api("/api/auth/forgot",{method:"POST",body:JSON.stringify({email})});toast("Check your inbox","If an account exists, recovery instructions are on the way.");}catch(error){showAuthAlert(error.message);} });

  async function demoLogin(button) {
    const original=button.textContent; button.disabled=true;
    try { const result=await api("/api/auth/login",{method:"POST",body:JSON.stringify({email:"demo@9meridian.com",password:"Demo@123"})}); storeToken(result.token,false); state.user=result.user; closeModal(authModal); showDashboard(); toast("Demo unlocked","Explore every customer dashboard interaction."); }
    catch(error){toast("Demo unavailable",error.message,"error");} finally{button.disabled=false;if(button.id==="demoLogin")button.innerHTML='Explore the live demo <span>→</span>';else button.textContent=original;}
  }
  $("#demoLogin").addEventListener("click", event => demoLogin(event.currentTarget)); $("#modalDemoLogin").addEventListener("click", event => demoLogin(event.currentTarget));

  /* Dashboard */
  function updateIdentity() {
    if(!state.user) return; $$('[data-user-name]').forEach(el=>el.textContent=state.user.fullName); $$('[data-user-first]').forEach(el=>el.textContent=firstName(state.user.fullName)); $$('[data-user-initials]').forEach(el=>el.textContent=initials(state.user.fullName));
    $('[data-settings-name]').value=state.user.fullName; $('[data-settings-email]').value=state.user.email;
  }
  function showDashboard() { $("#landingView").hidden=true; $("#dashboardView").hidden=false; document.body.classList.remove("modal-open"); window.scrollTo(0,0); updateIdentity(); showPanel("overview"); animateCounters(); }
  function showLanding() { $("#dashboardView").hidden=true; $("#landingView").hidden=false; $("#dashboardView").classList.remove("sidebar-open"); window.scrollTo(0,0); }
  function showPanel(name) {
    state.panel=name; $$(".dash-panel").forEach(panel=>panel.classList.toggle("active",panel.id===`${name}Panel`)); $$(".dash-nav button").forEach(button=>button.classList.toggle("active",button.dataset.panel===name)); $("#panelTitle").textContent=name[0].toUpperCase()+name.slice(1); $("#dashboardView").classList.remove("sidebar-open");
    if(name==="feedback") loadFeedback(); if(name==="overview") animateCounters();
  }
  $$('[data-panel]').forEach(button=>button.addEventListener("click",()=>showPanel(button.dataset.panel))); $$('[data-panel-jump]').forEach(button=>button.addEventListener("click",()=>showPanel(button.dataset.panelJump)));
  $$('[data-action="home"]').forEach(button=>button.addEventListener("click",event=>{event.preventDefault();showLanding();}));
  $$('[data-action="dashboard"]').forEach(button=>button.addEventListener("click",()=>state.user?showDashboard():openAuth("signin")));
  $("#dashMenu").addEventListener("click",()=>$("#dashboardView").classList.toggle("sidebar-open"));
  function animateCounters(){ $$('[data-count]').forEach(el=>{const target=Number(el.dataset.count),decimals=Number(el.dataset.decimals||0),suffix=el.dataset.suffix||"";const start=performance.now();function tick(now){const p=Math.min(1,(now-start)/800),ease=1-Math.pow(1-p,3);el.textContent=(target*ease).toFixed(decimals)+suffix;if(p<1)requestAnimationFrame(tick);}requestAnimationFrame(tick);}); }

  const confirmModal=$("#confirmModal"); $("#logoutButton").addEventListener("click",()=>openModal(confirmModal)); $('[data-cancel-logout]').addEventListener("click",()=>closeModal(confirmModal));
  $("#confirmLogout").addEventListener("click",()=>{clearToken();state.user=null;closeModal(confirmModal);showLanding();toast("Signed out","Your local session has been cleared.");});

  /* Feedback interactions */
  $$('.rating-group button').forEach(button=>{ button.setAttribute("role","radio"); button.setAttribute("aria-checked","false"); button.addEventListener("click",()=>{$$('.rating-group button').forEach(item=>{const selected=Number(item.dataset.rating)<=Number(button.dataset.rating);item.classList.toggle("selected",selected);item.setAttribute("aria-checked",String(item===button));});$("#ratingInput").value=button.dataset.rating;}); });
  $("#feedbackMessage").addEventListener("input",event=>$("#charCount").textContent=event.target.value.length);
  const dropzone=$("#dropzone"),fileInput=$("#fileInput"),preview=$("#filePreview");
  ["dragenter","dragover"].forEach(type=>dropzone.addEventListener(type,event=>{event.preventDefault();dropzone.classList.add("dragging");})); ["dragleave","drop"].forEach(type=>dropzone.addEventListener(type,event=>{event.preventDefault();dropzone.classList.remove("dragging");}));
  dropzone.addEventListener("drop",event=>selectFile(event.dataTransfer.files[0])); fileInput.addEventListener("change",()=>selectFile(fileInput.files[0]));
  function selectFile(file){$("#fileError").textContent="";if(!file)return;if(file.size>5*1024*1024){$("#fileError").textContent="File must be smaller than 5 MB.";return;}const valid=file.type.startsWith("image/")||["application/pdf","text/plain"].includes(file.type);if(!valid){$("#fileError").textContent="Choose a PNG, JPG, PDF, or TXT file.";return;}state.selectedFile=file;preview.hidden=false;preview.replaceChildren();const icon=document.createElement("i");icon.textContent=file.type.startsWith("image/")?"▧":"▤";const copy=document.createElement("span");const name=document.createElement("b");name.textContent=file.name;const size=document.createElement("small");size.textContent=`${(file.size/1024).toFixed(file.size>1024*1024?0:1)} KB`;copy.append(name,size);const remove=document.createElement("button");remove.type="button";remove.textContent="×";remove.setAttribute("aria-label","Remove attachment");remove.addEventListener("click",clearFile);preview.append(icon,copy,remove);dropzone.hidden=true;}
  function clearFile(){state.selectedFile=null;fileInput.value="";preview.hidden=true;dropzone.hidden=false;}
  $("#feedbackForm").addEventListener("submit",async event=>{event.preventDefault();const form=event.currentTarget;clearForm(form);let valid=true;const values=Object.fromEntries(new FormData(form));if(!values.rating){toast("Choose a rating","Select the response that best fits your experience.","error");valid=false;}[[form.category,"Choose a feedback category."],[form.subject,"Add a short subject."],[form.message,"Tell us a little more."]].forEach(([input,message])=>{if(!input.value.trim()){fieldError(input,message);valid=false;}});if(!valid)return;const button=$("#submitFeedback"),label=button.innerHTML;button.disabled=true;button.innerHTML='Submitting <i class="spinner" style="display:block"></i>';try{await api("/api/feedback",{method:"POST",body:JSON.stringify({rating:Number(values.rating),category:values.category,subject:values.subject.trim(),message:values.message.trim(),attachment:state.selectedFile?{name:state.selectedFile.name,size:state.selectedFile.size,type:state.selectedFile.type}:null})});form.reset();$("#ratingInput").value="";$$('.rating-group button').forEach(item=>item.classList.remove("selected"));$("#charCount").textContent="0";clearFile();toast("Feedback submitted","Thank you—your signal is now with our product team.");await loadFeedback();}catch(error){toast("Could not submit",error.message,"error");}finally{button.disabled=false;button.innerHTML=label;}});
  async function loadFeedback(){const history=$("#feedbackHistory");history.setAttribute("aria-busy","true");try{const result=await api("/api/feedback");history.replaceChildren();if(!result.feedback.length){const empty=document.createElement("div");empty.className="history-empty";empty.innerHTML="<i>◇</i><p>No feedback yet.</p><small>Your submissions will appear here.</small>";history.append(empty);}else result.feedback.forEach(item=>history.append(feedbackItem(item)));}catch(error){history.replaceChildren();const empty=document.createElement("div");empty.className="history-empty";const p=document.createElement("p");p.textContent="Could not load feedback.";const small=document.createElement("small");small.textContent=error.message;empty.append(p,small);history.append(empty);}finally{history.removeAttribute("aria-busy");}}
  function feedbackItem(item){const article=document.createElement("article");article.className="history-item";const top=document.createElement("div");top.className="history-top";const subject=document.createElement("b");subject.textContent=item.subject;const status=document.createElement("span");status.className=item.status.toLowerCase().replace(/\s+/g,"-");status.textContent=item.status;top.append(subject,status);const message=document.createElement("p");message.textContent=item.message;const meta=document.createElement("div");meta.className="history-meta";const stars=document.createElement("i");stars.textContent="★".repeat(item.rating)+"☆".repeat(5-item.rating);const text=document.createElement("span");text.textContent=`${item.category} · ${new Date(item.createdAt).toLocaleDateString(undefined,{month:"short",day:"numeric"})}`;meta.append(stars,text);article.append(top,message,meta);return article;}
  $("#refreshFeedback").addEventListener("click",loadFeedback);
  $("#settingsForm").addEventListener("submit",async event=>{event.preventDefault();const button=$("button[type=submit]",event.currentTarget);button.disabled=true;try{const result=await api("/api/auth/profile",{method:"PATCH",body:JSON.stringify({fullName:event.currentTarget.fullName.value.trim()})});state.user=result.user;updateIdentity();toast("Preferences saved","Your workspace profile is up to date.");}catch(error){toast("Could not save",error.message,"error");}finally{button.disabled=false;}});

  async function restoreSession(){state.token=getStoredToken();if(!state.token)return;try{const result=await api("/api/auth/me");state.user=result.user;updateIdentity();}catch{clearToken();}}
  restoreSession();
})();
