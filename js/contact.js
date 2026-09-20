/* NIFLENS contact form -> niflensPublic (action: contact). */
(function () {
  "use strict";
  var API = "https://superagent-e3f5b6f2.base44.app/functions/niflensPublic";
  var form = document.getElementById("contact-form");
  if (!form) return;

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var err = document.getElementById("cf-error");
    var ok = document.getElementById("cf-ok");
    err.style.display = "none";
    ok.style.display = "none";

    var payload = {
      action: "contact",
      name: document.getElementById("cf-name").value.trim(),
      phone: document.getElementById("cf-phone").value.trim(),
      instagram: document.getElementById("cf-ig").value.trim(),
      club: document.getElementById("cf-club").value.trim(),
      service: document.getElementById("cf-service").value,
      date: document.getElementById("cf-date").value,
      location: document.getElementById("cf-location").value.trim(),
      message: document.getElementById("cf-message").value.trim()
    };

    if (!payload.name) { err.textContent = "Please enter your name."; err.style.display = "block"; return; }
    if (!payload.phone && !payload.instagram) { err.textContent = "Please add a phone number or Instagram handle so we can reply."; err.style.display = "block"; return; }
    if (!payload.service) { err.textContent = "Please select the service you need."; err.style.display = "block"; return; }

    var btn = document.getElementById("cf-send");
    btn.disabled = true;
    btn.textContent = "Sending...";

    fetch(API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (d.ok) {
          ok.style.display = "block";
          form.reset();
          btn.textContent = "Send Message";
          btn.disabled = false;
        } else {
          err.textContent = d.error || "Message could not be sent. Please try again.";
          err.style.display = "block";
          btn.textContent = "Send Message";
          btn.disabled = false;
        }
      })
      .catch(function () {
        err.textContent = "Network problem. Please check your connection and try again.";
        err.style.display = "block";
        btn.textContent = "Send Message";
        btn.disabled = false;
      });
  });
})();
