(() => {
  "use strict";

  /**
   * TaskFlow — Kanban simple con LocalStorage
   * - CRUD de tareas
   * - Drag & drop entre columnas
   * - Búsqueda y filtro por prioridad
   */

  /**
   * @typedef {"todo"|"doing"|"done"} Status
   * @typedef {"low"|"medium"|"high"} Priority
   * @typedef {{ id:string, title:string, priority:Priority, status:Status, createdAt:number }} Task
   */

  const STORAGE_KEY = "taskflow.tasks.v1";

  // --- DOM ---
  const taskForm = document.querySelector("#taskForm");
  const titleInput = document.querySelector("#title");
  const prioritySelect = document.querySelector("#priority");
  const searchInput = document.querySelector("#search");
  const filterPriority = document.querySelector("#filterPriority");
  const clearAllBtn = document.querySelector("#clearAll");

  const dropzones = {
    todo: document.querySelector('[data-dropzone="todo"]'),
    doing: document.querySelector('[data-dropzone="doing"]'),
    done: document.querySelector('[data-dropzone="done"]'),
  };

  /** @type {Task[]} */
  let tasks = loadTasks();

  // Init
  render();

  // --- Events ---
  taskForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const title = titleInput.value.trim();
    const priority = /** @type {Priority} */ (prioritySelect.value);
    if (!title) return;

    addTask({ title, priority });
    taskForm.reset();
    titleInput.focus();
  });

  searchInput.addEventListener("input", render);
  filterPriority.addEventListener("change", render);

  clearAllBtn.addEventListener("click", () => {
    const ok = confirm("¿Borrar todas las tareas? Esta acción no se puede deshacer.");
    if (!ok) return;
    tasks = [];
    saveTasks(tasks);
    render();
  });

  // Drag & drop
  Object.entries(dropzones).forEach(([status, zone]) => {
    zone.addEventListener("dragover", (e) => {
      e.preventDefault();
      zone.classList.add("is-over");
    });
    zone.addEventListener("dragleave", () => zone.classList.remove("is-over"));
    zone.addEventListener("drop", (e) => {
      e.preventDefault();
      zone.classList.remove("is-over");

      const taskId = e.dataTransfer?.getData("text/task-id");
      if (!taskId) return;

      moveTask(taskId, /** @type {Status} */ (status));
    });
  });

  // --- CRUD ---
  function addTask(input) {
    /** @type {Task} */
    const newTask = {
      id: crypto.randomUUID(),
      title: input.title,
      priority: input.priority,
      status: "todo",
      createdAt: Date.now(),
    };

    tasks = [newTask, ...tasks];
    saveTasks(tasks);
    render();
  }

  function deleteTask(id) {
    tasks = tasks.filter((t) => t.id !== id);
    saveTasks(tasks);
    render();
  }

  function editTaskTitle(id, nextTitle) {
    const cleaned = nextTitle.trim();
    if (!cleaned) return;
    tasks = tasks.map((t) => (t.id === id ? { ...t, title: cleaned } : t));
    saveTasks(tasks);
    render();
  }

  function moveTask(id, nextStatus) {
    tasks = tasks.map((t) => (t.id === id ? { ...t, status: nextStatus } : t));
    saveTasks(tasks);
    render();
  }

  // --- Render ---
  function render() {
    Object.values(dropzones).forEach((z) => (z.innerHTML = ""));

    const q = searchInput.value.trim().toLowerCase();
    const priorityFilter = filterPriority.value;

    const visible = tasks.filter((t) => {
      const matchesQuery = !q || t.title.toLowerCase().includes(q);
      const matchesPriority = priorityFilter === "all" || t.priority === priorityFilter;
      return matchesQuery && matchesPriority;
    });

    const byStatus = groupBy(visible, (t) => t.status);

    (byStatus.todo ?? []).forEach((t) => dropzones.todo.appendChild(taskCard(t)));
    (byStatus.doing ?? []).forEach((t) => dropzones.doing.appendChild(taskCard(t)));
    (byStatus.done ?? []).forEach((t) => dropzones.done.appendChild(taskCard(t)));
  }

  function taskCard(task) {
    const el = document.createElement("article");
    el.className = "card";
    el.draggable = true;
    el.dataset.id = task.id;

    el.addEventListener("dragstart", (e) => {
      e.dataTransfer?.setData("text/task-id", task.id);
      e.dataTransfer?.setData("text/plain", task.id);
    });

    const badgeLabel = priorityLabel(task.priority);

    el.innerHTML = `
      <div class="card-top">
        <span class="badge ${task.priority}">${badgeLabel}</span>
        <div class="card-actions">
          <button class="icon-btn" data-action="edit" aria-label="Editar">✏️</button>
          <button class="icon-btn" data-action="delete" aria-label="Eliminar">🗑️</button>
        </div>
      </div>
      <p class="card-title"></p>
    `;

    el.querySelector(".card-title").textContent = task.title;

    el.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-action]");
      if (!btn) return;
      const action = btn.dataset.action;

      if (action === "delete") return deleteTask(task.id);
      if (action === "edit") {
        const next = prompt("Editar tarea:", task.title);
        if (next === null) return;
        editTaskTitle(task.id, next);
      }
    });

    return el;
  }

  // --- Storage ---
  function loadTasks() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const data = JSON.parse(raw);
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  }

  function saveTasks(value) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  }

  // --- Utils ---
  function groupBy(items, keyFn) {
    return items.reduce((acc, item) => {
      const key = String(keyFn(item));
      (acc[key] ??= []).push(item);
      return acc;
    }, {});
  }

  function priorityLabel(p) {
    return p === "high" ? "Alta" : p === "medium" ? "Media" : "Baja";
  }
})();
