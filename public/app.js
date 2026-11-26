const $ = id => document.getElementById(id);
const STORAGE_KEY = "tiktok-transcript-studio.jobs.v1";
const POLL_TIMEOUT_MS = 10 * 60 * 1000;
const POLL_INTERVAL_MS = 5000;
const HISTORY_LIMIT = 5;
const pollHandles = new Map();
let jobs = loadJobs();
let activeJobId = null;

async function api(path, options = {}) {
  let response;
  try {
    response = await fetch(path, {
      ...options,
      credentials: "same-origin",
      headers: { "content-type": "application/json", ...(options.headers || {}) }
    });
  } catch (error) {
    throw new Error("Koneksi jaringan terputus.");
  }
  const data = await response.json().catch(() => ({ error: "Respons server tidak valid." }));
  if (!response.ok) {
    const error = new Error(data.error || "Permintaan gagal.");
    error.status = response.status;
    throw error;
  }
  return data;
}

function loadJobs() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(stored)
      ? stored.filter(job => job && typeof job.id === "string" && /^[0-9a-f-]{36}$/i.test(job.id)).slice(0, HISTORY_LIMIT)
      : [];
  } catch {
    return [];
  }
}

function saveJobs() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(jobs.slice(0, HISTORY_LIMIT)));
  } catch {
    showStatus("Penyimpanan browser penuh atau dinonaktifkan. Job tetap berjalan selama halaman ini terbuka.", false);
  }
}

function updateJob(id, patch) {
  const index = jobs.findIndex(job => job.id === id);
  if (index < 0) return;
  jobs[index] = { ...jobs[index], ...patch, updatedAt: Date.now() };
  jobs.sort((a, b) => b.updatedAt - a.updatedAt);
  jobs = jobs.slice(0, HISTORY_LIMIT);
  saveJobs();
  renderRecentJobs();
}

function showApp(authenticated) {
  $("authPanel").classList.toggle("hidden", authenticated);
  $("appPanel").classList.toggle("hidden", !authenticated);
}

function showStatus(message, retry = false) {
  $("jobStatus").classList.remove("hidden");
  $("jobStatusText").textContent = message;
  $("retryJobBtn").classList.toggle("hidden", !retry);
  $("retryJobBtn").disabled = false;
}

async function refreshSession() {
  try {
    await api("/api/auth/session", { method: "GET" });
    showApp(true);
    resumeSavedJobs();
  } catch {
    showApp(false);
  }
}

function clearPoll(id) {
  const handle = pollHandles.get(id);
  if (handle) clearTimeout(handle);
  pollHandles.delete(id);
}

function schedulePoll(id, delay = POLL_INTERVAL_MS) {
  clearPoll(id);
  pollHandles.set(id, setTimeout(() => checkJob(id), delay));
}

function possibleCause(status) {
  if (status === 404) return "Job mungkin sudah kedaluwarsa, hasil sementara sudah dibersihkan, atau ID tidak lagi tersedia.";
  if (status === 429) return "Server sedang membatasi permintaan sementara.";
  if (status >= 500) return "Layanan server atau penyimpanan sementara mungkin sedang bermasalah.";
  return "Periksa koneksi internet, sesi login, dan status layanan.";
}

async function checkJob(id) {
  const jobInfo = jobs.find(job => job.id === id);
  if (!jobInfo) return;
  const elapsed = Date.now() - jobInfo.startedAt;
  if (elapsed >= POLL_TIMEOUT_MS) {
    clearPoll(id);
    updateJob(id, { state: "timed_out" });
    if (activeJobId === id) showStatus("Polling dihentikan setelah 10 menit. Job mungkin masih berjalan di runner. Tekan Coba lagi untuk melanjutkan pengecekan.", true);
    return;
  }

  try {
    const job = await api("/api/jobs/" + encodeURIComponent(id));
    updateJob(id, { state: job.status, lastError: "" });
    if (job.status === "completed") {
      clearPoll(id);
      if (activeJobId === id) {
        showStatus("Transkripsi selesai.");
        $("retryJobBtn").classList.add("hidden");
        render(job.result || {});
      }
      return;
    }
    if (job.status === "failed") {
      clearPoll(id);
      updateJob(id, { state: "failed" });
      if (activeJobId === id) {
        const detail = job.error || "Transkripsi gagal.";
        showStatus(detail + " Kemungkinan penyebab: video tidak publik, runner GitHub Actions kehabisan kuota, atau proses unduh/transkripsi gagal.", true);
      }
      return;
    }
    if (activeJobId === id) showStatus("Status: " + (job.status || "menunggu") + " · pengecekan otomatis setiap 5 detik.");
    schedulePoll(id);
  } catch (error) {
    if (error.status === 401) {
      clearPoll(id);
      if (activeJobId === id) showStatus("Sesi login berakhir. Masuk kembali untuk melanjutkan pemantauan.", false);
      return;
    }
    const transient = !error.status || error.status === 408 || error.status === 429 || error.status >= 500;
    if (transient) {
      updateJob(id, { lastError: error.message });
      if (activeJobId === id) showStatus("Gangguan jaringan/server sementara (" + error.message + "). Polling akan mencoba lagi otomatis dalam 5 detik. " + possibleCause(error.status || 0), false);
      schedulePoll(id);
      return;
    }
    clearPoll(id);
    updateJob(id, { state: "needs_retry", lastError: error.message });
    if (activeJobId === id) showStatus(error.message + " " + possibleCause(error.status), true);
  }
}

function startPolling(id, resetDeadline = false) {
  clearPoll(id);
  const current = jobs.find(job => job.id === id);
  if (!current) return;
  if (resetDeadline) updateJob(id, { startedAt: Date.now(), state: "queued", lastError: "" });
  activeJobId = id;
  $("resultPanel").classList.add("hidden");
  $("submitBtn").disabled = true;
  $("retryJobBtn").disabled = false;
  showStatus("Menghubungkan ke job " + id + "…");
  checkJob(id);
}

function resumeSavedJobs() {
  renderRecentJobs();
  jobs.filter(job => !["completed", "failed"].includes(job.state)).forEach(job => {
    if (Date.now() - job.startedAt >= POLL_TIMEOUT_MS) {
      updateJob(job.id, { state: "timed_out" });
    } else {
      startPolling(job.id, false);
    }
  });
  if (!jobs.length) $("submitBtn").disabled = false;
}

function renderRecentJobs() {
  const container = $("recentJobs");
  container.replaceChildren();
  if (!jobs.length) {
    const empty = document.createElement("p");
    empty.className = "hint";
    empty.textContent = "Job yang baru dibuat akan muncul di sini.";
    container.append(empty);
    return;
  }
  for (const job of jobs) {
    const item = document.createElement("div");
    item.className = "recent-job";
    const info = document.createElement("div");
    const id = document.createElement("strong");
    id.textContent = job.id.slice(0, 8) + "…";
    const state = document.createElement("span");
    state.textContent = " · " + (job.state || "queued");
    const time = document.createElement("small");
    time.textContent = new Date(job.updatedAt || job.startedAt).toLocaleString("id-ID");
    info.append(id, state, time);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "ghost small";
    button.textContent = ["completed", "failed"].includes(job.state) ? "Lihat" : "Pantau";
    button.addEventListener("click", () => {
      if (["completed", "failed"].includes(job.state)) {
        activeJobId = job.id;
        showStatus(job.state === "completed" ? "Job selesai. Hasil dapat dibuka kembali jika masih tersedia." : "Job gagal. Tekan Coba lagi untuk memeriksa ulang. " + (job.lastError || ""), job.state === "failed");
        $("submitBtn").disabled = false;
        if (job.state === "failed") $("retryJobBtn").classList.remove("hidden");
      } else {
        startPolling(job.id, job.state === "timed_out" || job.state === "needs_retry");
      }
    });
    item.append(info, button);
    container.append(item);
  }
}

$("loginForm").addEventListener("submit", async event => {
  event.preventDefault();
  const button = $("loginForm").querySelector("button");
  button.disabled = true;
  try {
    await api("/api/auth/login", { method: "POST", body: JSON.stringify({ password: $("password").value }) });
    $("password").value = "";
    $("loginError").textContent = "";
    showApp(true);
    resumeSavedJobs();
  } catch (error) {
    $("loginError").textContent = error.message;
  } finally {
    button.disabled = false;
  }
});

$("logout").onclick = async () => {
  for (const id of pollHandles.keys()) clearPoll(id);
  try {
    await api("/api/auth/logout", { method: "POST" });
  } finally {
    showApp(false);
  }
};

$("jobForm").addEventListener("submit", async event => {
  event.preventDefault();
  $("submitBtn").disabled = true;
  $("resultPanel").classList.add("hidden");
  showStatus("Mengirim job ke GitHub Actions…");
  try {
    const data = await api("/api/jobs", { method: "POST", body: JSON.stringify({ url: $("url").value }) });
    const entry = { id: data.jobId, startedAt: Date.now(), updatedAt: Date.now(), state: data.status || "queued" };
    jobs = [entry, ...jobs.filter(job => job.id !== entry.id)].slice(0, HISTORY_LIMIT);
    saveJobs();
    renderRecentJobs();
    startPolling(data.jobId);
  } catch (error) {
    showStatus(error.message + " Periksa URL TikTok, koneksi, dan konfigurasi layanan.", true);
    $("submitBtn").disabled = false;
  }
});

$("retryJobBtn").addEventListener("click", () => {
  if (activeJobId) startPolling(activeJobId, true);
});

function render(result) {
  $("resultPanel").classList.remove("hidden");
  $("submitBtn").disabled = false;
  $("transcript").value = result.text || "";
  const segments = result.segments || [];
  const srt = segments.map((segment, index) => `${index + 1}\n${stamp(segment.start)} --> ${stamp(segment.end)}\n${segment.text}\n`).join("\n");
  const vtt = "WEBVTT\n\n" + segments.map(segment => `${stamp(segment.start)} --> ${stamp(segment.end)}\n${segment.text}\n`).join("\n");
  download("jsonDownload", JSON.stringify(result, null, 2), "application/json");
  download("srtDownload", srt, "text/plain");
  download("vttDownload", vtt, "text/vtt");
}

function stamp(value) {
  const ms = Math.max(0, Math.round(Number(value || 0) * 1000));
  const hours = Math.floor(ms / 3600000), minutes = Math.floor(ms % 3600000 / 60000);
  const seconds = Math.floor(ms % 60000 / 1000), fraction = ms % 1000;
  return [hours, minutes, seconds].map(part => String(part).padStart(2, "0")).join(":") + "," + String(fraction).padStart(3, "0");
}

function download(id, content, type) {
  const blob = new Blob([content], { type }), anchor = $(id);
  if (anchor.dataset.url) URL.revokeObjectURL(anchor.dataset.url);
  anchor.href = URL.createObjectURL(blob);
  anchor.dataset.url = anchor.href;
}

$("copyBtn").onclick = async () => {
  await navigator.clipboard.writeText($("transcript").value);
  $("copyBtn").textContent = "Tersalin";
};

renderRecentJobs();
refreshSession();
