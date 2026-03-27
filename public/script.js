let chart;
let allTasks = [];
let currentFilter = 'all';
let geminiHistory = [];

document.addEventListener("DOMContentLoaded", () => {
  setGreeting();
  setDateChip();
  injectSvgGradient();
  loadTasks(); // 🚀 Now loads from MongoDB!
});

// ── UI & Navigation Initialization ──
function switchTab(targetId, navElement) {
  // Update sidebar active state
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  navElement.classList.add('active');
  
  // Update title (removes the emoji icon for the title)
  document.getElementById('pageTitle').innerText = navElement.innerText.replace(/[^a-zA-Z\s]/g, '').trim();

  // Hide all views, show the requested one
  document.querySelectorAll('.app-view').forEach(view => view.style.display = 'none');
  const targetView = document.getElementById(`view-${targetId}`);
  if(targetView) targetView.style.display = 'block';

  // Fix chart sizing bug when switching tabs
  if(targetId === 'analytics') renderChart();
}

function setGreeting() {
  const h = new Date().getHours();
  const el = document.getElementById("greeting");
  if (h < 12) el.textContent = "Good morning ☀️";
  else if (h < 18) el.textContent = "Good afternoon 🌤️";
  else el.textContent = "Good evening 🌙";
}

function setDateChip() {
  const el = document.getElementById("dateChip");
  el.textContent = new Date().toLocaleDateString("en-IN", { 
    weekday: "long", day: "numeric", month: "short", year: "numeric" 
  });
}

function injectSvgGradient() {
  if (document.getElementById("ringGrad")) return;
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("style", "width:0; height:0; position:absolute;");
  svg.innerHTML = `
    <defs>
      <linearGradient id="ringGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#6366f1"/><stop offset="100%" stop-color="#38bdf8"/>
      </linearGradient>
    </defs>
  `;
  document.body.appendChild(svg);
}

// ── Core Task Logic (MongoDB Connected) ──
async function loadTasks() {
  try {
    const response = await fetch('/tasks');
    allTasks = await response.json();
    renderAll();
  } catch (err) {
    showToast("❌ Could not connect to database", "error");
    console.error(err);
  }
}

async function addTask() {
  const subject = document.getElementById("subject").value.trim();
  const taskDesc = document.getElementById("task").value.trim();
  const deadline = document.getElementById("deadline").value;
  const priority = document.getElementById("priority").value;

  if (!subject || !taskDesc || !deadline) return showToast("⚠️ Fill all fields", "warn");

  try {
    const response = await fetch('/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subject, task: taskDesc, deadline, priority, status: "Pending" })
    });

    if (response.ok) {
      document.getElementById("subject").value = "";
      document.getElementById("task").value = "";
      document.getElementById("deadline").value = "";
      showToast("✅ Task added!", "success");
      loadTasks(); // Refresh from DB
    }
  } catch (err) {
    showToast("❌ Failed to save task", "error");
  }
}

async function markDone(id) {
  const task = allTasks.find(t => t._id === id);
  if (!task) return;
  
  const newStatus = task.status === "Done" ? "Pending" : "Done";

  try {
    await fetch(`/update/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus })
    });
    showToast("🎉 Status updated!", "success");
    loadTasks(); // Refresh from DB
  } catch (err) {
    showToast("❌ Failed to update", "error");
  }
}

async function deleteTask(id) {
  try {
    await fetch(`/delete/${id}`, { method: 'DELETE' });
    showToast("🗑️ Task deleted", "warn");
    loadTasks(); // Refresh from DB
  } catch (err) {
    showToast("❌ Failed to delete", "error");
  }
}

// ── Rendering Engine ──
function renderAll() {
  updateStats();
  renderChart();
  renderTodayTasks();
  renderWeeklyPlanner();
  renderTaskList();
}

function updateStats() {
  const today = new Date().toISOString().split("T")[0];
  const total = allTasks.length;
  const done = allTasks.filter(t => t.status === "Done").length;
  const pending = allTasks.filter(t => t.status !== "Done").length;
  const overdue = allTasks.filter(t => t.status !== "Done" && t.deadline.split('T')[0] < today).length;

  document.getElementById("total").textContent = total;
  document.getElementById("done").textContent = done;
  document.getElementById("pending").textContent = pending;
  document.getElementById("overdue").textContent = overdue;

  // Bars
  const max = total || 1;
  document.getElementById("totalBar").style.width = "100%";
  document.getElementById("doneBar").style.width = (done / max * 100) + "%";
  document.getElementById("pendingBar").style.width = (pending / max * 100) + "%";
  document.getElementById("overdueBar").style.width = (overdue / max * 100) + "%";

  // Progress Ring
  const pct = total ? (done / total) * 100 : 0;
  const ring = document.getElementById("ringFg");
  if (ring) {
    const circumference = 2 * Math.PI * 52;
    ring.style.strokeDasharray = circumference;
    ring.style.strokeDashoffset = circumference - (pct / 100) * circumference;
  }

  document.getElementById("progressPct").textContent = Math.round(pct) + "%";
  document.getElementById("ringLabel").textContent = `${done} / ${total}`;
  document.getElementById("progressNote").textContent = total === 0 ? "Add tasks to get started." : pct === 100 ? "🎉 All tasks completed!" : `${pending} tasks remaining`;
}

function renderChart() {
  const ctx = document.getElementById("myChart");
  if (!ctx) return;
  const done = allTasks.filter(t => t.status === "Done").length;
  const pending = allTasks.filter(t => t.status !== "Done").length;

  if (chart) chart.destroy();
  chart = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: ["Done", "Pending"],
      datasets: [{
        data: [done, pending || (allTasks.length === 0 ? 1 : 0)],
        backgroundColor: ["#6366f1", "#f59e0b"],
        borderWidth: 0,
        hoverOffset: 10
      }]
    },
    options: { cutout: "75%", plugins: { legend: { display: false } } }
  });
}

function renderTodayTasks() {
  const div = document.getElementById("todayTasks");
  if (!div) return;
  const today = new Date().toISOString().split("T")[0];
  const tasks = allTasks.filter(t => t.deadline.split('T')[0] === today);
  
  div.innerHTML = tasks.length ? "" : `<p class="empty-msg">No tasks due today 🎉</p>`;
  tasks.forEach(t => {
    const item = document.createElement("div");
    item.className = "today-item";
    item.innerHTML = `<span style="font-size:11px; color:var(--accent2); display:block;">${t.subject}</span> ${t.task}`;
    div.appendChild(item);
  });
}

function renderWeeklyPlanner() {
  const grid = document.getElementById("planner");
  if (!grid) return;
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const todayIdx = new Date().getDay();
  grid.innerHTML = "";

  days.forEach((d, i) => {
    const col = document.createElement("div");
    col.className = `day-col ${i === todayIdx ? "today-col" : ""}`;
    col.innerHTML = `<div class="day-name">${d}</div>`;
    
    allTasks.filter(t => new Date(t.deadline).getDay() === i).forEach(t => {
      const p = document.createElement("div");
      p.className = "day-task";
      p.textContent = t.task;
      col.appendChild(p);
    });
    grid.appendChild(col);
  });
}

function renderTaskList() {
  const list = document.getElementById("taskList");
  if (!list) return;
  const today = new Date().toISOString().split("T")[0];
  let tasks = [...allTasks];

  if (currentFilter === "Done") tasks = tasks.filter(t => t.status === "Done");
  if (currentFilter === "Pending") tasks = tasks.filter(t => t.status !== "Done");
  if (currentFilter === "overdue") tasks = tasks.filter(t => t.status !== "Done" && t.deadline.split('T')[0] < today);

  list.innerHTML = tasks.length ? "" : `<p class="empty-msg" style="padding:40px; text-align:center;">No tasks found ✨</p>`;

  tasks.forEach(t => {
    const isDone = t.status === "Done";
    const isOverdue = !isDone && t.deadline.split('T')[0] < today;
    const div = document.createElement("div");
    div.className = `task-item ${isDone ? "done-task" : ""} ${isOverdue ? "overdue-task" : ""}`;
    
    const displayDate = t.deadline.split('T')[0]; // Clean up DB date format
    
    div.innerHTML = `
      <div class="task-checkbox ${isDone ? "checked" : ""}" onclick="markDone('${t._id}')">${isDone ? "✓" : ""}</div>
      <div class="task-info">
        <div class="task-subject">${t.subject}</div>
        <div class="task-name">${t.task}</div>
        <div class="task-meta">📅 ${displayDate} • <span class="task-badge">${t.priority}</span></div>
      </div>
      <div class="task-actions">
        <button class="task-btn" onclick="deleteTask('${t._id}')">✕</button>
      </div>
    `;
    list.appendChild(div);
  });
}

// ── Helpers ──
function setFilter(f, btn) {
  currentFilter = f;
  document.querySelectorAll(".filter-btn").forEach(b => b.classList.remove("active"));
  btn.classList.add("active");
  renderTaskList();
}

function showToast(msg, type) {
  const t = document.createElement("div");
  t.className = "toast";
  t.style.cssText = `position:fixed; bottom:20px; right:20px; padding:12px 20px; background:#1e293b; color:white; border-radius:12px; z-index:9999; box-shadow:0 10px 15px -3px rgba(0,0,0,0.1); border-left:4px solid ${type==='error'?'#ef4444':'#10b981'}`;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3000);
}

// ── Gemini Chatbot Logic (Real API Connected) ──
function toggleChat() {
  document.getElementById("chatPanel").classList.toggle("open");
}

function sendChip(el) {
  document.getElementById("chatInput").value = el.textContent;
  sendMessage();
}

async function sendMessage() {
  const input = document.getElementById("chatInput");
  const text = input.value.trim();
  if (!text) return;

  input.value = "";
  addUserMessage(text);
  const typingId = showTyping();

  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ history: geminiHistory, message: text })
    });

    const data = await response.json();
    removeTyping(typingId);

    if (data.reply) {
      addAIMessage(data.reply);
      // Save history so the AI remembers the conversation
      geminiHistory.push({ role: "user", parts: [{ text: text }] });
      geminiHistory.push({ role: "model", parts: [{ text: data.reply }] });
    } else {
      addAIMessage("⚠️ Error: I couldn't understand the server response.");
    }
  } catch (err) {
    removeTyping(typingId);
    addAIMessage("⚠️ Error: Could not connect to the Gemini API.");
  }
}

function addUserMessage(text) {
  const div = document.createElement("div");
  div.className = "msg user-msg";
  div.innerHTML = `<div class="msg-bubble">${text}</div>`;
  document.getElementById("chatMessages").appendChild(div);
  scrollToBottom();
}

function addAIMessage(text) {
  const div = document.createElement("div");
  div.className = "msg ai-msg";
  // Convert basic markdown-style bolding to HTML
  const formattedText = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  div.innerHTML = `<div class="msg-bubble">${formattedText}</div>`;
  document.getElementById("chatMessages").appendChild(div);
  scrollToBottom();
}

function showTyping() {
  const id = "typing-" + Date.now();
  const div = document.createElement("div");
  div.id = id;
  div.className = "msg ai-msg";
  div.innerHTML = `<div class="msg-bubble">...</div>`;
  document.getElementById("chatMessages").appendChild(div);
  scrollToBottom();
  return id;
}

function removeTyping(id) { 
  document.getElementById(id)?.remove(); 
}

function scrollToBottom() {
  const msgContainer = document.getElementById("chatMessages");
  msgContainer.scrollTop = msgContainer.scrollHeight;
}