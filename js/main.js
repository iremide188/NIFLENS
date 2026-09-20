/* NIFLENS shared scripts: nav behaviour, mobile menu, scroll reveal. */
(function () {
  "use strict";

  // Nav background on scroll
  var nav = document.querySelector(".site-nav");
  function onScroll() {
    if (nav) nav.classList.toggle("scrolled", window.scrollY > 30);
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  // Mobile menu
  var burger = document.querySelector(".nav-burger");
  if (burger) {
    burger.addEventListener("click", function () {
      document.body.classList.toggle("nav-open");
    });
    document.querySelectorAll(".nav-links a").forEach(function (a) {
      a.addEventListener("click", function () {
        document.body.classList.remove("nav-open");
      });
    });
  }

  // Active nav link
  var here = location.pathname.split("/").pop() || "index.html";
  document.querySelectorAll(".nav-links a").forEach(function (a) {
    if ((a.getAttribute("href") || "").indexOf(here) !== -1) a.classList.add("active");
  });

  // Footer year
  document.querySelectorAll(".yr").forEach(function (el) {
    el.textContent = new Date().getFullYear();
  });

  // Scroll reveal
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var items = document.querySelectorAll(".reveal");
  if (reduce || !("IntersectionObserver" in window)) {
    items.forEach(function (el) { el.classList.add("in"); });
  } else {
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting) {
            e.target.classList.add("in");
            io.unobserve(e.target);
          }
        });
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.05 }
    );
    items.forEach(function (el) { io.observe(el); });
  }
})();

/* Photo protection: block the browser's long-press / right-click image menu
   ("Download image", "Copy image") across the site. Aesthetic choice by NIFLENS:
   the photos carry the brand watermark and are not for saving from public pages. */
document.addEventListener("contextmenu", function (e) {
  var t = e.target;
  if (t && (t.tagName === "IMG" || t.tagName === "VIDEO" || (t.closest && t.closest("video")))) e.preventDefault();
});
document.addEventListener("dragstart", function (e) {
  if (e.target && e.target.tagName === "IMG") e.preventDefault();
});
