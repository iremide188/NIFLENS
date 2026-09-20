/* NIFLENS home: renders the "From the field" grid from data/portfolio.json. */
(function () {
  "use strict";
  fetch("data/portfolio.json?cb=" + Date.now())
    .then(function (r) { return r.json(); })
    .then(function (items) {
      var grid = document.getElementById("home-work");
      if (!grid) return;
      var picks = items.filter(function (i) { return i.type !== "video"; }).slice(0, 6);
      picks.forEach(function (it, i) {
        var a = document.createElement("a");
        a.href = "portfolio.html";
        a.className = "work-item" + (i === 0 ? " lead" : (i === 3 ? " wide" : ""));
        a.innerHTML =
          '<img src="' + it.image + '" alt="' + (it.title || "NIFLENS football photography") + '" loading="lazy">' +
          '<div class="wi-caption"><div class="wi-cat">' + (it.category || "") + '</div><div class="wi-title">' + (it.title || "") + "</div></div>";
        grid.appendChild(a);
      });
    })
    .catch(function () { /* grid stays empty silently */ });
})();
