// ============ state ============
let me = null;   // current user {name, email, photo}
let data = null; // {tasks, reminders, friends, notes, sessions, goalMin, exams}

// ============ helpers ============
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const rawLoad = (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } };
const rawSave = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
const dayKey = (d = new Date()) => {
  const x = new Date(d); x.setMinutes(x.getMinutes() - x.getTimezoneOffset());
  return x.toISOString().slice(0, 10);
};
const daysAgo = (n) => new Date(Date.now() - n * 864e5);
const p2 = (n) => String(n).padStart(2, "0");
function toast(msg) {
  const t = $("#toast"); t.textContent = msg; t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2500);
}
function beep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [0, 0.3, 0.6].forEach((d) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = 880; o.connect(g); g.connect(ctx.destination);
      g.gain.setValueAtTime(0.2, ctx.currentTime + d);
      o.start(ctx.currentTime + d); o.stop(ctx.currentTime + d + 0.2);
    });
  } catch {}
}
function notify(title, body) {
  beep(); toast(body);
  if ("Notification" in window && Notification.permission === "granted") new Notification(title, { body });
}
function fmtDur(sec) {
  const m = Math.round(sec / 60);
  if (m < 60) return m + "m";
  const h = Math.floor(m / 60), r = m % 60;
  return r ? `${h}h ${r}m` : `${h}h`;
}

// ============ theme + colour scheme ============
function refreshViews() { if (!data) return; renderChart(); renderHome(); }
function applyTheme(t) {
  document.documentElement.setAttribute("data-theme", t);
  rawSave("theme", t);
  $$("[data-theme-toggle]").forEach((b) => {
    b.textContent = t === "dark" ? "☀️" : "🌙";
    b.setAttribute("title", t === "dark" ? "Switch to light" : "Switch to dark");
  });
  refreshViews();
}
function applyHouse(h) {
  document.documentElement.setAttribute("data-house", h);
  rawSave("house", h);
  $$(".swatch").forEach((s) => s.classList.toggle("active", s.dataset.house === h));
  refreshViews();
}
$$("[data-theme-toggle]").forEach((b) => b.addEventListener("click", () => {
  applyTheme(document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark");
}));
$$(".swatch").forEach((s) => s.addEventListener("click", () => applyHouse(s.dataset.house)));
applyTheme(document.documentElement.getAttribute("data-theme") || "dark");
applyHouse(document.documentElement.getAttribute("data-house") || "crimson");

// ============ auth (demo: browser-only) ============
async function hashPass(p) {
  try {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("study-app:" + p));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    let h = 0; for (const c of "study-app:" + p) h = (h * 31 + c.charCodeAt(0)) | 0; return "x" + h;
  }
}
const users = () => rawLoad("users", {});

function resizePhoto(file) {
  return new Promise((resolve) => {
    if (!file) return resolve(null);
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      const s = 128, c = document.createElement("canvas"); c.width = c.height = s;
      const side = Math.min(img.width, img.height);
      c.getContext("2d").drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, s, s);
      URL.revokeObjectURL(url); resolve(c.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}
const authMsg = (m) => ($("#authMsg").textContent = m || "");
function showAuthTab(login) {
  $("#loginForm").hidden = !login; $("#signupForm").hidden = login;
  $("#showLogin").classList.toggle("active", login); $("#showSignup").classList.toggle("active", !login);
  authMsg("");
}
$("#showLogin").onclick = () => showAuthTab(true);
$("#showSignup").onclick = () => showAuthTab(false);

$("#signupForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = $("#signEmail").value.trim().toLowerCase(), all = users();
  if (all[email]) return authMsg("An account with this email already exists. Log in instead.");
  const photo = await resizePhoto($("#signPhoto").files[0]);
  all[email] = { name: $("#signName").value.trim(), email, pass: await hashPass($("#signPass").value), photo };
  rawSave("users", all); rawSave("session", email);
  startApp(email);
});
$("#loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = $("#loginEmail").value.trim().toLowerCase(), u = users()[email];
  if (!u || u.pass !== (await hashPass($("#loginPass").value))) return authMsg("Wrong email or password.");
  rawSave("session", email); startApp(email);
});
$("#logoutBtn").onclick = () => { rawSave("session", null); location.reload(); };

// ============ per-user data ============
const dkey = () => "data:" + me.email;
const persist = () => rawSave(dkey(), data);

function seedData() {
  const mk = (n, f) => { const o = []; for (let i = 0; i < n; i++) if (f(i)) o.push(dayKey(daysAgo(i))); return o; };
  const sessions = [];
  const addSess = (task, f) => { for (let i = 0; i < 30; i++) { const m = f(i); if (m) sessions.push({ date: dayKey(daysAgo(i)), task, sec: m * 60 }); } };
  addSess(1, (i) => (i < 9 || i === 12 || i === 13 ? 40 + ((i * 17) % 50) : 0));
  addSess(2, (i) => (i % 3 === 0 ? 25 + ((i * 11) % 35) : 0));
  const inDays = (n) => dayKey(new Date(Date.now() + n * 864e5));
  return {
    tasks: [
      { id: 1, name: "DSA", days: mk(84, (i) => i < 9 || i === 12 || i === 13 || (i > 20 && i % 4 === 0)) },
      { id: 2, name: "Physics", days: mk(84, (i) => i % 3 === 0) },
    ],
    reminders: [],
    friends: [
      { name: "Aarav", email: "aarav@example.com", online: true },
      { name: "Meera", email: "meera@example.com", online: true },
      { name: "Rohan", email: "rohan@example.com", online: false },
    ],
    notes: [
      { id: 1, text: "Revise graphs before Friday", color: 0 },
      { id: 2, text: "Ask Meera for physics notes", color: 1 },
    ],
    sessions, goalMin: 180,
    exams: [{ id: 1, name: "Mid-sem: Physics", date: inDays(18) }],
  };
}
const emptyData = () => ({ tasks: [], reminders: [], friends: [], notes: [], sessions: [], goalMin: 180, exams: [] });
function ensureData(d) { // older saved accounts may lack newer fields
  d.goalMin = d.goalMin || 180; d.exams = d.exams || []; d.notes = d.notes || []; d.sessions = d.sessions || [];
  return d;
}

// ============ tabs ============
function goTab(name) {
  $$(".tab").forEach((x) => x.classList.toggle("active", x.dataset.tab === name));
  $$(".panel").forEach((x) => x.classList.toggle("active", x.id === name));
  if (name === "insights") renderChart();
  if (name === "home") renderHome();
}
$$(".tab").forEach((b) => b.addEventListener("click", () => goTab(b.dataset.tab)));

$(".top .brand").onclick = () => goTab("home");

// ============ profile ============
function avatarHTML(u) { return u.photo ? `<img src="${u.photo}" alt="">` : esc((u.name || "?")[0].toUpperCase()); }
function renderProfile() {
  $("#avatarBtn").innerHTML = avatarHTML(me);
  $("#menuAvatar").innerHTML = avatarHTML(me);
  $("#menuName").textContent = me.name; $("#menuEmail").textContent = me.email;
}
$("#avatarBtn").onclick = (e) => { e.stopPropagation(); $("#menu").hidden = !$("#menu").hidden; };
document.addEventListener("click", (e) => { if (!e.target.closest(".profile")) $("#menu").hidden = true; });
function saveMe() { const all = users(); all[me.email] = { ...all[me.email], ...me }; rawSave("users", all); renderProfile(); renderFriends(); }
$("#photoInput").addEventListener("change", async (e) => {
  const p = await resizePhoto(e.target.files[0]); if (p) { me.photo = p; saveMe(); toast("Photo updated"); }
});
$("#removePhoto").onclick = () => { me.photo = null; saveMe(); };
$("#clearData").onclick = () => {
  if (!confirm("Remove all tasks, streaks, notes and study time for this account?")) return;
  data = emptyData(); persist(); renderAll(); toast("Cleared");
};

// ============ tasks & streaks ============
const nextId = (arr) => Math.max(0, ...arr.map((x) => x.id)) + 1;
function streakOf(t) {
  const set = new Set(t.days); let n = 0; const d = new Date();
  if (!set.has(dayKey(d))) d.setDate(d.getDate() - 1);
  while (set.has(dayKey(d))) { n++; d.setDate(d.getDate() - 1); }
  return n;
}
function levelFor(t, date) {
  const set = new Set(t.days); if (!set.has(dayKey(date))) return 0;
  let n = 0; const d = new Date(date);
  while (set.has(dayKey(d))) { n++; d.setDate(d.getDate() - 1); }
  return n >= 7 ? 4 : n >= 4 ? 3 : n >= 2 ? 2 : 1;
}
function setDone(id, done) {
  const t = data.tasks.find((x) => x.id === id); if (!t) return; const k = dayKey();
  t.days = t.days.filter((d) => d !== k); if (done) t.days.push(k);
  persist(); renderTasks(); renderHome();
}
function renderTasks() {
  const box = $("#taskList"); box.innerHTML = "";
  if (!data.tasks.length) box.innerHTML = '<p class="muted">No tasks yet. Add your first one above.</p>';
  data.tasks.forEach((t) => {
    const done = t.days.includes(dayKey()); let cells = "";
    for (let i = 27; i >= 0; i--) {
      const d = daysAgo(i);
      cells += `<span class="cell l${levelFor(t, d)}${i === 0 ? " today" : ""}" title="${dayKey(d)}"></span>`;
    }
    const el = document.createElement("div"); el.className = "task";
    el.innerHTML = `<div class="task-head">
      <div><span class="task-name">${esc(t.name)}</span><div class="badge">🔥 ${streakOf(t)} day streak</div></div>
      <div class="task-actions">
        <button data-done="${t.id}" ${done ? "disabled" : ""}>${done ? "Done today ✓" : "Mark done"}</button>
        <button data-del="${t.id}" aria-label="Delete task">✕</button>
      </div></div><div class="grid">${cells}</div>`;
    box.appendChild(el);
  });
  $$("[data-done]").forEach((b) => (b.onclick = () => setDone(+b.dataset.done, true)));
  $$("[data-del]").forEach((b) => (b.onclick = () => {
    data.tasks = data.tasks.filter((t) => t.id !== +b.dataset.del); persist(); renderTasks(); renderHome(); fillTaskSelect();
  }));
}
$("#taskForm").addEventListener("submit", (e) => {
  e.preventDefault();
  data.tasks.push({ id: nextId(data.tasks), name: $("#taskName").value.trim(), days: [] });
  persist(); $("#taskName").value = ""; renderTasks(); renderHome(); fillTaskSelect();
});
function fillTaskSelect() {
  $("#timerTask").innerHTML = '<option value="">No task (just a timer)</option>' +
    data.tasks.map((t) => `<option value="${t.id}">${esc(t.name)}</option>`).join("");
}

// ============ home ============
const secOn = (key) => data.sessions.filter((s) => s.date === key).reduce((a, s) => a + s.sec, 0);

function renderHome() {
  if (!data || !me) return;
  const h = new Date().getHours();
  $("#greeting").textContent = `Good ${h < 12 ? "morning" : h < 17 ? "afternoon" : "evening"}, ${me.name.split(" ")[0]}`;
  $("#today").textContent = new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });

  // today's tasks
  const ul = $("#todayTasks"); ul.innerHTML = "";
  $("#todayEmpty").hidden = data.tasks.length > 0;
  data.tasks.forEach((t) => {
    const done = t.days.includes(dayKey());
    const li = document.createElement("li"); if (done) li.className = "done";
    li.innerHTML = `<input type="checkbox" id="tt${t.id}" ${done ? "checked" : ""}><label for="tt${t.id}"><span>${esc(t.name)}</span></label>`;
    li.querySelector("input").onchange = (e) => setDone(t.id, e.target.checked);
    ul.appendChild(li);
  });

  // streak summary
  const withStreak = data.tasks.map((t) => ({ t, s: streakOf(t) }));
  const best = withStreak.slice().sort((a, b) => b.s - a.s)[0];
  const risk = withStreak.filter((x) => x.s > 0 && !x.t.days.includes(dayKey()));
  $("#streakSummary").innerHTML = best
    ? `<div class="streak-big">🔥 ${best.s}</div><div class="muted tiny" style="margin-bottom:10px">Best streak: ${esc(best.t.name)}</div>` +
      (risk.length ? `<div class="muted tiny">At risk today:</div>` + risk.map((x) => `<span class="chip warn">${esc(x.t.name)} · ${x.s}d</span>`).join("")
                   : `<div class="muted tiny">Nothing at risk today.</div>`)
    : '<p class="muted">Add a task to start a streak.</p>';

  renderGoal(); renderWeek(); renderHeat(); renderExams(); renderNextRem();
}

// daily goal ring
function renderGoal() {
  const goal = data.goalMin * 60, done = secOn(dayKey()), pct = Math.min(1, done / goal);
  $("#goalFg").style.strokeDashoffset = 276.5 * (1 - pct);
  $("#goalDone").textContent = fmtDur(done);
  $("#goalOf").textContent = done >= goal ? "Goal reached ✓" : "of " + fmtDur(goal);
  if (document.activeElement !== $("#goalInput")) $("#goalInput").value = data.goalMin;
}
$("#goalInput").addEventListener("change", (e) => {
  const v = Math.max(15, Math.min(1440, +e.target.value || 180)); data.goalMin = v; persist(); renderGoal();
});

// this week mini chart
function renderWeek() {
  const vals = []; for (let i = 6; i >= 0; i--) { const d = daysAgo(i); vals.push({ d, sec: secOn(dayKey(d)), today: i === 0 }); }
  const max = Math.max(...vals.map((v) => v.sec), 1), total = vals.reduce((a, v) => a + v.sec, 0);
  $("#weekBars").innerHTML = vals.map((v) => `<div class="col" title="${dayKey(v.d)}: ${fmtDur(v.sec)}">
    <div class="bar ${v.sec ? "" : "zero"} ${v.today ? "today" : ""}" style="height:${v.sec ? Math.max(6, (v.sec / max) * 100) : 3}%"></div>
    <span class="lbl">${v.d.toLocaleDateString(undefined, { weekday: "narrow" })}</span></div>`).join("");
  $("#weekTotal").textContent = total ? `${fmtDur(total)} this week · ${fmtDur(total / 7)} a day` : "No focus time logged this week yet.";
}

// 12-week heatmap of tasks completed per day
function renderHeat() {
  const today = new Date(); today.setHours(12, 0, 0, 0);
  const start = new Date(today); start.setDate(start.getDate() - start.getDay() - 77); // Sunday, 11 weeks back
  const n = data.tasks.length; let html = "";
  for (let i = 0; i < 84; i++) {
    const d = new Date(start); d.setDate(start.getDate() + i);
    if (d > today) { html += '<span class="cell fut"></span>'; continue; }
    const k = dayKey(d), c = data.tasks.filter((t) => t.days.includes(k)).length, r = n ? c / n : 0;
    const lvl = !c ? 0 : r <= 0.25 ? 1 : r <= 0.5 ? 2 : r <= 0.75 ? 3 : 4;
    html += `<span class="cell l${lvl}${k === dayKey() ? " today" : ""}" title="${k}: ${c}/${n} tasks"></span>`;
  }
  $("#heat").innerHTML = html;
}

// exam countdown
function renderExams() {
  const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);
  const list = data.exams.map((e) => ({ ...e, left: Math.round((new Date(e.date + "T00:00") - startOfToday) / 864e5) }))
    .filter((e) => e.left >= 0).sort((a, b) => a.left - b.left).slice(0, 3);
  $("#examList").innerHTML = list.length ? list.map((e, i) => `<div class="exam ${i === 0 ? "first" : ""}">
      <div><div class="name">${esc(e.name)}</div><div class="muted tiny">${new Date(e.date + "T00:00").toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}</div></div>
      <div style="display:flex;align-items:center;gap:6px"><div class="n">${e.left === 0 ? "Today" : e.left + (e.left === 1 ? " day" : " days")}</div>
      <button data-exam-del="${e.id}" aria-label="Remove exam">✕</button></div></div>`).join("")
    : '<p class="muted">No upcoming exams. Add one below.</p>';
  $$("[data-exam-del]").forEach((b) => (b.onclick = () => { data.exams = data.exams.filter((e) => e.id !== +b.dataset.examDel); persist(); renderExams(); }));
}
$("#examForm").addEventListener("submit", (e) => {
  e.preventDefault();
  data.exams.push({ id: nextId(data.exams), name: $("#examName").value.trim(), date: $("#examDate").value });
  persist(); $("#examName").value = ""; $("#examDate").value = ""; renderExams();
});

// next reminder
function renderNextRem() {
  const next = data.reminders.filter((r) => !r.fired && new Date(r.time) > new Date())
    .sort((a, b) => a.time.localeCompare(b.time))[0];
  if (!next) { $("#nextRem").innerHTML = '<p class="muted">No upcoming reminders.</p>'; return; }
  const s = Math.max(0, Math.floor((new Date(next.time) - new Date()) / 1000));
  const d = Math.floor(s / 86400), hh = Math.floor((s % 86400) / 3600), mm = Math.floor((s % 3600) / 60), ss = s % 60;
  $("#nextRem").innerHTML = `<div class="muted">${esc(next.text)}</div>
    <div class="when">${d ? d + "d " : ""}${p2(hh)}:${p2(mm)}:${p2(ss)}</div>
    <div class="muted tiny">${new Date(next.time).toLocaleString()}</div>`;
}
$("#quickStart").onclick = () => { goTab("timer"); $("#startBtn").click(); };

// sticky notes
function renderNotes() {
  const box = $("#notes"); box.innerHTML = "";
  data.notes.forEach((n) => {
    const el = document.createElement("div"); el.className = "note c" + n.color;
    el.style.setProperty("--rot", ((n.id * 37) % 5) - 2 + "deg");
    el.innerHTML = `<button class="del" aria-label="Delete note">✕</button><textarea maxlength="160" placeholder="Write something..."></textarea>`;
    const ta = el.querySelector("textarea"); ta.value = n.text;
    ta.oninput = () => { n.text = ta.value; persist(); };
    el.querySelector(".del").onclick = () => { data.notes = data.notes.filter((x) => x.id !== n.id); persist(); renderNotes(); };
    box.appendChild(el);
  });
}
$("#addNote").onclick = () => {
  data.notes.push({ id: nextId(data.notes), text: "", color: data.notes.length % 5 }); persist(); renderNotes();
  const tas = $$(".note textarea"); tas[tas.length - 1].focus();
};

// ============ timer ============
let total = 0, left = 0, handle = null, elapsed = 0;
const C = 553;
function fmt(s) { const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return (h ? p2(h) + ":" : "") + p2(m) + ":" + p2(s % 60); }
function draw() { $("#display").textContent = fmt(left); $("#ringFg").style.strokeDashoffset = total ? C * (1 - left / total) : 0; }
function readInputs() { total = left = (+$("#hours").value || 0) * 3600 + (+$("#minutes").value || 0) * 60; draw(); }
function logSession() {
  if (elapsed >= 10) data.sessions.push({ date: dayKey(), task: +$("#timerTask").value || 0, sec: elapsed });
  elapsed = 0; persist();
}
function stopTimer() { clearInterval(handle); handle = null; logSession(); }
$("#startBtn").onclick = () => {
  if (handle) return;
  if (!left) readInputs();
  if (!left) return toast("Set some time first");
  handle = setInterval(() => {
    left--; elapsed++; draw();
    if (left <= 0) {
      stopTimer();
      const id = +$("#timerTask").value; if (id) setDone(id, true);
      notify("Daybook", "Time is up! 🎉");
    }
  }, 1000);
};
$("#pauseBtn").onclick = () => { if (handle) stopTimer(); };
$("#resetBtn").onclick = () => { if (handle) stopTimer(); readInputs(); };
["#hours", "#minutes"].forEach((s) => $(s).addEventListener("input", () => { if (!handle) readInputs(); }));

// ============ insights (SVG bar chart) ============
let range = 7;
function palette() {
  const cs = getComputedStyle(document.documentElement);
  return [cs.getPropertyValue("--accent").trim(), cs.getPropertyValue("--accent2").trim(), "#4fb3c8", "#c77dba", "#7fb77e", "#d98a5b", "#8aa0e0"];
}
$$("[data-range]").forEach((b) => b.addEventListener("click", () => {
  range = +b.dataset.range; $$("[data-range]").forEach((x) => x.classList.toggle("active", x === b)); renderChart();
}));
function renderChart() {
  if (!data) return;
  const PAL = palette();
  const days = []; for (let i = range - 1; i >= 0; i--) days.push(dayKey(daysAgo(i)));
  const keys = [...new Set(data.sessions.map((s) => s.task))];
  const nameOf = (id) => (data.tasks.find((t) => t.id === id) || {}).name || (id ? "Deleted task" : "Other");
  const colorOf = (id) => PAL[keys.indexOf(id) % PAL.length];
  const per = days.map((d) => { const o = {}; data.sessions.filter((s) => s.date === d).forEach((s) => (o[s.task] = (o[s.task] || 0) + s.sec)); return o; });
  const sums = per.map((o) => Object.values(o).reduce((a, b) => a + b, 0));
  const total = sums.reduce((a, b) => a + b, 0), max = Math.max(...sums, 0);
  $("#stTotal").textContent = fmtDur(total);
  $("#stAvg").textContent = fmtDur(total / range);
  $("#stBest").textContent = max ? fmtDur(max) : "-";
  if (!total) { $("#chart").innerHTML = '<div class="empty">No focus time yet. Finish a timer session and it shows up here.</div>'; $("#chartLegend").innerHTML = ""; return; }

  const W = 640, H = 280, L = 44, B = 28, T = 10, R = 8, iw = W - L - R, ih = H - T - B;
  const step = max / 3600 > 4 ? 3600 : max / 60 > 120 ? 1800 : max / 60 > 40 ? 900 : 600;
  const top = Math.ceil(max / step) * step, bw = iw / range;
  let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Focus time per day">`;
  for (let v = 0; v <= top; v += step) {
    const y = T + ih - (v / top) * ih;
    svg += `<line class="grid-line" x1="${L}" x2="${W - R}" y1="${y}" y2="${y}"/><text x="${L - 6}" y="${y + 4}" text-anchor="end">${v >= 3600 ? +(v / 3600).toFixed(1) + "h" : v / 60 + "m"}</text>`;
  }
  per.forEach((o, i) => {
    let y = T + ih; const x = L + i * bw + bw * 0.18, w = bw * 0.64;
    Object.keys(o).forEach((k) => {
      const h = (o[k] / top) * ih; y -= h;
      svg += `<rect x="${x}" y="${y}" width="${w}" height="${Math.max(h - 1, 1)}" rx="3" fill="${colorOf(+k)}"><title>${esc(nameOf(+k))}: ${fmtDur(o[k])} (${days[i]})</title></rect>`;
    });
    const label = range === 7 ? new Date(days[i] + "T12:00").toLocaleDateString(undefined, { weekday: "short" }) : (i % 5 === 0 ? days[i].slice(5) : "");
    if (label) svg += `<text x="${x + w / 2}" y="${H - 8}" text-anchor="middle">${label}</text>`;
  });
  $("#chart").innerHTML = svg + "</svg>";
  $("#chartLegend").innerHTML = keys.map((k) => `<span><i style="background:${colorOf(k)}"></i>${esc(nameOf(k))}</span>`).join("");
}

// ============ reminders ============
function renderReminders() {
  const ul = $("#remList"); ul.innerHTML = "";
  data.reminders.sort((a, b) => a.time.localeCompare(b.time)).forEach((r) => {
    const li = document.createElement("li");
    li.innerHTML = `<div><span class="${r.fired ? "done" : ""}">${esc(r.text)}</span><small>${new Date(r.time).toLocaleString()}</small></div><button aria-label="Delete reminder">✕</button>`;
    li.querySelector("button").onclick = () => { data.reminders = data.reminders.filter((x) => x.id !== r.id); persist(); renderReminders(); renderNextRem(); };
    ul.appendChild(li);
  });
}
$("#remForm").addEventListener("submit", (e) => {
  e.preventDefault();
  data.reminders.push({ id: Date.now(), text: $("#remText").value.trim(), time: $("#remTime").value, fired: false });
  persist(); $("#remText").value = ""; renderReminders(); renderNextRem();
});
$("#notifyBtn").onclick = async () => {
  if (!("Notification" in window)) return toast("Notifications not supported");
  const p = await Notification.requestPermission();
  toast(p === "granted" ? "Desktop notifications on" : "Notifications blocked");
};
setInterval(() => {
  if (!data) return;
  let changed = false;
  data.reminders.forEach((r) => { if (!r.fired && new Date(r.time) <= new Date()) { r.fired = true; changed = true; notify("Reminder", r.text); } });
  if (changed) { persist(); renderReminders(); }
  if ($("#home").classList.contains("active")) renderNextRem();
}, 1000);

// ============ friends (demo until backend) ============
function renderFriends() {
  $("#friendList").innerHTML = data.friends.map((f) => `<li><div><span class="dot ${f.online ? "on" : "off"}"></span>${esc(f.name)}<small>${esc(f.email)}</small></div><span class="muted tiny">${f.online ? "Active now" : "Offline"}</span></li>`).join("")
    || '<p class="muted">No friends yet. Invite someone above.</p>';
  const you = `<figure><div class="avatar live">${avatarHTML(me)}</div>You</figure>`;
  $("#room").innerHTML = you + data.friends.filter((f) => f.online).map((f) => `<figure><div class="avatar live">${esc(f.name[0])}</div>${esc(f.name)}</figure>`).join("");
}
$("#friendForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const email = $("#friendEmail").value.trim();
  data.friends.push({ name: email.split("@")[0], email, online: false });
  persist(); $("#friendEmail").value = ""; renderFriends(); toast("Invite saved (demo)");
});

// ============ start ============
function renderAll() { renderProfile(); renderHome(); renderNotes(); renderTasks(); fillTaskSelect(); renderReminders(); renderFriends(); readInputs(); renderChart(); }
function startApp(email) {
  const u = users()[email]; if (!u) return;
  me = u;
  data = rawLoad(dkey(), null);
  if (!data) data = seedData();
  ensureData(data); persist();
  $("#auth").hidden = true; $("#app").hidden = false;
  renderAll(); goTab("home");
}
const saved = rawLoad("session", null);
if (saved && users()[saved]) startApp(saved);
