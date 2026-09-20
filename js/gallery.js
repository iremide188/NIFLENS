/* NIFLENS private gallery: browse, select, request download, verify code, download.
   All code verification happens server-side (niflensVerify). */
(function () {
  "use strict";
  var API = "https://superagent-e3f5b6f2.base44.app/functions/niflensPublic";
  var VERIFY = "https://superagent-e3f5b6f2.base44.app/functions/niflensVerify";

  var slug = new URLSearchParams(location.search).get("g") || "";
  var gallery = null;
  var photos = [];
  var selected = [];
  var requestId = null;

  var $ = function (id) { return document.getElementById(id); };

  // No browser image menus on the gallery: no "Download image", no "Copy image",
  // no drag-out. Photos are selected with a tap OR a press-and-hold.
  document.addEventListener("contextmenu", function (e) { e.preventDefault(); });
  document.addEventListener("dragstart", function (e) {
    if (e.target && e.target.tagName === "IMG") e.preventDefault();
  });

  function lsKey(k) { return "nf_" + k + "_" + slug; }
  function saveState() {
    try {
      localStorage.setItem(lsKey("sel"), JSON.stringify(selected));
      if (requestId) localStorage.setItem(lsKey("req"), requestId);
    } catch (e) {}
  }
  function loadState() {
    try {
      selected = JSON.parse(localStorage.getItem(lsKey("sel")) || "[]");
      requestId = localStorage.getItem(lsKey("req")) || null;
    } catch (e) { selected = []; requestId = null; }
  }

  function showStatus(title, text) {
    $("pg-status").style.display = "block";
    $("pg-status-title").textContent = title;
    $("pg-status-text").textContent = text;
  }

  function fmtDate(d) {
    if (!d) return "";
    try {
      var dt = new Date(d);
      if (isNaN(dt.getTime())) return d;
      return dt.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
    } catch (e) { return d; }
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function render() {
    $("pg-status").style.display = "none";
    $("pg-main").style.display = "block";
    $("pg-name").textContent = gallery.name;
    $("pg-meta").textContent = [fmtDate(gallery.date), photos.length + (photos.length === 1 ? " photo" : " photos")].filter(Boolean).join("  ·  ");
    $("pg-desc").textContent = gallery.description || "";

    var grid = $("pg-grid");
    grid.innerHTML = "";
    if (!photos.length) {
      $("pg-empty").style.display = "block";
      return;
    }
    photos.forEach(function (p, i) {
      var tile = document.createElement("button");
      tile.type = "button";
      tile.className = "pg-tile";
      tile.setAttribute("aria-label", "Select photo " + (i + 1));
      tile.innerHTML =
        '<img src="' + p.previewUrl + '" alt="Photo ' + (i + 1) + '" loading="lazy" draggable="false">' +
        '<span class="pg-check"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12l6 6L20 6"/></svg></span>' +
        '<span class="pg-n" id="badge-' + p.id + '" title="View larger">' + String(i + 1).padStart(2, "0") + "</span>";
      tile.addEventListener("click", function (ev) {
        if (tile._longPressed) { tile._longPressed = false; ev.preventDefault(); return; }
        toggle(p.id, tile);
      });
      // press-and-hold also selects (mobile instinct) - fires once at ~400ms
      var lpTimer = null;
      tile.addEventListener("touchstart", function (ev) {
        lpTimer = setTimeout(function () {
          tile._longPressed = true;
          toggle(p.id, tile);
          if (navigator.vibrate) { try { navigator.vibrate(12); } catch (e) {} }
        }, 400);
      }, { passive: true });
      ["touchend", "touchcancel", "touchmove"].forEach(function (evt) {
        tile.addEventListener(evt, function () { clearTimeout(lpTimer); }, { passive: true });
      });
      // Tap the number badge to preview the photo larger (without selecting it).
      var badge = tile.querySelector(".pg-n");
      badge.addEventListener("click", function (ev) {
        ev.stopPropagation();
        document.getElementById("pg-lightbox-img").src = p.previewUrl;
        document.getElementById("pg-lightbox").classList.add("open");
      });
      // long-tap preview via the number badge is fiddly; whole tile toggles.
      grid.appendChild(tile);
      if (selected.indexOf(p.id) !== -1) tile.classList.add("selected");
    });
    updateBar();
  }

  function tileFor(id) {
    var idx = photos.findIndex(function (p) { return p.id === id; });
    return $("pg-grid").children[idx];
  }

  function toggle(id, tileEl) {
    var at = selected.indexOf(id);
    if (at === -1) { selected.push(id); tileEl.classList.add("selected"); }
    else { selected.splice(at, 1); tileEl.classList.remove("selected"); }
    saveState();
    updateBar();
  }

  function updateBar() {
    $("sel-count").textContent = selected.length;
    $("pg-bar").classList.toggle("show", selected.length > 0);
  }

  $("clear-sel").addEventListener("click", function () {
    selected = [];
    document.querySelectorAll(".pg-tile.selected").forEach(function (t) { t.classList.remove("selected"); });
    saveState();
    updateBar();
  });

  /* ---------- Modal flow ---------- */
  var overlay = $("gm-overlay");
  function openModal(step) {
    overlay.classList.add("open");
    ["info", "code", "busy"].forEach(function (s) {
      $("gm-step-" + s).style.display = s === step ? "block" : "none";
    });
    if (step === "code") setTimeout(function () { $("gm-code").focus(); }, 60);
  }
  $("gm-close").addEventListener("click", function () { overlay.classList.remove("open"); });
  overlay.addEventListener("click", function (e) { if (e.target === overlay) overlay.classList.remove("open"); });

  $("request-btn").addEventListener("click", function () {
    if (!selected.length) return;
    // If this device already sent a request for this gallery, go straight to the code step.
    if (requestId) {
      $("gm-code-sub").textContent = "Your selection has already been sent to NIFLENS. Enter the download code you received to unlock your photos.";
      openModal("code");
    } else {
      openModal("info");
    }
  });

  $("gm-back").addEventListener("click", function () { openModal("info"); });

  $("gm-send-request").addEventListener("click", function () {
    var name = $("gm-name").value.trim();
    var contact = $("gm-contact").value.trim();
    var err = $("gm-info-error");
    err.style.display = "none";
    if (!name) { err.textContent = "Please enter your name."; err.style.display = "block"; return; }
    if (!contact) { err.textContent = "Please add a phone number or Instagram handle."; err.style.display = "block"; return; }

    var btn = $("gm-send-request");
    btn.disabled = true;
    btn.textContent = "Sending...";

    fetch(API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "request", slug: slug, clientName: name, clientContact: contact, photoIds: selected })
    })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        btn.disabled = false;
        btn.textContent = "Send Request";
        if (d.ok) {
          requestId = d.requestId;
          saveState();
          $("gm-code-sub").textContent = "Your request has been sent to NIFLENS (" + d.photoCount + " photos). Enter the download code you received to unlock them.";
          openModal("code");
        } else {
          err.textContent = d.error || "Request could not be sent. Please try again.";
          err.style.display = "block";
        }
      })
      .catch(function () {
        btn.disabled = false;
        btn.textContent = "Send Request";
        err.textContent = "Network problem. Please check your connection and try again.";
        err.style.display = "block";
      });
  });

  $("gm-code").addEventListener("input", function () {
    this.value = this.value.toUpperCase().replace(/[^A-Z0-9-]/g, "");
  });
  $("gm-code").addEventListener("keydown", function (e) { if (e.key === "Enter") $("gm-verify").click(); });

  $("gm-verify").addEventListener("click", function () {
    var code = $("gm-code").value.trim();
    var err = $("gm-code-error");
    err.style.display = "none";
    if (!code || !requestId) {
      err.textContent = "Please enter your download code.";
      err.style.display = "block";
      return;
    }
    $("gm-busy-text").textContent = "Verifying your code...";
    openModal("busy");

    fetch(VERIFY, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: code, slug: slug, requestId: requestId })
    })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (d.ok) {
          overlay.classList.remove("open");
          renderDownload(d);
        } else {
          openModal("code");
          err.textContent = d.error || "Verification failed. Please try again.";
          err.style.display = "block";
        }
      })
      .catch(function () {
        openModal("code");
        err.textContent = "Network problem. Please check your connection and try again.";
        err.style.display = "block";
      });
  });

  /* ---------- Download ready screen ---------- */
  function renderDownload(d) {
    $("pg-main").style.display = "none";
    $("pg-bar").classList.remove("show");
    var wrap = $("dl-screen");
    wrap.style.display = "block";
    var list = d.photos || [];
    var galleryName = esc(d.galleryName || gallery.name);
    var html =
      '<div class="dl-wrap">' +
        '<span class="dl-badge">&#10003; ' + esc(d.message || "Download authorized.") + "</span>" +
        "<h1>Download ready</h1>" +
        '<p class="dl-sub">' + (d.clientName ? esc(d.clientName) + ", you" : "You") + " are authorized to download your selected NIFLENS photos" +
        (galleryName ? " from " + galleryName : "") + ". " + list.length + (list.length === 1 ? " photo" : " photos") + " available.</p>" +
        '<div class="dl-actions">' +
          (list.length > 1 ? '<button class="btn btn-accent" id="zip-btn">Download Selected (ZIP)</button>' : "") +
        "</div>" +
        '<div class="dl-grid" id="dl-grid"></div>' +
      "</div>";
    wrap.innerHTML = html;

    var gridEl = wrap.querySelector("#dl-grid");
    list.forEach(function (p) {
      var tile = document.createElement("div");
      tile.className = "dl-tile";
      tile.innerHTML =
        '<img src="' + p.previewUrl + '" alt="' + esc(p.filename) + '">' +
        '<div class="dl-btn-row"><a class="btn btn-sm dl-one" href="' + p.url + '" download="' + esc(p.filename) + '">Download</a></div>';
      gridEl.appendChild(tile);
    });

    var zipBtn = wrap.querySelector("#zip-btn");
    if (zipBtn) {
      zipBtn.addEventListener("click", function () {
        zipBtn.disabled = true;
        zipBtn.textContent = "Preparing ZIP (" + list.length + " photos)...";
        var zip = new JSZip();
        var done = 0;
        var jobs = list.map(function (p, i) {
          return fetch(p.url)
            .then(function (r) {
              if (!r.ok) throw new Error("file " + (i + 1));
              return r.arrayBuffer();
            })
            .then(function (buf) {
              var name = p.filename || ("niflens-" + (i + 1) + ".jpg");
              zip.file(name, buf);
              done++;
              zipBtn.textContent = "Preparing ZIP... " + done + "/" + list.length;
            })
            .catch(function () {
              done++;
            });
        });
        Promise.all(jobs).then(function () {
          return zip.generateAsync({ type: "blob" });
        }).then(function (blob) {
          var a = document.createElement("a");
          a.href = URL.createObjectURL(blob);
          a.download = "NIFLENS-selected-photos.zip";
          document.body.appendChild(a);
          a.click();
          setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
          zipBtn.disabled = false;
          zipBtn.textContent = "Download Selected (ZIP)";
        }).catch(function () {
          zipBtn.disabled = false;
          zipBtn.textContent = "Download Selected (ZIP)";
          alert("The ZIP could not be prepared. You can still download each photo individually.");
        });
      });
    }
    window.scrollTo(0, 0);
  }

  /* ---------- Lightbox ---------- */
  document.addEventListener("click", function (e) {
    var lb = $("pg-lightbox");
    if (e.target.classList.contains("lb-close") || e.target.id === "pg-lightbox") lb.classList.remove("open");
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") $("pg-lightbox").classList.remove("open");
  });

  /* ---------- Boot ---------- */
  if (!slug) {
    showStatus("Gallery link required", "This page needs a valid gallery link. Open the link NIFLENS sent you, or contact NIFLENS.");
  } else {
    loadState();
    fetch(API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "gallery", slug: slug })
    })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (d.ok) {
          gallery = d.gallery;
          photos = d.photos || [];
          // keep selection valid: drop ids that no longer exist
          var ids = new Set(photos.map(function (p) { return p.id; }));
          selected = selected.filter(function (id) { return ids.has(id); });
          saveState();
          render();
        } else {
          showStatus("Gallery not available", "This gallery link is not available. It may have been deactivated. Please contact NIFLENS.");
        }
      })
      .catch(function () {
        showStatus("Connection problem", "The gallery could not be loaded. Please check your internet connection and open the link again.");
      });
  }
})();
