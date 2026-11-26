/* Contact form → Formspree (AJAX, stays on the page).
   Without JS the form still posts normally to the action URL. */
(function () {
  "use strict";
  var form = document.getElementById("contactForm");
  if (!form || !window.fetch) return;

  var status = form.querySelector(".cf-status");
  var btn = form.querySelector('button[type="submit"]');
  var btnText = btn ? btn.querySelector(".text-caption") : null;
  var btnLabel = btnText ? btnText.textContent : "";
  var REQUIRED_SELECTS = ["interest"];

  form.setAttribute("novalidate", "");

  function say(msg, isError) {
    if (!status) return;
    status.textContent = msg;
    status.classList.toggle("is-error", !!isError);
  }

  // Copy each custom dropdown's chosen option into its hidden input.
  function syncSelects() {
    form.querySelectorAll("[data-cf-select]").forEach(function (input) {
      var dd = form.querySelector('.nice-select[data-cf-for="' + input.name + '"]');
      var opt = dd && dd.querySelector(".option.selected:not(.disabled)");
      input.value = opt ? opt.textContent.trim() : "";
    });
  }

  function clearInvalid(el) {
    var host = el.closest(".tf-field, .nice-select");
    if (host) host.classList.remove("cf-invalid");
  }

  form.addEventListener("input", function (e) { clearInvalid(e.target); });
  form.addEventListener("click", function (e) {
    var opt = e.target.closest(".nice-select .option");
    if (opt && !opt.classList.contains("disabled")) {
      opt.closest(".nice-select").classList.remove("cf-invalid");
    }
  });

  function validate() {
    var firstBad = null, msg = "";
    form.querySelectorAll(".tf-input[required]").forEach(function (input) {
      var ok = input.value.trim() !== "" && input.checkValidity();
      input.closest(".tf-field").classList.toggle("cf-invalid", !ok);
      if (!ok && !firstBad) {
        firstBad = input;
        msg = input.type === "email" && input.value.trim() ? "Please enter a valid email address." : "Please fill in the required fields.";
      }
    });
    REQUIRED_SELECTS.forEach(function (name) {
      var input = form.querySelector('[data-cf-select="' + name + '"]');
      var dd = form.querySelector('.nice-select[data-cf-for="' + name + '"]');
      var ok = input && input.value !== "";
      if (dd) dd.classList.toggle("cf-invalid", !ok);
      if (!ok && !firstBad) { firstBad = dd; msg = "Please choose what you're interested in."; }
    });
    if (firstBad) {
      say(msg, true);
      if (firstBad.focus) firstBad.focus({ preventScroll: true });
    }
    return !firstBad;
  }

  function resetSelects() {
    form.querySelectorAll(".nice-select[data-cf-for]").forEach(function (dd) {
      var first = dd.querySelector(".option");
      dd.querySelectorAll(".option.selected").forEach(function (o) { o.classList.remove("selected"); });
      var cur = dd.querySelector(".current");
      if (cur && dd.dataset.cfDefault) cur.textContent = dd.dataset.cfDefault;
      if (first) first.classList.add("selected");
    });
  }
  form.querySelectorAll(".nice-select[data-cf-for]").forEach(function (dd) {
    var cur = dd.querySelector(".current");
    if (cur) dd.dataset.cfDefault = cur.textContent.trim();
  });

  function busy(on) {
    if (!btn) return;
    btn.disabled = on;
    if (btnText) btnText.textContent = on ? "SENDING…" : btnLabel;
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    syncSelects();
    if (!validate()) return;
    busy(true);
    say("");
    fetch(form.action, {
      method: "POST",
      body: new FormData(form),
      headers: { Accept: "application/json" }
    })
      .then(function (res) {
        if (res.ok) {
          form.reset();
          resetSelects();
          say("Thanks — your message has been sent. I'll get back to you soon.");
          return;
        }
        return res.json().catch(function () { return {}; }).then(function (data) {
          var errs = data && data.errors;
          say(errs && errs.length ? errs.map(function (x) { return x.message; }).join(" ") : "Something went wrong. Please try again, or email me directly.", true);
        });
      })
      .catch(function () {
        say("Network error — please check your connection and try again.", true);
      })
      .then(function () { busy(false); });
  });
})();
