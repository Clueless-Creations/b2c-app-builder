const $ = (selector) => document.querySelector(selector);
const objectData = JSON.parse($("#object-geometry").textContent);
const objects = new Map(objectData.objects.map((object) => [object.id, object]));
const STORAGE_KEY = "tuck.weekend.v1";
const BACKUP_KEY = "tuck.weekend.backup.v1";
const RECOVERY_KEY = "tuck.weekend.recovery.v1";
const defaults = () => ({
  version: 1,
  trip: {
    name: "Weekend by the sea",
    nights: 3,
    items: [
      ["tshirt", "A favorite T-shirt", 3],
      ["pants", "Everyday trousers", 1],
      ["socks", "Fresh socks", 3],
      ["washbag", "The little essentials", 1],
      ["charger", "Your charger", 1],
      ["book", "Something to read", 1],
    ].map(([objectId, name, quantity], index) => ({ id: `item-${index}`, objectId, name, quantity, packed: false })),
  },
});
let state = defaults();
let undoState;
let toastTimer;
let editingId;
let listMode = false;
let suppressClickUntil = 0;
let recoveryNeeded = false;
let recoveryKind;
let importRequest = 0;
function cancelImport() {
  importRequest += 1;
  $("#import-list").value = "";
}
function validateState(value) {
  const trip = value?.trip;
  if (
    value?.version !== 1 ||
    !trip ||
    typeof trip.name !== "string" ||
    !trip.name.trim() ||
    trip.name.length > 48 ||
    !Number.isInteger(trip.nights) ||
    trip.nights < 1 ||
    trip.nights > 30 ||
    !Array.isArray(trip.items) ||
    trip.items.length > 100
  )
    throw new Error("This file doesn’t look like a saved Tuck browser bag. The bag shown here is unchanged.");
  const ids = new Set();
  for (const item of trip.items) {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error("Something in this saved bag is unreadable. The bag shown here is unchanged.");
    if (
      typeof item.id !== "string" ||
      !item.id ||
      item.id.length > 80 ||
      ids.has(item.id) ||
      !objects.has(item.objectId) ||
      typeof item.name !== "string" ||
      !item.name.trim() ||
      item.name.length > 40 ||
      !Number.isInteger(item.quantity) ||
      item.quantity < 1 ||
      item.quantity > 20 ||
      typeof item.packed !== "boolean"
    )
      throw new Error("Something in this saved bag is unreadable. The bag shown here is unchanged.");
    ids.add(item.id);
  }
  return {
    version: 1,
    trip: {
      name: trip.name.trim(),
      nights: trip.nights,
      items: trip.items.map(({ id, objectId, name, quantity, packed }) => ({ id, objectId, name: name.trim(), quantity, packed })),
    },
  };
}
function showMessage(text, allowUndo = false, persistent = false) {
  clearTimeout(toastTimer);
  $("#status-message span").textContent = text;
  $("#undo").hidden = !allowUndo;
  $("#status-message").hidden = false;
  if (!persistent)
    toastTimer = setTimeout(
      () => {
        $("#status-message").hidden = true;
      },
      allowUndo ? 10000 : 6500,
    );
}
function recoveryPresentation() {
  switch (recoveryKind) {
    case "corrupt":
      return {
        notice: "Tuck couldn’t open this saved bag. The bag shown here has not been saved.",
        detail:
          "This browser’s saved bag could not be opened. Its unreadable data remains in this browser. Restore a previous bag, import a saved copy, or begin again. Starting fresh keeps the unreadable data separately on this device.",
        startLabel: "Keep the unreadable save and start fresh",
        startMessage: "A fresh bag is ready. Your unreadable save is kept separately.",
      };
    case "read":
      return {
        notice: "Tuck couldn’t read browser storage. The bag shown here has not been saved.",
        detail:
          "Tuck could not read browser storage, so it cannot confirm whether an earlier bag or backup is available. The bag shown here has not been saved. Check browser access, import a saved copy, restore a previous bag if storage becomes available, or try saving this fresh bag again.",
        startLabel: "Try saving this fresh bag again",
        startMessage: "A fresh bag is ready and saved on this device.",
      };
    case "write":
      return {
        notice: "Tuck couldn’t save the starter bag. The bag shown here has not been saved.",
        detail:
          "Tuck could read browser storage but could not save the starter bag. No current saved bag was found. Free space or allow storage, then import a saved copy, restore a previous bag if one is available, or try saving this fresh bag again.",
        startLabel: "Try saving this fresh bag again",
        startMessage: "A fresh bag is ready and saved on this device.",
      };
    default:
      return {
        notice: "Browser storage needs attention. The bag shown here may not be saved.",
        detail: "Browser storage needs attention. Check storage access, import a saved copy, or try again.",
        startLabel: "Try saving this fresh bag again",
        startMessage: "A fresh bag is ready and saved on this device.",
      };
  }
}
function commit(next, message, undoable = true, recovering = false) {
  if (recoveryNeeded && !recovering) {
    openData();
    showMessage("Open recovery options before making changes to the bag shown here.", false, true);
    return false;
  }
  let previousBackup;
  let changedBackup = false;
  try {
    next = validateState(next);
    const current = localStorage.getItem(STORAGE_KEY);
    if (current) {
      let validCurrent = false;
      try {
        validateState(JSON.parse(current));
        validCurrent = true;
      } catch {
        /* Preserve unreadable data separately. */
      }
      if (validCurrent) {
        previousBackup = localStorage.getItem(BACKUP_KEY);
        localStorage.setItem(BACKUP_KEY, current);
        changedBackup = true;
      } else {
        localStorage.setItem(RECOVERY_KEY, current);
      }
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    if (changedBackup) {
      try {
        if (previousBackup === null) localStorage.removeItem(BACKUP_KEY);
        else localStorage.setItem(BACKUP_KEY, previousBackup);
      } catch {
        // The current primary is still intact. Do not claim the backup was restored.
        $("#save-status").textContent = "Couldn’t save on this device";
        showMessage("The bag shown here is unchanged, but browser storage could not restore its previous copy. Save a copy from Your data stays yours.", false, true);
        return false;
      }
    }
    $("#save-status").textContent = "Couldn’t save on this device";
    showMessage("Couldn’t save. Your bag is unchanged. Check browser storage and try again.", false, true);
    return false;
  }
  undoState = undoable && !recoveryNeeded ? structuredClone(state) : undefined;
  recoveryNeeded = false;
  recoveryKind = undefined;
  state = next;
  cancelImport();
  render();
  if (message) showMessage(message, Boolean(undoState));
  return true;
}
function svgFor(id) {
  const object = objects.get(id);
  if (!object) return "";
  return `<svg viewBox="0 0 ${object.width} ${object.height}" aria-hidden="true" focusable="false">${object.layers.map((layer) => `<path d="${layer.commands.map((command) => command.type + command.values.join(" ")).join(" ")}" fill="${layer.fill}"${layer.stroke ? ` stroke="${layer.stroke}" stroke-width="${layer.strokeWidth ?? 2}" stroke-linecap="round" stroke-linejoin="round"` : ""}/>`).join("")}</svg>`;
}
function togglePacked(id) {
  const next = structuredClone(state);
  const item = next.trip.items.find((entry) => entry.id === id);
  if (!item) return;
  item.packed = !item.packed;
  if (commit(next, item.packed ? `${item.name}, tucked away.` : `${item.name}, back on the table.`)) {
    const zone = $("#bag-zone");
    zone.classList.remove("packed-pulse");
    requestAnimationFrame(() => zone.classList.add("packed-pulse"));
    document.querySelector(`[data-item-id="${CSS.escape(id)}"] .pack-item`)?.focus({ preventScroll: true });
  }
}
function render() {
  const { trip } = state;
  const packed = trip.items.filter((item) => item.packed);
  $("#trip-name").textContent = trip.name;
  $("#trip-details").textContent = `${trip.nights} ${trip.nights === 1 ? "night" : "nights"} · a little reset`;
  $("#progress-label").textContent = `${packed.length} of ${trip.items.length} packed`;
  $("#nav-count").textContent = `${packed.length}/${trip.items.length}`;
  const progress = $(".packing-progress");
  progress.setAttribute("aria-valuemax", String(trip.items.length || 1));
  progress.setAttribute("aria-valuenow", String(packed.length));
  $("#progress-fill").style.width = `${trip.items.length ? (packed.length / trip.items.length) * 100 : 0}%`;
  const items = $("#items");
  items.replaceChildren();
  items.classList.toggle("list-mode", listMode);
  for (const item of trip.items) {
    const row = document.createElement("div");
    row.className = `item${item.packed ? " packed" : ""}`;
    row.dataset.itemId = item.id;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "pack-item";
    button.setAttribute("aria-label", `${item.packed ? "Unpack" : "Pack"} ${item.name}, quantity ${item.quantity}`);
    button.setAttribute("aria-pressed", String(item.packed));
    button.innerHTML = svgFor(item.objectId);
    const label = document.createElement("span");
    label.textContent = item.name;
    button.append(label);
    if (item.quantity > 1) {
      const qty = document.createElement("span");
      qty.className = "quantity";
      qty.textContent = `×${item.quantity}`;
      qty.setAttribute("aria-hidden", "true");
      button.append(qty);
    }
    button.addEventListener("click", () => {
      if (Date.now() > suppressClickUntil) togglePacked(item.id);
    });
    button.addEventListener("pointerdown", (event) => startDrag(event, item, button));
    const edit = document.createElement("button");
    edit.type = "button";
    edit.className = "edit-item";
    edit.textContent = "✎";
    edit.setAttribute("aria-label", `Edit ${item.name}`);
    edit.addEventListener("click", () => openItem(item));
    row.append(button, edit);
    items.append(row);
  }
  if (!trip.items.length) {
    const empty = document.createElement("p");
    empty.className = "static-list";
    empty.textContent = "A fresh table. Add the first thing you want to bring.";
    items.append(empty);
  }
  const complete = trip.items.length > 0 && packed.length === trip.items.length;
  $("#completion").hidden = !complete;
  $("#bag-caption").textContent = complete
    ? "Good to go."
    : packed.length
      ? `${packed.length} little ${packed.length === 1 ? "thing" : "things"}, taken care of.`
      : "A little space for everything.";
  $("#bag-tag-text").innerHTML = complete ? "GOOD<br>TO GO" : "A LITTLE<br>GETAWAY";
  $("#table-instruction").textContent = listMode
    ? "Check a thing when it’s in your bag."
    : complete
      ? "All packed. Tap a thing to take it back out."
      : "Tap a thing to pack it. Or drag it into your bag.";
  $("#packed-pile").innerHTML = packed
    .slice(-4)
    .map((item, i) => svgFor(item.objectId).replace("<svg ", `<svg style="transform:translateX(${(i - 1.5) * 22 - 25}px) rotate(${(i - 1.5) * 13}deg)" `))
    .join("");
  $("#save-status").textContent = recoveryNeeded ? "Browser storage needs attention" : "Saved on this device";
  if (recoveryNeeded) $("#recovery-notice-copy").textContent = recoveryPresentation().notice;
  $("#recovery-notice").hidden = !recoveryNeeded;
  $("#reset-bag").disabled = packed.length === 0;
}
function startDrag(event, item, button) {
  if (event.button !== 0 || item.packed || listMode) return;
  const origin = { x: event.clientX, y: event.clientY };
  let proxy;
  let didDrag = false;
  const move = (moveEvent) => {
    if (!didDrag && Math.hypot(moveEvent.clientX - origin.x, moveEvent.clientY - origin.y) < 10) return;
    if (!didDrag) {
      didDrag = true;
      button.setPointerCapture(event.pointerId);
      proxy = document.createElement("div");
      proxy.className = "drag-proxy";
      proxy.innerHTML = svgFor(item.objectId);
      document.body.append(proxy);
      button.style.opacity = ".25";
    }
    proxy.style.left = `${moveEvent.clientX - 48}px`;
    proxy.style.top = `${moveEvent.clientY - 48}px`;
    const rect = $("#bag-zone").getBoundingClientRect();
    $("#bag-zone").classList.toggle(
      "drag-over",
      moveEvent.clientX >= rect.left && moveEvent.clientX <= rect.right && moveEvent.clientY >= rect.top && moveEvent.clientY <= rect.bottom,
    );
  };
  const finish = (finishEvent) => {
    button.removeEventListener("pointermove", move);
    button.removeEventListener("pointerup", finish);
    button.removeEventListener("pointercancel", cancel);
    button.style.opacity = "";
    proxy?.remove();
    const inside = $("#bag-zone").classList.contains("drag-over");
    $("#bag-zone").classList.remove("drag-over");
    if (didDrag) {
      suppressClickUntil = Date.now() + 400;
      if (inside && finishEvent.type === "pointerup") togglePacked(item.id);
      else showMessage(`${item.name} is still on the table.`);
    }
  };
  const cancel = (cancelEvent) => finish(cancelEvent);
  button.addEventListener("pointermove", move);
  button.addEventListener("pointerup", finish);
  button.addEventListener("pointercancel", cancel);
}
function openItem(item) {
  editingId = item?.id;
  $("#item-title").textContent = item ? "Every little detail." : "Room for one more.";
  $("#item-input").value = item?.name ?? "";
  $("#quantity-input").value = String(item?.quantity ?? 1);
  $("#object-input").value = item?.objectId ?? "sweater";
  $("#item-error").hidden = true;
  $("#delete-item").hidden = !item;
  $("#item-form button[type=submit]").textContent = item ? "Save this thing" : "Add to your list";
  $("#item-dialog").showModal();
}
function exportList() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "tuck-weekend-bag.json";
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showMessage("Your bag is ready to keep.");
}
function openData() {
  $("#import-error").hidden = true;
  $("#recovery-actions").hidden = !recoveryNeeded;
  $("#data-export").disabled = recoveryNeeded;
  if (recoveryNeeded) {
    const presentation = recoveryPresentation();
    $("#recovery-copy").textContent = presentation.detail;
    $("#start-fresh").textContent = presentation.startLabel;
  }
  $("#data-dialog").showModal();
}
$("#edit-trip").addEventListener("click", () => {
  $("#trip-input").value = state.trip.name;
  $("#nights-input").value = String(state.trip.nights);
  $("#trip-error").hidden = true;
  $("#edit-dialog").showModal();
});
$("#edit-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const name = $("#trip-input").value.trim();
  const nights = Number($("#nights-input").value);
  if (!name || !Number.isInteger(nights) || nights < 1 || nights > 30) {
    $("#trip-error").textContent = "Give your trip a name and choose 1–30 nights away.";
    $("#trip-error").hidden = false;
    return;
  }
  const next = structuredClone(state);
  next.trip.name = name;
  next.trip.nights = nights;
  if (commit(next, "Your trip, just right.")) $("#edit-dialog").close();
});
$("#add-item").addEventListener("click", () => openItem());
$("#item-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const name = $("#item-input").value.trim();
  const quantity = Number($("#quantity-input").value);
  const error = $("#item-error");
  if (!name || !Number.isInteger(quantity) || quantity < 1 || quantity > 20) {
    error.textContent = "Add a name and choose a quantity from 1 to 20.";
    error.hidden = false;
    return;
  }
  if (state.trip.items.some((item) => item.id !== editingId && item.name.toLowerCase() === name.toLowerCase())) {
    error.textContent = "That’s already on your list. Edit its quantity instead.";
    error.hidden = false;
    return;
  }
  if (!editingId && state.trip.items.length >= 100) {
    error.textContent = "There are already 100 things in this bag. Edit a quantity or remove something first.";
    error.hidden = false;
    return;
  }
  const next = structuredClone(state);
  const existing = next.trip.items.find((item) => item.id === editingId);
  if (existing) {
    existing.name = name;
    existing.quantity = quantity;
    existing.objectId = $("#object-input").value;
  } else next.trip.items.push({ id: crypto.randomUUID(), name, quantity, objectId: $("#object-input").value, packed: false });
  if (commit(next, editingId ? "That detail is saved." : `${name}, on your list.`)) {
    $("#item-dialog").close();
    const savedItem = state.trip.items.find((item) => item.name === name);
    document.querySelector(`[data-item-id="${CSS.escape(savedItem.id)}"] .pack-item`)?.focus({ preventScroll: true });
  }
});
$("#delete-item").addEventListener("click", () => {
  const next = structuredClone(state);
  const item = next.trip.items.find((entry) => entry.id === editingId);
  next.trip.items = next.trip.items.filter((entry) => entry.id !== editingId);
  if (commit(next, `${item?.name ?? "That thing"}, off the list.`)) {
    $("#item-dialog").close();
    $("#add-item").focus({ preventScroll: true });
  }
});
$("#table-view").addEventListener("click", () => {
  listMode = false;
  $("#table-view").classList.add("selected");
  $("#list-view").classList.remove("selected");
  $("#table-view").setAttribute("aria-pressed", "true");
  $("#list-view").setAttribute("aria-pressed", "false");
  render();
});
$("#list-view").addEventListener("click", () => {
  listMode = true;
  $("#list-view").classList.add("selected");
  $("#table-view").classList.remove("selected");
  $("#list-view").setAttribute("aria-pressed", "true");
  $("#table-view").setAttribute("aria-pressed", "false");
  render();
});
$("#undo").addEventListener("click", () => {
  if (undoState && commit(undoState, "Right back where it was.", false)) $("#packing").focus({ preventScroll: true });
});
$("#reset-bag").addEventListener("click", () => $("#reset-dialog").showModal());
$("#confirm-reset").addEventListener("click", () => {
  const next = structuredClone(state);
  next.trip.items.forEach((item) => (item.packed = false));
  if (commit(next, "Your things are back on the table.")) $("#reset-dialog").close();
});
$("#export-list").addEventListener("click", exportList);
$("#data-export").addEventListener("click", exportList);
$("#data-info").addEventListener("click", openData);
$("#open-recovery").addEventListener("click", openData);
$("#data-dialog").addEventListener("close", cancelImport);
$("#data-dialog").addEventListener("cancel", cancelImport);
$("#import-list").addEventListener("change", async (event) => {
  const request = ++importRequest;
  const file = event.target.files[0];
  if (!file) return;
  try {
    if (file.size > 128 * 1024) throw new Error("That file is too large to be a Tuck browser bag.");
    const contents = await file.text();
    if (request !== importRequest) return;
    const next = validateState(JSON.parse(contents));
    if (commit(next, "Your saved bag is back.", true, true)) {
      $("#import-error").hidden = true;
      $("#data-dialog").close();
    }
  } catch (error) {
    if (request !== importRequest) return;
    $("#import-error").textContent =
      error instanceof SyntaxError ? "That file couldn’t be read. Choose a Tuck browser bag saved as JSON. The bag shown here is unchanged." : error.message;
    $("#import-error").hidden = false;
  } finally {
    if (request === importRequest) event.target.value = "";
  }
});
$("#restore-backup").addEventListener("click", () => {
  cancelImport();
  try {
    const saved = localStorage.getItem(BACKUP_KEY);
    if (!saved) throw new Error("No previous bag is saved on this browser yet.");
    const previous = validateState(JSON.parse(saved));
    if (commit(previous, "Your previous bag is back.", true, true)) $("#data-dialog").close();
  } catch (error) {
    $("#import-error").textContent = "That previous bag couldn’t be restored. The bag shown here is unchanged. Check browser storage or import a saved copy.";
    $("#import-error").hidden = false;
  }
});
$("#start-fresh").addEventListener("click", () => {
  cancelImport();
  const message = recoveryPresentation().startMessage;
  if (commit(defaults(), message, false, true)) $("#data-dialog").close();
});
for (const button of document.querySelectorAll(".close-dialog")) button.addEventListener("click", () => button.closest("dialog").close());
for (const dialog of document.querySelectorAll("dialog"))
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) {
      const rect = dialog.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
    }
  });
let startupError;
let saved;
try {
  saved = localStorage.getItem(STORAGE_KEY);
} catch {
  recoveryNeeded = true;
  recoveryKind = "read";
  startupError = "Tuck couldn’t read browser storage. The bag shown here has not been saved. Open recovery options to continue.";
}
if (!startupError && saved) {
  try {
    state = validateState(JSON.parse(saved));
  } catch {
    recoveryNeeded = true;
    recoveryKind = "corrupt";
    startupError = "Your saved bag couldn’t be opened. Its unreadable data remains in this browser. The bag shown here has not been saved. Open recovery options to continue.";
  }
} else if (!startupError) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    recoveryNeeded = true;
    recoveryKind = "write";
    startupError = "Tuck couldn’t save the starter bag. The bag shown here has not been saved. Open recovery options to try again.";
  }
}
document.documentElement.classList.add("enhanced");
render();
if (startupError) {
  showMessage(startupError, false, true);
}
