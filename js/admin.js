/* NIFLENS admin dashboard.
   Auth: GitHub token (verified server-side on every call via x-niflens-admin).
   Photos upload to the site's repo: originals under an unguessable key path,
   optimized previews alongside. Entity records are created through the
   niflensAdmin backend function. */
(function () {
  "use strict";

  var API = "https://superagent-e3f5b6f2.base44.app/functions/niflensAdmin";
  var GH = "https://api.github.com/repos/iremide188/NIFLENS/contents/";
  var SITE = (location.origin + location.pathname).replace(/\/admin\.html.*$/, "/");

  var token = sessionStorage.getItem("nf_admin_token") || "";
  var view = "overview";
  var galleries = [];
  var currentGallery = null; // photo manager
  var codeFilter = "all";

  var $ = function (id) { return document.getElementById(id); };
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function fmtDate(d) {
    if (!d) return "—";
    try {
      var dt = new Date(d);
      if (isNaN(dt.getTime())) return d;
      return dt.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
    } catch (e) { return d; }
  }
  function toast(msg) {
    var t = $("ad-toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(t._tm);
    t._tm = setTimeout(function () { t.classList.remove("show"); }, 2400);
  }
  function copy(text, msg) {
    function done() { toast(msg || "Copied"); }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, fallback);
    } else fallback();
    function fallback() {
      var ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); done(); } catch (e) {}
      ta.remove();
    }
  }

  function api(action, data) {
    return fetch(API, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-niflens-admin": token },
      body: JSON.stringify(Object.assign({ action: action }, data || {}))
    }).then(function (r) { return r.json(); });
  }

  function ghPut(path, contentB64, message) {
    return fetch(GH + encodeURIComponent(path).replace(/%2F/g, "/"), {
      method: "PUT",
      headers: {
        "Authorization": "Bearer " + token,
        "Content-Type": "application/json",
        "User-Agent": "niflens-admin"
      },
      body: JSON.stringify({ message: message, content: contentB64 })
    }).then(function (r) {
      if (!r.ok) {
        var hint = "GitHub upload failed (" + r.status + ")";
        if (r.status === 403 || r.status === 404) hint = "Your token can't write to this repo (status " + r.status + "). Open github.com \u2192 Settings \u2192 Developer settings \u2192 Fine-grained tokens, edit your token, add the NIFLENS repo with Contents: Read and write, then sign in here again.";
        else if (r.status === 401) hint = "Token expired or invalid. Create a new token and sign in again.";
        throw new Error(hint);
      }
      return r.json();
    });
  }

  function b64(file) {
    return new Promise(function (res, rej) {
      var fr = new FileReader();
      fr.onload = function () { res(String(fr.result).split(",")[1]); };
      fr.onerror = rej;
      fr.readAsDataURL(file);
    });
  }
  function hex(n) {
    var a = new Uint8Array(n);
    (window.crypto || {}).getRandomValues ? crypto.getRandomValues(a) : a.forEach(function (_, i) { a[i] = Math.random() * 256 | 0; });
    return Array.from(a, function (b) { return b.toString(16).padStart(2, "0"); }).join("");
  }

  // Compress to an optimized preview (max 1600px, JPEG q0.85) for gallery display.
  function compress(file) {
    return new Promise(function (res, rej) {
      var img = new Image();
      img.onload = function () {
        try {
          var max = 1600;
          var sc = Math.min(1, max / Math.max(img.width, img.height));
          var c = document.createElement("canvas");
          c.width = Math.round(img.width * sc);
          c.height = Math.round(img.height * sc);
          c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
          res(c.toDataURL("image/jpeg", 0.85));
        } catch (e) { rej(e); }
      };
      img.onerror = function () { rej(new Error("Could not read image")); };
      img.src = URL.createObjectURL(file);
    });
  }

  /* ================= LOGIN ================= */
  function showLogin(errText) {
    $("ad-login-view").style.display = "flex";
    $("ad-app").style.display = "none";
    $("ad-login-btn").disabled = false;
    $("ad-login-btn").textContent = "Sign In";
    if (errText) { var e = $("ad-login-error"); e.textContent = errText; e.style.display = "block"; }
  }
  function showApp() {
    $("ad-login-view").style.display = "none";
    $("ad-app").style.display = "grid";
    switchView("overview");
  }
  $("ad-login-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var t = $("ad-token").value.trim();
    if (!t) return;
    $("ad-login-btn").disabled = true;
    $("ad-login-btn").textContent = "Signing in...";
    $("ad-login-error").style.display = "none";
    token = t;
    api("stats").then(function (d) {
      if (d.ok) {
        sessionStorage.setItem("nf_admin_token", token);
        showApp();
      } else {
        token = "";
        showLogin("That access token was not accepted. Please check it and try again.");
      }
    }).catch(function () {
      token = "";
      showLogin("Could not reach the server. Please try again.");
    });
  });
  $("ad-logout").addEventListener("click", function () {
    sessionStorage.removeItem("nf_admin_token");
    token = "";
    location.reload();
  });

  /* ================= VIEW ROUTER ================= */
  function switchView(v) {
    view = v;
    document.querySelectorAll("#ad-menu button").forEach(function (b) {
      b.classList.toggle("on", b.dataset.view === v);
    });
    if (v === "overview") renderOverview();
    if (v === "galleries") loadGalleries();
    if (v === "requests") renderRequests();
    if (v === "codes") renderCodes();
    if (v === "inquiries") renderInquiries();
  }
  $("ad-menu").addEventListener("click", function (e) {
    var b = e.target.closest("button");
    if (b) switchView(b.dataset.view);
  });

  var main = $("ad-main");
  function mainHead(title, buttonHtml) {
    return '<div class="ad-head"><h2>' + title + "</h2>" + (buttonHtml || "") + "</div>";
  }

  /* ================= OVERVIEW ================= */
  function renderOverview() {
    main.innerHTML = '<div class="ad-head"><h2>Overview</h2></div><div class="ad-tiles" id="ov-tiles"></div>';
    api("stats").then(function (d) {
      if (!d.ok) return;
      var s = d.stats;
      var tiles = [
        ["Total galleries", s.totalGalleries, ""],
        ["Active galleries", s.activeGalleries, ""],
        ["Uploaded photos", s.totalPhotos, ""],
        ["Download requests", s.totalRequests, ""],
        ["Unused codes", s.unusedCodes, "acc"],
        ["Used codes", s.usedCodes, ""]
      ];
      $("ov-tiles").innerHTML = tiles.map(function (t) {
        return '<div class="ad-tile"><div class="ad-t-n">' + t[0] + '</div><div class="ad-t-v ' + t[2] + '">' + t[1] + "</div></div>";
      }).join("") +
        (s.pendingRequests ? '<div style="grid-column:1/-1;color:var(--muted);font-size:0.85rem;">You have <b style="color:var(--accent)">' + s.pendingRequests + "</b> download request(s) waiting for a code. Open <b>Download Requests</b> to respond.</div>" : "");
    });
  }

  /* ================= GALLERIES ================= */
  function loadGalleries() {
    main.innerHTML = mainHead("Galleries", '<button class="btn" id="g-new">Create Gallery</button>') +
      '<div id="g-body"><p style="color:var(--muted);">Loading galleries...</p></div>';
    $("g-new").addEventListener("click", galleryModal);
    api("galleryList").then(function (d) {
      if (!d.ok) { $("g-body").innerHTML = "<p class='form-error'>Could not load galleries.</p>"; return; }
      galleries = d.galleries;
      renderGalleryTable();
    });
  }

  function galleryLink(slug) { return SITE + "gallery.html?g=" + slug; }

  function renderGalleryTable() {
    var el = $("g-body");
    if (!galleries.length) {
      el.innerHTML = '<div class="empty"><svg viewBox="0 0 24 24" fill="none" stroke-width="1.5"><rect x="3" y="3" width="18" height="14" rx="2"/><path d="M3 11l5-5 4 4 3-3 6 6"/></svg><p>No galleries available. Create your first gallery to start delivering photos.</p></div>';
      return;
    }
    var rows = galleries.map(function (g) {
      return "<tr>" +
        "<td><b>" + esc(g.name) + "</b><br><span style='color:var(--muted-2);font-size:0.72rem;'>" + esc(g.slug) + "</span></td>" +
        "<td>" + (g.date ? fmtDate(g.date) : "—") + "</td>" +
        "<td>" + g.photoCount + "</td>" +
        "<td><span class='chip-st " + (g.status === "active" ? "active'>ACTIVE" : "inactive'>INACTIVE") + "</span></td>" +
        "<td><div class='row-actions'>" +
          '<button class="btn btn-ghost btn-sm" data-act="view" data-slug="' + esc(g.slug) + '">View</button>' +
          '<button class="btn btn-ghost btn-sm" data-act="photos" data-id="' + g.id + '">Manage Photos</button>' +
          '<button class="btn btn-ghost btn-sm" data-act="copy" data-slug="' + esc(g.slug) + '">Copy Link</button>' +
          '<button class="btn btn-ghost btn-sm" data-act="edit" data-id="' + g.id + '">Edit</button>' +
          '<button class="btn btn-ghost btn-sm danger" data-act="del" data-id="' + g.id + '" data-name="' + esc(g.name) + '">Delete</button>' +
        "</div></td></tr>";
    }).join("");
    el.innerHTML =
      '<div class="ad-table-wrap"><table class="ad-table"><thead><tr>' +
      "<th>Gallery Name</th><th>Date</th><th>Photos</th><th>Status</th><th>Actions</th>" +
      "</tr></thead><tbody>" + rows + "</tbody></table></div>";
  }

  main.addEventListener("click", function (e) {
    var b = e.target.closest("button[data-act]");
    if (!b) return;
    var act = b.dataset.act;
    if (act === "view") window.open(galleryLink(b.dataset.slug), "_blank");
    if (act === "copy") copy(galleryLink(b.dataset.slug), "Gallery link copied");
    if (act === "photos") openPhotoManager(b.dataset.id);
    if (act === "edit") editGalleryModal(b.dataset.id);
    if (act === "del") {
      if (confirm('Delete "' + b.dataset.name + '" and all its photos and codes? This cannot be undone.')) {
        api("galleryDelete", { id: b.dataset.id }).then(function (d) {
          if (d.ok) { toast("Gallery deleted"); loadGalleries(); }
          else toast(d.error || "Delete failed");
        });
      }
    }
  });

  /* Gallery create / edit modal */
  function modal(html) {
    $("ad-modal-panel").innerHTML = '<button class="adm-close" onclick="document.getElementById(\'ad-modal\').classList.remove(\'open\')">&times;</button>' + html;
    $("ad-modal").classList.add("open");
  }
  $("ad-modal").addEventListener("click", function (e) {
    if (e.target === this) this.classList.remove("open");
  });

  function galleryModal(g) {
    var isEdit = !!g;
    modal(
      "<h3>" + (isEdit ? "Edit gallery" : "Create gallery") + "</h3>" +
      '<div class="field"><label>Gallery name</label><input id="mg-name" type="text" value="' + (isEdit ? esc(g.name) : "") + '" placeholder="e.g. Castmog Training — September 2026"></div>' +
      '<div class="row-2">' +
        '<div class="field"><label>Date</label><input id="mg-date" type="date" value="' + (isEdit ? esc(g.date || "") : "") + '"></div>' +
        (isEdit ? '<div class="field"><label>Status</label><select id="mg-status"><option value="active"' + (g.status === "active" ? " selected" : "") + '>Active</option><option value="inactive"' + (g.status !== "active" ? " selected" : "") + ">Inactive</option></select></div>" : "") +
      "</div>" +
      '<div class="field"><label>Description</label><textarea id="mg-desc" style="min-height:90px;">' + (isEdit ? esc(g.description) : "") + "</textarea></div>" +
      '<button class="btn" id="mg-save">' + (isEdit ? "Save Changes" : "Create Gallery") + "</button>"
    );
    $("mg-save").addEventListener("click", function () {
      var name = $("mg-name").value.trim();
      if (!name) { toast("Please enter a gallery name"); return; }
      var btn = this;
      btn.disabled = true;
      if (isEdit) {
        api("galleryUpdate", { id: g.id, name: name, date: $("mg-date").value, description: $("mg-desc").value.trim(), status: $("mg-status").value }).then(function (d) {
          if (d.ok) { $("ad-modal").classList.remove("open"); toast("Gallery updated"); loadGalleries(); }
          else { btn.disabled = false; toast(d.error || "Failed"); }
        });
      } else {
        api("galleryCreate", { name: name, date: $("mg-date").value, description: $("mg-desc").value.trim() }).then(function (d) {
          if (d.ok) {
            $("ad-modal").classList.remove("open");
            loadGalleries();
            modal(
              "<h3>Gallery created</h3>" +
              '<p style="color:var(--muted);margin-bottom:16px;">Share this private link with the player or client:</p>' +
              '<div class="field"><input id="mg-linkbox" type="text" readonly value="' + esc(galleryLink(d.slug)) + '"></div>' +
              '<div class="row-2">' +
                '<button class="btn" id="mg-copylink">Copy Link</button>' +
                '<button class="btn btn-outline" id="mg-gophotos">Manage Photos</button>' +
              "</div>"
            );
            $("mg-copylink").addEventListener("click", function () { copy(galleryLink(d.slug), "Gallery link copied"); });
            $("mg-gophotos").addEventListener("click", function () {
              $("ad-modal").classList.remove("open");
              openPhotoManager(d.gallery.id);
            });
          } else { btn.disabled = false; toast(d.error || "Failed"); }
        });
      }
    });
  }
  function editGalleryModal(id) {
    var g = galleries.find(function (x) { return x.id === id; });
    if (g) galleryModal(g);
  }

  /* ================= PHOTO MANAGER ================= */
  var mgrPhotos = [];
  function openPhotoManager(gid) {
    var g = galleries.find(function (x) { return x.id === gid; });
    if (!g) { toast("Gallery not found"); return; }
    currentGallery = g;
    main.innerHTML =
      '<div class="ad-head"><h2>' + esc(g.name) + "</h2>" +
      '<div style="display:flex;gap:10px;flex-wrap:wrap;">' +
      '<button class="btn btn-ghost btn-sm" id="pm-back">&larr; Back to Galleries</button>' +
      '<button class="btn btn-ghost btn-sm" id="pm-link">Copy Gallery Link</button>' +
      '<button class="btn btn-ghost btn-sm" id="pm-view">Open Gallery</button>' +
      "</div></div>" +
      '<div class="ad-photo-tools">' +
        '<label class="ad-upload-label">Upload Photos<input type="file" id="pm-files" accept="image/jpeg,image/png,image/webp" multiple></label>' +
        '<span style="color:var(--muted-2);font-size:0.72rem;">JPG, PNG or WebP up to 40MB each. Originals are preserved in full quality.</span>' +
      "</div>" +
      '<div id="pm-progress"></div>' +
      '<div class="ad-photo-grid" id="pm-grid"></div>' +
      '<div class="empty" id="pm-empty" style="display:none;margin-top:20px;"><svg viewBox="0 0 24 24" fill="none" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg><p>No photos have been uploaded yet. Use UPLOAD PHOTOS to add the first batch.</p></div>';

    $("pm-back").addEventListener("click", function () { switchView("galleries"); });
    $("pm-link").addEventListener("click", function () { copy(galleryLink(g.slug), "Gallery link copied"); });
    $("pm-view").addEventListener("click", function () { window.open(galleryLink(g.slug), "_blank"); });
    $("pm-files").addEventListener("change", handleUpload);

    refreshMgr();
  }

  function refreshMgr() {
    api("photoList", { galleryId: currentGallery.id }).then(function (d) {
      if (!d.ok) return;
      mgrPhotos = d.photos;
      renderMgrGrid();
    });
  }

  function renderMgrGrid() {
    var grid = $("pm-grid");
    if (!grid) return;
    $("pm-empty").style.display = mgrPhotos.length ? "none" : "block";
    grid.innerHTML = mgrPhotos.map(function (p, i) {
      return '<div class="ad-photo-card' + (currentGallery.coverUrl === p.previewUrl ? " cover" : "") + '">' +
        (currentGallery.coverUrl === p.previewUrl ? '<span class="ap-cover-tag">COVER</span>' : "") +
        '<img src="' + esc(p.previewUrl) + '" alt="Photo" loading="lazy">' +
        '<div class="ap-tools">' +
          '<button data-m="up" data-i="' + i + '" ' + (i === 0 ? "disabled" : "") + '>&uarr;</button>' +
          '<button data-m="down" data-i="' + i + '" ' + (i === mgrPhotos.length - 1 ? "disabled" : "") + '>&darr;</button>' +
          '<button data-m="cover" data-i="' + i + '">Set Cover</button>' +
          '<button data-m="del" data-i="' + i + '" class="danger">Delete</button>' +
        "</div></div>";
    }).join("");
  }

  main.addEventListener("click", function (e) {
    var b = e.target.closest("button[data-m]");
    if (!b) return;
    var i = parseInt(b.dataset.i, 10);
    var p = mgrPhotos[i];
    if (!p) return;
    if (b.dataset.m === "up" && i > 0) {
      mgrPhotos.splice(i - 1, 0, mgrPhotos.splice(i, 1)[0]);
      renderMgrGrid();
      api("photoReorder", { order: mgrPhotos.map(function (x) { return x.id; }) });
    }
    if (b.dataset.m === "down" && i < mgrPhotos.length - 1) {
      mgrPhotos.splice(i + 1, 0, mgrPhotos.splice(i, 1)[0]);
      renderMgrGrid();
      api("photoReorder", { order: mgrPhotos.map(function (x) { return x.id; }) });
    }
    if (b.dataset.m === "cover") {
      api("photoSetCover", { photoId: p.id }).then(function (d) {
        if (d.ok) { currentGallery.coverUrl = p.previewUrl; renderMgrGrid(); toast("Cover image set"); }
      });
    }
    if (b.dataset.m === "del") {
      if (confirm("Delete this photo from the gallery?")) {
        api("photoDelete", { id: p.id }).then(function (d) {
          if (d.ok) { mgrPhotos.splice(i, 1); renderMgrGrid(); toast("Photo deleted"); }
        });
      }
    }
  });

  function progressRow(name) {
    var row = document.createElement("div");
    row.className = "ap-row";
    row.innerHTML = "<b>" + esc(name) + "</b><span>Uploading...</span>";
    var box = $("pm-progress");
    if (box && !box.classList.contains("ad-progress")) box.className = "ad-progress";
    box.appendChild(row);
    return {
      set: function (txt, cls) {
        var s = row.querySelector("span");
        s.textContent = txt;
        if (cls) s.className = cls;
      }
    };
  }

  function handleUpload(e) {
    var files = Array.from(e.target.files || []);
    e.target.value = "";
    var g = currentGallery;
    if (!g) return;
    files = files.filter(function (f) { return /^image\/(jpeg|png|webp)$/.test(f.type); });
    if (!files.length) { toast("Please choose JPG, PNG or WebP images"); return; }

    (async function () {
      var added = 0;
      for (var i = 0; i < files.length; i++) {
        var f = files[i];
        var pr = progressRow(f.name);
        if (f.size > 40 * 1024 * 1024) { pr.set("Skipped: larger than 40MB", "err"); continue; }
        try {
          pr.set("Optimising preview...");
          var ext = f.type === "image/png" ? "png" : (f.type === "image/webp" ? "webp" : "jpg");
          var safeName = f.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 60) || "photo.jpg";
          var k = g.assetKey || "gallery";
          var ogPath = "assets/originals/" + k + "/" + hex(12) + "-" + safeName;
          var pvPath = "assets/previews/" + k + "/" + hex(12) + ".jpg";

          pr.set("Uploading original (full quality)...");
          await ghPut(ogPath, await b64(f), "NIFLENS: add original photo");
          pr.set("Uploading preview...");
          var dataUrl = await compress(f);
          await ghPut(pvPath, dataUrl.split(",")[1], "NIFLENS: add gallery preview");
          pr.set("Saving to gallery...");
          var d = await api("photoCreate", { galleryId: g.id, filename: safeName, previewUrl: pvPath, originalUrl: ogPath });
          if (d.ok) { pr.set("Done", "ok"); added++; }
          else pr.set(d.error || "Failed to save record", "err");
        } catch (err) {
          pr.set("Failed: " + (err.message || "error"), "err");
        }
      }
      toast(added + " photo(s) uploaded. The live site updates within a couple of minutes.");
      refreshMgr();
    })();
  }

  /* ================= DOWNLOAD REQUESTS ================= */
  function renderRequests() {
    main.innerHTML = mainHead("Download Requests") + '<div id="rq-body"><p style="color:var(--muted);">Loading...</p></div>';
    api("requestList").then(function (d) {
      if (!d.ok) { $("rq-body").innerHTML = "<p class='form-error'>Could not load requests.</p>"; return; }
      if (!d.requests.length) {
        $("rq-body").innerHTML = '<div class="empty"><svg viewBox="0 0 24 24" fill="none" stroke-width="1.5"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg><p>No download requests yet. When clients select photos and request a download, they will appear here.</p></div>';
        return;
      }
      var rows = d.requests.map(function (r) {
        return "<tr>" +
          "<td><b>" + esc(r.clientName) + "</b><br><span style='color:var(--muted-2);font-size:0.72rem;'>" + esc(r.clientContact) + "</span></td>" +
          "<td>" + esc(r.galleryName) + "</td>" +
          "<td>" + r.photoCount + " photos</td>" +
          "<td>" + fmtDate(r.created) + "</td>" +
          "<td>" + (r.codeUsed ? "<b>" + esc(r.codeUsed) + "</b> <span class='chip-st " + esc(r.codeStatus) + "'>" + esc(r.codeStatus) + "</span>" : "—") + "</td>" +
          "<td><span class='chip-st " + esc(r.status) + "'>" + esc(r.status) + "</span></td>" +
          '<td><button class="btn btn-ghost btn-sm" data-req="' + r.id + '">View</button></td>' +
        "</tr>";
      }).join("");
      $("rq-body").innerHTML =
        '<div class="ad-table-wrap"><table class="ad-table"><thead><tr>' +
        "<th>Client</th><th>Gallery</th><th>Selection</th><th>Request Date</th><th>Code Status</th><th>Download Status</th><th></th>" +
        "</tr></thead><tbody>" + rows + "</tbody></table></div>" +
        '<p style="color:var(--muted-2);font-size:0.75rem;margin-top:12px;">Generate a code in DOWNLOAD CODES and send it to the client. The code works only for their selected photos.</p>';
    });
  }

  main.addEventListener("click", function (e) {
    var b = e.target.closest("button[data-req]");
    if (!b) return;
    api("requestDetail", { id: b.dataset.req }).then(function (d) {
      if (!d.ok) { toast("Could not load request"); return; }
      var r = d.request;
      var wa = "";
      var ph = String(r.clientContact || "");
      if (/^\+?\d[\d\s-]{6,}$/.test(ph)) {
        var num = ph.replace(/[^0-9+]/g, "");
        if (num.startsWith("0")) num = "234" + num.slice(1);
        if (!num.startsWith("+")) num = "+" + num;
        wa = '<a class="btn btn-sm" style="margin-top:14px;" target="_blank" rel="noopener" href="https://wa.me/' + num.replace("+", "") + '">Open WhatsApp</a>';
      }
      modal(
        "<h3>Request by " + esc(r.clientName) + "</h3>" +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:8px;font-size:0.85rem;">' +
          "<div><span style='color:var(--muted-2)'>Gallery:</span><br>" + esc(r.galleryName || "") + "</div>" +
          "<div><span style='color:var(--muted-2)'>Contact:</span><br>" + esc(r.clientContact || "") + "</div>" +
          "<div><span style='color:var(--muted-2)'>Requested:</span><br>" + fmtDate(r.created) + "</div>" +
          "<div><span style='color:var(--muted-2)'>Code used:</span><br>" + esc(r.codeUsed || "Not yet") + "</div>" +
        "</div>" +
        "<p style='color:var(--muted-2);font-size:0.75rem;margin:8px 0 0;'>SELECTED PHOTOS (" + d.photos.length + ')</p><div class="ad-req-detail-grid">' +
        d.photos.map(function (p) { return '<img src="' + esc(p.previewUrl) + '" alt="Selected photo">'; }).join("") +
        "</div>" +
        (wa || "") +
        '<div style="display:flex;gap:10px;margin-top:14px;">' +
          '<button class="btn btn-ghost btn-sm" id="rq-done"' + (r.status === "COMPLETED" ? " disabled" : "") + ">Mark Completed</button>" +
          '<button class="btn btn-outline btn-sm" onclick="document.getElementById(\'ad-modal\').classList.remove(\'open\')">Close</button>' +
        "</div>"
      );
      $("rq-done").addEventListener("click", function () {
        api("requestUpdate", { id: r.id, status: "COMPLETED" }).then(function (x) {
          if (x.ok) { $("ad-modal").classList.remove("open"); toast("Marked completed"); renderRequests(); }
        });
      });
    });
  });

  /* ================= DOWNLOAD CODES ================= */
  function renderCodes() {
    main.innerHTML = mainHead("Download Codes", '<button class="btn" id="cd-gen">Generate Download Code</button>') +
      '<div class="ad-filter-row" id="cd-filters"></div><div id="cd-body"><p style="color:var(--muted);">Loading...</p></div>';
    $("cd-gen").addEventListener("click", codeModal);
    var chips = [["all", "All"], ["UNUSED", "Unused"], ["USED", "Used"], ["EXPIRED", "Expired"], ["REVOKED", "Revoked"]];
    $("cd-filters").innerHTML = chips.map(function (c) {
      return '<button class="chip' + (c[0] === codeFilter ? " on" : "") + '" data-f="' + c[0] + '">' + c[1] + "</button>";
    }).join("");
    $("cd-filters").addEventListener("click", function (e) {
      var b = e.target.closest("button[data-f]");
      if (!b) return;
      codeFilter = b.dataset.f;
      renderCodes();
    });
    loadCodes();
  }

  var allCodes = [];
  function loadCodes() {
    api("codeList").then(function (d) {
      if (!d.ok) { $("cd-body").innerHTML = "<p class='form-error'>Could not load codes.</p>"; return; }
      allCodes = d.codes;
      var list = codeFilter === "all" ? allCodes : allCodes.filter(function (c) { return c.status === codeFilter; });
      if (!list.length) {
        $("cd-body").innerHTML = '<div class="empty"><svg viewBox="0 0 24 24" fill="none" stroke-width="1.5"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 11-7.778 7.778 5.5 5.5 0 017.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg><p>' + (codeFilter === "all" ? "No download codes yet. Generate a code when a client requests their photos." : "No " + codeFilter.toLowerCase() + " codes.") + "</p></div>";
        return;
      }
      var rows = list.map(function (c) {
        return "<tr>" +
          "<td><b style='font-family:var(--font-display);letter-spacing:0.06em;'>" + esc(c.code) + "</b>" + (c.allowAll ? '<br><span style="font-size:0.65rem;color:var(--muted-2);">ALL PHOTOS</span>' : "") + "</td>" +
          "<td>" + esc(c.galleryName) + "</td>" +
          "<td>" + esc(c.clientName || "—") + (c.clientContact ? '<br><span style="color:var(--muted-2);font-size:0.72rem;">' + esc(c.clientContact) + "</span>" : "") + "</td>" +
          "<td><span class='chip-st " + esc(c.status) + "'>" + esc(c.status) + "</span></td>" +
          "<td>" + fmtDate(c.created) + "</td>" +
          "<td>" + (c.usedAt ? fmtDate(c.usedAt) : "—") + (c.expiresAt && c.status === "UNUSED" ? '<br><span style="font-size:0.68rem;color:var(--muted-2);">expires ' + fmtDate(c.expiresAt) + "</span>" : "") + "</td>" +
          '<td><div class="row-actions">' +
            '<button class="btn btn-ghost btn-sm" data-c="copy" data-code="' + esc(c.code) + '">Copy</button>' +
            (c.status === "UNUSED" ? '<button class="btn btn-ghost btn-sm danger" data-c="revoke" data-id="' + c.id + '">Revoke</button>' : "") +
            '<button class="btn btn-ghost btn-sm danger" data-c="del" data-id="' + c.id + '">Delete</button>' +
          "</div></td></tr>";
      }).join("");
      $("cd-body").innerHTML =
        '<div class="ad-table-wrap"><table class="ad-table"><thead><tr>' +
        "<th>Code</th><th>Gallery</th><th>Client</th><th>Status</th><th>Created</th><th>Used</th><th>Actions</th>" +
        "</tr></thead><tbody>" + rows + "</tbody></table></div>";
    });
  }

  main.addEventListener("click", function (e) {
    var b = e.target.closest("button[data-c]");
    if (!b) return;
    if (b.dataset.c === "copy") copy(b.dataset.code, "Code copied");
    if (b.dataset.c === "revoke") {
      if (confirm("Revoke this code? The client will no longer be able to use it.")) {
        api("codeRevoke", { id: b.dataset.id }).then(function (d) { if (d.ok) { toast("Code revoked"); loadCodes(); } });
      }
    }
    if (b.dataset.c === "del") {
      if (confirm("Delete this code record?")) {
        api("codeDelete", { id: b.dataset.id }).then(function (d) { if (d.ok) { toast("Code deleted"); loadCodes(); } });
      }
    }
  });

  function codeModal() {
    api("galleryList").then(function (d) {
      if (!d.ok || !d.galleries.length) { toast("Create a gallery first"); return; }
      var opts = d.galleries.filter(function (g) { return g.photoCount > 0; }).map(function (g) {
        return '<option value="' + g.id + '">' + esc(g.name) + " (" + g.photoCount + " photos)</option>";
      }).join("");
      if (!opts) { toast("Upload photos to a gallery first"); return; }
      modal(
        "<h3>Generate download code</h3>" +
        '<div class="field"><label>Gallery</label><select id="mc-gallery">' + opts + "</select></div>" +
        '<div class="row-2">' +
          '<div class="field"><label>Client name (optional)</label><input id="mc-name" type="text"></div>' +
          '<div class="field"><label>Client contact (optional)</label><input id="mc-contact" type="text" placeholder="Phone or @instagram"></div>' +
        "</div>" +
        '<div class="field"><label>Expiration (optional)</label><input id="mc-exp" type="datetime-local"></div>' +
        '<div class="check-row"><input type="checkbox" id="mc-all"><label for="mc-all">Allow download of ALL photos in this gallery (not just the client\'s selected photos). Leave unchecked for normal selections.</label></div>' +
        '<button class="btn" id="mc-gen">Generate Code</button>'
      );
      $("mc-gen").addEventListener("click", function () {
        var btn = this;
        btn.disabled = true;
        btn.textContent = "Generating...";
        api("codeCreate", {
          galleryId: $("mc-gallery").value,
          clientName: $("mc-name").value.trim(),
          clientContact: $("mc-contact").value.trim(),
          expiresAt: $("mc-exp").value ? new Date($("mc-exp").value).toISOString() : "",
          allowAll: $("mc-all").checked
        }).then(function (r) {
          if (!r.ok) { btn.disabled = false; btn.textContent = "Generate Code"; toast(r.error || "Failed"); return; }
          modal(
            "<h3>Code generated</h3>" +
            '<p style="color:var(--muted);margin-bottom:14px;">Send this code to the client. It works once, only for this gallery.</p>' +
            '<div class="field"><input class="gm-code-input" style="letter-spacing:0.2em;" id="mc-out" readonly value="' + esc(r.code) + '"></div>' +
            '<div class="row-2"><button class="btn" id="mc-copy">Copy Code</button>' +
            '<button class="btn btn-outline" onclick="document.getElementById(\'ad-modal\').classList.remove(\'open\')">Done</button></div>'
          );
          $("mc-copy").addEventListener("click", function () { copy(r.code, "Code copied"); });
        });
      });
    });
  }

  /* ================= INQUIRIES ================= */
  function renderInquiries() {
    main.innerHTML = mainHead("Inquiries") + '<div id="iq-body"><p style="color:var(--muted);">Loading...</p></div>';
    api("contactList").then(function (d) {
      if (!d.ok) { $("iq-body").innerHTML = "<p class='form-error'>Could not load inquiries.</p>"; return; }
      if (!d.contacts.length) {
        $("iq-body").innerHTML = '<div class="empty"><svg viewBox="0 0 24 24" fill="none" stroke-width="1.5"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg><p>No inquiries yet. Messages from the contact form will appear here.</p></div>';
        return;
      }
      $("iq-body").innerHTML = d.contacts.map(function (c) {
        return '<div class="ad-inq' + (c.status === "new" ? " new" : "") + '">' +
          '<div class="ad-inq-top"><h4>' + esc(c.name) + (c.service ? " — " + esc(c.service) : "") + "</h4>" +
          "<span class='chip-st " + (c.status === "new" ? "PENDING'>NEW" : "USED'>READ") + "</span></div>" +
          '<div class="ad-inq-meta">' +
            [c.phone ? "Phone: " + esc(c.phone) : "", c.instagram ? "Instagram: " + esc(c.instagram) : "",
             c.club ? "Club: " + esc(c.club) : "", c.date ? "Date: " + esc(c.date) : "",
             c.location ? "Location: " + esc(c.location) : "", "Received: " + fmtDate(c.created_date)].filter(Boolean).join("  ·  ") +
          "</div>" +
          (c.message ? "<p>" + esc(c.message) + "</p>" : "") +
          '<div class="ad-inq-actions">' +
            (c.status === "new" ? '<button class="btn btn-ghost btn-sm" data-iq="read" data-id="' + c.id + '">Mark Read</button>' : "") +
            '<button class="btn btn-ghost btn-sm danger" data-iq="del" data-id="' + c.id + '">Delete</button>' +
          "</div></div>";
      }).join("");
    });
  }
  main.addEventListener("click", function (e) {
    var b = e.target.closest("button[data-iq]");
    if (!b) return;
    if (b.dataset.iq === "read") api("contactRead", { id: b.dataset.id }).then(function () { renderInquiries(); });
    if (b.dataset.iq === "del") {
      if (confirm("Delete this inquiry?")) api("contactDelete", { id: b.dataset.id }).then(function () { renderInquiries(); });
    }
  });

  /* Boot */
  if (token) {
    api("stats").then(function (d) { if (d.ok) showApp(); else showLogin(); }).catch(function () { showLogin(); });
  } else {
    showLogin();
  }
})();
