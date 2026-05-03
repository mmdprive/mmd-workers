(function () {
  "use strict";

  var instance = null;

  function toArray(list) {
    return Array.prototype.slice.call(list || []);
  }

  function trim(value) {
    if (value === null || value === undefined) return "";
    return String(value).trim();
  }

  function find(root, selector) {
    return root.querySelector(selector);
  }

  function findAll(root, selector) {
    return toArray(root.querySelectorAll(selector));
  }

  function currentDate() {
    return new Date();
  }

  function formatDate(date) {
    try {
      return new Intl.DateTimeFormat("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric"
      }).format(date);
    } catch (_error) {
      return date.toISOString().slice(0, 10);
    }
  }

  function formatTime(date) {
    try {
      return new Intl.DateTimeFormat("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false
      }).format(date);
    } catch (_error) {
      return date.toTimeString().slice(0, 5);
    }
  }

  function formatStamp(date) {
    return formatDate(date) + " · " + formatTime(date);
  }

  function readSignedRef(root) {
    var params = new URLSearchParams(window.location.search || "");
    return trim(root.getAttribute("data-signed-ref")) || trim(params.get("t"));
  }

  function mapTimelineActionToEvent(action) {
    if (action === "started") return "work_started";
    if (action === "finished") return "work_finished";
    return action;
  }

  function deriveAvailability(state) {
    if (state.sessionStatus === "on_the_way") return "กำลังเดินทาง";
    if (state.sessionStatus === "arrived") return "ถึงจุดนัดหมาย";
    if (state.sessionStatus === "met") return "พบลูกค้าแล้ว";
    if (state.sessionStatus === "started") return "In session";
    if (state.sessionStatus === "finished") return "Wrap up";
    if (state.sessionStatus === "separated") return "Separated";
    if (state.liveOn) return "Live tracking on";
    return "พร้อมรับคำสั่ง";
  }

  function deriveTravel(state) {
    if (state.sessionStatus === "on_the_way") return "Live route active";
    if (state.sessionStatus === "arrived") return "Arrived on site";
    if (state.sessionStatus === "met") return "Client contact made";
    if (state.sessionStatus === "started") return "Session started";
    if (state.sessionStatus === "finished") return "Session wrapped";
    if (state.sessionStatus === "separated") return "Departure complete";
    if (state.liveOn) return "Tracking enabled";
    return "Awaiting route";
  }

  function derivePayment(state) {
    if (state.sessionStatus === "started") return "Payment gate cleared";
    if (state.sessionStatus === "finished") return "Review before payout";
    if (state.sessionStatus === "separated") return "Payout handoff pending";
    return "Payment gate pending";
  }

  function derivePayout(state) {
    if (state.sessionStatus === "finished") return "Review pending";
    if (state.sessionStatus === "separated") return "Pending release";
    return "Awaiting release";
  }

  function deriveFinishIntel(state) {
    if (state.sessionStatus === "finished" || state.sessionStatus === "separated") {
      return "Closeout ready. Keep notes short, factual, and review-safe.";
    }
    return "Finish in console, then hand off to review-safe payout flow";
  }

  function collectElements(root) {
    return {
      root: root,
      headerLive: find(root, "[data-header-live]"),
      commandLabel: find(root, "[data-command-label]"),
      lastUpdate: find(root, "[data-last-update]"),
      availability: find(root, "[data-availability]"),
      visibility: find(root, "[data-visibility]"),
      gps: find(root, "[data-gps]"),
      payout: find(root, "[data-payout]"),
      sessionIdLabel: find(root, "[data-session-id-label]"),
      sessionStatus: find(root, "[data-session-status]"),
      etaDisplay: find(root, "[data-eta-display]"),
      etaInput: find(root, "[data-eta-input]"),
      briefSession: find(root, "[data-brief-session]"),
      briefStatus: find(root, "[data-brief-status]"),
      briefDate: find(root, "[data-brief-date]"),
      briefTime: find(root, "[data-brief-time]"),
      briefLocation: find(root, "[data-brief-location]"),
      briefTravel: find(root, "[data-brief-travel]"),
      briefPayment: find(root, "[data-brief-payment]"),
      openMap: find(root, "[data-open-map]"),
      saveState: find(root, "[data-save-state]"),
      surfaceNote: find(root, "[data-surface-note]"),
      intelFinish: find(root, "[data-intel-finish]"),
      timelineButtons: findAll(root, "[data-timeline-action]"),
      tabButtons: findAll(root, "[data-tab-target]"),
      tabPanels: findAll(root, "[data-tab-panel]"),
      rateInputs: findAll(root, "[data-rate-input]"),
      chipButtons: findAll(root, "[data-chip-group]"),
      budgetButtons: findAll(root, "[data-budget-level]"),
      startRouteButtons: findAll(root, "[data-action-start-route]"),
      arrivedButtons: findAll(root, "[data-action-arrived]"),
      liveOnButtons: findAll(root, "[data-action-live-on]"),
      liveOffButtons: findAll(root, "[data-action-live-off]"),
      sendEtaButtons: findAll(root, "[data-action-send-eta]"),
      notifyDelayButtons: findAll(root, "[data-action-notify-delay]"),
      saveProfileButton: find(root, "[data-action-save-profile]"),
      viewBriefButton: find(root, "[data-action-view-brief]"),
      utilityButtons: findAll(root, "[data-utility-action]")
    };
  }

  function createState(root, view) {
    var now = currentDate();

    return {
      sessionId: trim(root.getAttribute("data-session-id")) || "sess_preview",
      modelId: trim(root.getAttribute("data-model-id")) || "model_preview",
      signedRef: readSignedRef(root),
      workerBases: {
        events: trim(root.getAttribute("data-events-base")) || "/events-worker",
        realtime: trim(root.getAttribute("data-realtime-base")) || "/realtime-worker",
        admin: trim(root.getAttribute("data-admin-base")) || "/admin-worker",
        payments: trim(root.getAttribute("data-payments-base")) || "/payments-worker"
      },
      sessionStatus: trim(view.sessionStatus && view.sessionStatus.textContent) || "assigned",
      commandLabel: trim(view.commandLabel && view.commandLabel.textContent) || "Stand by",
      etaText: trim(view.etaDisplay && view.etaDisplay.textContent) || "รออัปเดต",
      lastUpdate: trim(view.lastUpdate && view.lastUpdate.textContent) || "ยังไม่มี",
      visibility: trim(view.visibility && view.visibility.textContent) || "Visible",
      location: trim(view.briefLocation && view.briefLocation.textContent) || "Sukhumvit / Private Lounge",
      dateLabel: trim(view.briefDate && view.briefDate.textContent) || formatDate(now),
      timeLabel: trim(view.briefTime && view.briefTime.textContent) || "20:30",
      budgetLevel: "Level 2 กลาง",
      activeTab: "public",
      liveOn: false,
      dirty: false,
      saved: true,
      note: readSignedRef(root)
        ? "Webflow surface ready. Signed reference t detected."
        : "Webflow surface ready. Signed reference uses t when present."
    };
  }

  function setText(node, value) {
    if (!node) return;
    node.textContent = value;
  }

  function setPressed(node, pressed) {
    if (!node) return;
    node.setAttribute("aria-pressed", pressed ? "true" : "false");
  }

  function setSelected(node, selected) {
    if (!node) return;
    node.setAttribute("aria-selected", selected ? "true" : "false");
  }

  function setLiveState(state, on) {
    state.liveOn = Boolean(on);
  }

  function updateTimestamp(state) {
    state.lastUpdate = formatStamp(currentDate());
  }

  function buildPayload(state, action, extra) {
    var payload = {
      action: action,
      event: mapTimelineActionToEvent(action),
      session_id: state.sessionId,
      model_id: state.modelId,
      t: state.signedRef || "",
      worker_bases: {
        events: state.workerBases.events,
        realtime: state.workerBases.realtime,
        admin: state.workerBases.admin,
        payments: state.workerBases.payments
      },
      source_surface: "webflow_model_console"
    };
    var key;

    if (!extra) return payload;

    for (key in extra) {
      if (Object.prototype.hasOwnProperty.call(extra, key)) {
        payload[key] = extra[key];
      }
    }

    return payload;
  }

  function logMock(action, payload) {
    if (typeof console !== "undefined" && console.log) {
      console.log("[MMDModelConsole]", action, payload);
    }
  }

  function readEtaInput(view) {
    return trim(view.etaInput && view.etaInput.value);
  }

  function updateMapLink(view, location) {
    if (!view.openMap) return;
    view.openMap.href = "https://maps.google.com/?q=" + encodeURIComponent(location || "");
  }

  function renderTabs(view, state) {
    var index;
    var button;
    var panel;

    for (index = 0; index < view.tabButtons.length; index += 1) {
      button = view.tabButtons[index];
      button.classList.toggle("is-active", button.getAttribute("data-tab-target") === state.activeTab);
      setSelected(button, button.getAttribute("data-tab-target") === state.activeTab);
    }

    for (index = 0; index < view.tabPanels.length; index += 1) {
      panel = view.tabPanels[index];
      panel.hidden = panel.getAttribute("data-tab-panel") !== state.activeTab;
    }
  }

  function renderTimeline(view, state) {
    var index;
    var button;

    for (index = 0; index < view.timelineButtons.length; index += 1) {
      button = view.timelineButtons[index];
      button.classList.toggle("is-active", button.getAttribute("data-timeline-action") === state.sessionStatus);
    }
  }

  function renderSurface(view, state) {
    var availability = deriveAvailability(state);
    var travel = deriveTravel(state);
    var payment = derivePayment(state);
    var payout = derivePayout(state);
    var finishIntel = deriveFinishIntel(state);
    var gpsLabel = state.liveOn ? "LIVE ON" : "LIVE OFF";
    var saveState = "saved";

    if (state.dirty) saveState = "dirty";
    if (!state.dirty && state.saved) saveState = "บันทึกแล้ว";

    state.rootClass = state.liveOn ? "is-live" : "";

    view.root.classList.toggle("is-live", state.liveOn);
    view.root.classList.toggle("is-dirty", state.dirty);
    view.root.classList.toggle("is-saved", !state.dirty && state.saved);

    if (view.headerLive) {
      view.headerLive.textContent = gpsLabel;
      view.headerLive.classList.toggle("is-live", state.liveOn);
      setPressed(view.headerLive, state.liveOn);
    }

    setText(view.commandLabel, state.commandLabel);
    setText(view.lastUpdate, state.lastUpdate);
    setText(view.availability, availability);
    setText(view.visibility, state.visibility);
    setText(view.gps, gpsLabel);
    setText(view.payout, payout);
    setText(view.sessionIdLabel, state.sessionId);
    setText(view.sessionStatus, state.sessionStatus);
    setText(view.etaDisplay, state.etaText);
    setText(view.briefSession, state.sessionId);
    setText(view.briefStatus, state.sessionStatus);
    setText(view.briefDate, state.dateLabel);
    setText(view.briefTime, state.timeLabel);
    setText(view.briefLocation, state.location);
    setText(view.briefTravel, travel);
    setText(view.briefPayment, payment);
    setText(view.saveState, saveState);
    setText(view.surfaceNote, state.note);
    setText(view.intelFinish, finishIntel);

    updateMapLink(view, state.location);
    renderTabs(view, state);
    renderTimeline(view, state);
  }

  function setNote(state, message) {
    state.note = message;
  }

  function markDirty(view, state) {
    state.dirty = true;
    state.saved = false;
    setNote(state, "Work profile has unsaved changes. Save stays on the experience layer for now.");
    renderSurface(view, state);
  }

  function collectChipGroup(view, groupName) {
    var values = [];
    var index;
    var button;

    for (index = 0; index < view.chipButtons.length; index += 1) {
      button = view.chipButtons[index];
      if (button.getAttribute("data-chip-group") === groupName && button.classList.contains("is-active")) {
        values.push(trim(button.getAttribute("data-chip-value")));
      }
    }

    return values;
  }

  function collectRates(view) {
    var rates = {};
    var index;
    var input;
    var name;

    for (index = 0; index < view.rateInputs.length; index += 1) {
      input = view.rateInputs[index];
      name = trim(input.getAttribute("data-rate-input"));
      rates[name] = trim(input.value);
    }

    return rates;
  }

  function collectWorkProfile() {
    if (!instance) return null;

    return {
      session_id: instance.state.sessionId,
      model_id: instance.state.modelId,
      t: instance.state.signedRef || "",
      source_surface: "webflow_model_console",
      worker_bases: {
        events: instance.state.workerBases.events,
        realtime: instance.state.workerBases.realtime,
        admin: instance.state.workerBases.admin,
        payments: instance.state.workerBases.payments
      },
      public_profile: {
        job: "งานมาตรฐาน 5 ชม.",
        minimum_rate: collectRates(instance.view).public_minimum_rate || "",
        standard_rate: collectRates(instance.view).public_standard_rate || "",
        mode: collectChipGroup(instance.view, "public_mode")
      },
      private_profile: {
        job: "งานมาตรฐาน 2 ชม.",
        accepts_2_to_5_hours: collectChipGroup(instance.view, "private_hours")[0] || "",
        pn_minimum_rate: collectRates(instance.view).pn_minimum_rate || "",
        pn_standard_rate: collectRates(instance.view).pn_standard_rate || "",
        vip_minimum_rate: collectRates(instance.view).vip_minimum_rate || "",
        vip_standard_rate: collectRates(instance.view).vip_standard_rate || ""
      },
      client_budget: instance.state.budgetLevel
    };
  }

  function saveWorkProfile() {
    if (!instance) return null;

    var payload = collectWorkProfile();

    updateTimestamp(instance.state);
    instance.state.dirty = false;
    instance.state.saved = true;
    setNote(instance.state, "Work profile saved locally. Ready for an admin-worker bridge when enabled.");
    renderSurface(instance.view, instance.state);
    logMock("save_work_profile", payload);
    return payload;
  }

  function setTimelineStatus(action) {
    if (!instance) return;

    instance.state.sessionStatus = action;
    instance.state.commandLabel = action;
    updateTimestamp(instance.state);
    setNote(instance.state, "Timeline status updated locally to " + action + ".");
    renderSurface(instance.view, instance.state);
    logMock("timeline_status", buildPayload(instance.state, action, {
      eta_text: instance.state.etaText
    }));
  }

  function startRoute() {
    if (!instance) return;

    var etaValue = readEtaInput(instance.view);

    setLiveState(instance.state, true);
    instance.state.sessionStatus = "on_the_way";
    instance.state.commandLabel = "Route started";
    instance.state.etaText = etaValue || "ETA live";
    updateTimestamp(instance.state);
    setNote(instance.state, "Start route updated locally. Bridge to events-worker can be added later through a safe facade.");
    renderSurface(instance.view, instance.state);
    logMock("start_route", buildPayload(instance.state, "on_the_way", {
      eta_text: instance.state.etaText,
      live_on: true
    }));
  }

  function arrived() {
    if (!instance) return;

    instance.state.sessionStatus = "arrived";
    instance.state.commandLabel = "Arrived";
    if (!readEtaInput(instance.view)) {
      instance.state.etaText = "Arrived on site";
    }
    updateTimestamp(instance.state);
    setNote(instance.state, "Arrival updated locally. No production endpoints were called.");
    renderSurface(instance.view, instance.state);
    logMock("arrived", buildPayload(instance.state, "arrived", {
      eta_text: instance.state.etaText
    }));
  }

  function setLive(on) {
    if (!instance) return;

    setLiveState(instance.state, on);
    updateTimestamp(instance.state);
    setNote(
      instance.state,
      instance.state.liveOn
        ? "Live location toggled on locally. Realtime bridge stays separate."
        : "Live location toggled off locally. No realtime-worker call was made."
    );
    renderSurface(instance.view, instance.state);
    logMock("set_live", buildPayload(instance.state, "set_live", {
      live_on: instance.state.liveOn,
      eta_text: instance.state.etaText
    }));
  }

  function sendEta() {
    if (!instance) return;

    var etaValue = readEtaInput(instance.view);

    instance.state.etaText = etaValue || instance.state.etaText || "ETA sent";
    updateTimestamp(instance.state);
    setNote(instance.state, "ETA updated locally. Safe bridge can send this through realtime-worker later.");
    renderSurface(instance.view, instance.state);
    logMock("send_eta", buildPayload(instance.state, "send_eta", {
      eta_text: instance.state.etaText,
      live_on: instance.state.liveOn
    }));
  }

  function notifyDelay() {
    if (!instance) return;

    var etaValue = readEtaInput(instance.view);

    instance.state.etaText = etaValue ? "Delayed · " + etaValue : "Delayed · updating ETA";
    updateTimestamp(instance.state);
    instance.state.commandLabel = "Delay notified";
    setNote(instance.state, "Delay notice updated locally. Surface remains mock-safe.");
    renderSurface(instance.view, instance.state);
    logMock("notify_delay", buildPayload(instance.state, "notify_delay", {
      eta_text: instance.state.etaText
    }));
  }

  function activateTab(view, state, tabName) {
    state.activeTab = tabName;
    renderSurface(view, state);
  }

  function handleChipClick(view, state, button) {
    var groupName = trim(button.getAttribute("data-chip-group"));
    var singleSelect = button.getAttribute("data-chip-single") === "true";
    var groupButtons = findAll(view.root, '[data-chip-group="' + groupName + '"]');
    var index;

    if (singleSelect) {
      for (index = 0; index < groupButtons.length; index += 1) {
        groupButtons[index].classList.remove("is-active");
        setPressed(groupButtons[index], false);
      }
      button.classList.add("is-active");
      setPressed(button, true);
    } else {
      button.classList.toggle("is-active");
      setPressed(button, button.classList.contains("is-active"));
    }

    markDirty(view, state);
  }

  function handleBudgetClick(view, state, button) {
    var index;

    for (index = 0; index < view.budgetButtons.length; index += 1) {
      view.budgetButtons[index].classList.remove("is-active");
      setPressed(view.budgetButtons[index], false);
    }

    button.classList.add("is-active");
    setPressed(button, true);
    state.budgetLevel = trim(button.getAttribute("data-budget-level"));
    markDirty(view, state);
  }

  function handleUtility(view, state, action) {
    updateTimestamp(state);
    setNote(state, action + " action prepared locally. Keep final writes behind the correct worker boundary.");
    renderSurface(view, state);
    logMock("utility_action", buildPayload(state, action, {
      utility: action
    }));
  }

  function bindEvents(view, state) {
    var index;
    var button;

    for (index = 0; index < view.startRouteButtons.length; index += 1) {
      view.startRouteButtons[index].addEventListener("click", startRoute);
    }

    for (index = 0; index < view.arrivedButtons.length; index += 1) {
      view.arrivedButtons[index].addEventListener("click", arrived);
    }

    for (index = 0; index < view.liveOnButtons.length; index += 1) {
      view.liveOnButtons[index].addEventListener("click", function () {
        setLive(true);
      });
    }

    for (index = 0; index < view.liveOffButtons.length; index += 1) {
      view.liveOffButtons[index].addEventListener("click", function () {
        setLive(false);
      });
    }

    for (index = 0; index < view.sendEtaButtons.length; index += 1) {
      view.sendEtaButtons[index].addEventListener("click", sendEta);
    }

    for (index = 0; index < view.notifyDelayButtons.length; index += 1) {
      view.notifyDelayButtons[index].addEventListener("click", notifyDelay);
    }

    if (view.headerLive) {
      view.headerLive.addEventListener("click", function () {
        setLive(!state.liveOn);
      });
    }

    for (index = 0; index < view.timelineButtons.length; index += 1) {
      button = view.timelineButtons[index];
      button.addEventListener("click", function (event) {
        setTimelineStatus(event.currentTarget.getAttribute("data-timeline-action"));
      });
    }

    for (index = 0; index < view.tabButtons.length; index += 1) {
      button = view.tabButtons[index];
      button.addEventListener("click", function (event) {
        activateTab(view, state, event.currentTarget.getAttribute("data-tab-target"));
      });
    }

    for (index = 0; index < view.rateInputs.length; index += 1) {
      view.rateInputs[index].addEventListener("input", function () {
        markDirty(view, state);
      });
    }

    for (index = 0; index < view.chipButtons.length; index += 1) {
      button = view.chipButtons[index];
      button.addEventListener("click", function (event) {
        handleChipClick(view, state, event.currentTarget);
      });
    }

    for (index = 0; index < view.budgetButtons.length; index += 1) {
      button = view.budgetButtons[index];
      button.addEventListener("click", function (event) {
        handleBudgetClick(view, state, event.currentTarget);
      });
    }

    if (view.saveProfileButton) {
      view.saveProfileButton.addEventListener("click", saveWorkProfile);
    }

    if (view.viewBriefButton) {
      view.viewBriefButton.addEventListener("click", function () {
        updateTimestamp(state);
        setNote(state, "Full brief preview opened locally. Keep assistant reads on the experience layer.");
        renderSurface(view, state);
        logMock("view_full_brief", buildPayload(state, "view_full_brief", {
          session_status: state.sessionStatus
        }));
      });
    }

    for (index = 0; index < view.utilityButtons.length; index += 1) {
      button = view.utilityButtons[index];
      button.addEventListener("click", function (event) {
        handleUtility(view, state, event.currentTarget.getAttribute("data-utility-action"));
      });
    }
  }

  function init() {
    var root = document.getElementById("mmd-model-console");
    var view;
    var state;

    if (!root) return null;

    view = collectElements(root);
    state = createState(root, view);

    instance = {
      root: root,
      view: view,
      state: state
    };

    bindEvents(view, state);
    renderSurface(view, state);
    return instance;
  }

  window.MMDModelConsole = {
    init: init,
    startRoute: startRoute,
    arrived: arrived,
    setLive: setLive,
    sendEta: sendEta,
    notifyDelay: notifyDelay,
    collectWorkProfile: collectWorkProfile
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
