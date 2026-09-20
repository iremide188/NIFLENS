/* NIFLENS portfolio: category filters, grid, lightbox. */
(function () {
  "use strict";
  var CATS = [
    ["all", "All"],
    ["player", "Player Photography"],
    ["matchday", "Matchday"],
    ["training", "Training"],
    ["events", "Football Events"],
    ["videos", "Highlight Videos"]
  ];
  var items = [];
  var active = "all";

  var filters = document.getElementById("filters");
  var grid = document.getElementById("portfolio-grid");
  var emptyBox = document.getElementById("portfolio-empty");

  function renderFilters() {
    filters.innerHTML = "";
    CATS.forEach(function (c) {
      var b = document.createElement("button");
      b.className = "chip" + (c[0] === active ? " on" : "");
      b.textContent = c[1];
      b.addEventListener("click", function () {
        active = c[0];
        renderFilters();
        renderGrid();
      });
      filters.appendChild(b);
    });
  }

  function match(it) {
    if (active === "all") return true;
    if (active === "videos") return it.type === "video";
    return it.type !== "video" && (it.category || "").toLowerCase().indexOf(CATS.find(function (c) { return c[0] === active; })[1].split(" ")[0].toLowerCase()) !== -1;
  }

  function renderGrid() {
    grid.innerHTML = "";
    var shown = 0;
    items.forEach(function (it, i) {
      if (!match(it)) return;
      shown++;
      var el = document.createElement(it.type === "video" ? "a" : "div");
      var cls = "work-item";
      if (shown === 1) cls += " lead";
      else if (shown % 7 === 5) cls += " wide";
      el.className = cls;
      if (it.type === "video") {
        el.href = it.video || "#";
        el.target = "_blank";
        el.rel = "noopener";
      }
      var img = it.type === "video" ? (it.image || it.videoThumb || it.video) : it.image;
      el.innerHTML =
        '<img src="' + img + '" alt="' + (it.title || "NIFLENS football photography") + '" loading="lazy">' +
        (it.type === "video" ? '<div class="wi-play"><span>&#9654;</span></div>' : "") +
        '<div class="wi-caption"><div class="wi-cat">' + (it.type === "video" ? "Highlight Video" : it.category) + '</div><div class="wi-title">' + (it.title || "") + "</div></div>";
      if (it.type !== "video") {
        el.addEventListener("click", function () {
          document.getElementById("lightbox-img").src = it.image;
          document.getElementById("lightbox").classList.add("open");
        });
      }
      grid.appendChild(el);
    });
    emptyBox.style.display = shown ? "none" : "block";
  }

  document.getElementById("lightbox").addEventListener("click", function (e) {
    if (e.target.classList.contains("lb-close") || e.target.id === "lightbox") {
      this.classList.remove("open");
    }
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") document.getElementById("lightbox").classList.remove("open");
  });

  fetch("data/portfolio.json?cb=" + Date.now())
    .then(function (r) { return r.json(); })
    .then(function (data) {
      items = data || [];
      renderFilters();
      renderGrid();
    })
    .catch(function () {
      renderFilters();
      renderGrid();
    });
})();
