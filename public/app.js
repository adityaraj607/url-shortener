// app.js - frontend logic for urlshort
// handles form submission copy qr download and analytics display

// ── state ────────────────────────────────────────────────────────────────────

let currentCode = null    // short code of the last created link
let currentQr   = null    // base64 qr data uri for download


// ── shorten ──────────────────────────────────────────────────────────────────

async function shorten() {
  const url   = document.getElementById("urlInput").value.trim()
  const alias = document.getElementById("aliasInput").value.trim()

  if (!url) {
    showMsg("please enter a url", "error")
    return
  }

  // disable button while in flight
  const btn = document.getElementById("shortenBtn")
  btn.disabled = true
  btn.innerHTML = `<span class="material-icons-round text-base animate-spin">autorenew</span> shortening`

  try {
    const res = await fetch("/api/shorten", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ url, alias: alias || undefined })
    })

    const data = await res.json()

    if (!res.ok) {
      showMsg(data.error || "something went wrong", "error")
      return
    }

    // save state
    currentCode = data.short_code
    currentQr   = data.qr

    // fill in result card
    document.getElementById("shortUrlLink").textContent = data.short_url
    document.getElementById("shortUrlLink").href        = data.short_url
    document.getElementById("originalUrlText").textContent = data.original_url
    document.getElementById("qrImg").src               = data.qr

    // show card and reset tabs to qr
    document.getElementById("resultCard").classList.remove("hidden")
    switchTab("qr")
    clearMsg()

    // scroll into view smoothly
    document.getElementById("resultCard").scrollIntoView({ behavior: "smooth", block: "nearest" })

    // refresh list
    loadAllUrls()

  } catch (err) {
    showMsg("network error - is the server running", "error")
  } finally {
    btn.disabled = false
    btn.innerHTML = `<span class="material-icons-round text-base">bolt</span> shorten`
  }
}


// ── copy to clipboard ─────────────────────────────────────────────────────────

async function copyShortUrl() {
  const link = document.getElementById("shortUrlLink").textContent
  try {
    await navigator.clipboard.writeText(link)
    const btn = document.getElementById("copyBtn")
    btn.innerHTML = `<span class="material-icons-round text-base">check</span> copied`
    setTimeout(() => {
      btn.innerHTML = `<span class="material-icons-round text-base">content_copy</span> copy`
    }, 2000)
  } catch {
    showMsg("could not copy - try manually", "error")
  }
}


// ── download qr ───────────────────────────────────────────────────────────────

function downloadQr() {
  if (!currentQr) return
  const a    = document.createElement("a")
  a.href     = currentQr
  a.download = `${currentCode || "qr"}.png`
  a.click()
}


// ── tab switching ─────────────────────────────────────────────────────────────

function switchTab(tab) {
  const qrPanel  = document.getElementById("panelQr")
  const anaPanel = document.getElementById("panelAnalytics")
  const tabQr    = document.getElementById("tabQr")
  const tabAna   = document.getElementById("tabAnalytics")

  if (tab === "qr") {
    qrPanel.classList.remove("hidden")
    anaPanel.classList.add("hidden")
    tabQr.classList.add("tab-active")
    tabAna.classList.remove("tab-active")
  } else {
    qrPanel.classList.add("hidden")
    anaPanel.classList.remove("hidden")
    tabQr.classList.remove("tab-active")
    tabAna.classList.add("tab-active")
    // auto load analytics
    refreshAnalytics()
  }
}


// ── analytics ────────────────────────────────────────────────────────────────

async function refreshAnalytics() {
  if (!currentCode) return

  try {
    const res  = await fetch(`/api/analytics/${currentCode}`)
    const data = await res.json()

    if (!res.ok) return

    // update stat cells
    document.getElementById("statClicks").textContent  = data.url.total_clicks
    document.getElementById("statCreated").textContent = formatDate(data.url.created_at)

    // render bar chart
    renderBarChart(data.daily)

    // render recent clicks
    renderRecentClicks(data.recent)

  } catch (err) {
    // silently ignore if analytics fetch fails
  }
}


function renderBarChart(daily) {
  const el = document.getElementById("barChart")
  if (!daily || daily.length === 0) {
    el.innerHTML = `<p class="text-xs text-gray-300 m-auto">no click data yet</p>`
    return
  }

  // find max to scale bars
  const max = Math.max(...daily.map(d => d.count), 1)

  el.innerHTML = daily.map(d => {
    const pct    = Math.round((d.count / max) * 100)
    const height = Math.max(pct, 4)   // min 4% height so bar is visible
    return `
      <div class="flex-1 flex flex-col items-center gap-1 group" title="${d.day}: ${d.count} clicks">
        <div class="bar w-full bg-blue-200 rounded-t transition-all"
             style="height: ${height}%; min-height:4px;"
             title="${d.count}">
        </div>
      </div>
    `
  }).join("")
}


function renderRecentClicks(recent) {
  const el = document.getElementById("recentClicks")
  if (!recent || recent.length === 0) {
    el.innerHTML = `<p class="text-gray-300">no clicks yet</p>`
    return
  }

  el.innerHTML = recent.map(r => `
    <div class="flex items-center gap-2 py-1 border-b border-gray-50">
      <span class="material-icons-round text-gray-300" style="font-size:13px">mouse</span>
      <span class="text-gray-500">${formatDate(r.clicked_at)}</span>
      <span class="ml-auto text-gray-300">${r.ip || "—"}</span>
    </div>
  `).join("")
}


// ── recent links list ─────────────────────────────────────────────────────────

async function loadAllUrls() {
  const el = document.getElementById("urlList")

  try {
    const res  = await fetch("/api/urls")
    const data = await res.json()

    if (!data || data.length === 0) {
      el.innerHTML = `<p class="text-xs text-gray-400 italic">no links yet</p>`
      return
    }

    el.innerHTML = data.map(row => `
      <div class="flex items-center gap-3 border border-gray-100 rounded-lg px-3 py-2.5 hover:border-blue-100 transition fade-in">
        <span class="material-icons-round text-blue-300 text-base">link</span>
        <div class="flex-1 min-w-0">
          <a href="/${row.short_code}" target="_blank"
             class="text-blue-600 font-medium text-xs hover:underline">
            /${row.short_code}
          </a>
          <p class="text-xs text-gray-400 truncate mt-0.5">${row.original_url}</p>
        </div>
        <div class="text-right shrink-0">
          <p class="text-xs font-medium text-gray-700">${row.total_clicks}</p>
          <p class="text-xs text-gray-300">clicks</p>
        </div>
        <button
          onclick="loadAnalyticsFor('${row.short_code}')"
          class="text-xs text-gray-400 hover:text-blue-500 transition"
          title="view analytics"
        >
          <span class="material-icons-round" style="font-size:16px">bar_chart</span>
        </button>
        <button
          onclick="loadQrFor('${row.short_code}')"
          class="text-xs text-gray-400 hover:text-blue-500 transition"
          title="view qr"
        >
          <span class="material-icons-round" style="font-size:16px">qr_code</span>
        </button>
      </div>
    `).join("")

  } catch {
    el.innerHTML = `<p class="text-xs text-gray-400 italic">could not load links</p>`
  }
}


// load analytics for any existing link from the list
async function loadAnalyticsFor(code) {
  currentCode = code

  const res  = await fetch(`/api/urls`)
  const data = await res.json()
  const row  = data.find(r => r.short_code === code)
  if (row) {
    document.getElementById("shortUrlLink").textContent = `${location.origin}/${code}`
    document.getElementById("shortUrlLink").href        = `${location.origin}/${code}`
    document.getElementById("originalUrlText").textContent = row.original_url
  }

  document.getElementById("resultCard").classList.remove("hidden")
  switchTab("analytics")
  document.getElementById("resultCard").scrollIntoView({ behavior: "smooth", block: "nearest" })
}


// load qr for any existing link from the list
async function loadQrFor(code) {
  currentCode = code
  try {
    const res  = await fetch(`/api/qr/${code}`)
    const data = await res.json()
    currentQr  = data.qr

    document.getElementById("shortUrlLink").textContent = `${location.origin}/${code}`
    document.getElementById("shortUrlLink").href        = `${location.origin}/${code}`
    document.getElementById("qrImg").src               = data.qr
    document.getElementById("resultCard").classList.remove("hidden")
    switchTab("qr")
    document.getElementById("resultCard").scrollIntoView({ behavior: "smooth", block: "nearest" })
  } catch { /* silently ignore */ }
}


// ── utilities ─────────────────────────────────────────────────────────────────

function showMsg(msg, type) {
  const el = document.getElementById("formMsg")
  el.classList.remove("hidden", "bg-red-50", "text-red-600", "bg-green-50", "text-green-600")
  if (type === "error") {
    el.classList.add("bg-red-50", "text-red-600", "border", "border-red-100")
  } else {
    el.classList.add("bg-green-50", "text-green-600", "border", "border-green-100")
  }
  el.textContent = msg
  el.classList.remove("hidden")
}

function clearMsg() {
  document.getElementById("formMsg").classList.add("hidden")
}

function formatDate(str) {
  if (!str) return "—"
  try {
    const d = new Date(str.endsWith("Z") ? str : str + "Z")
    return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
  } catch {
    return str
  }
}


// ── enter key shortcut ────────────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("urlInput").addEventListener("keydown", e => {
    if (e.key === "Enter") shorten()
  })
  // load links on page ready
  loadAllUrls()
})
