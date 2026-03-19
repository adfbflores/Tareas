(() => {
  "use strict";

  /**
   * TaskFlow
   * Un tablero Kanban bien sencillo para organizar tareas sin depender de librerías.
   * Todo se guarda en LocalStorage para que no se pierda al recargar la página.
   */

  /**
   * @typedef {"todo"|"doing"|"done"} Status
   * @typedef {"low"|"medium"|"high"} Priority
   * @typedef {{ id:string, title:string, priority:Priority, status:Status, createdAt:number }} Task
   */

  const STORAGE_KEY = "taskflow.tasks.v1";
  const VALID_STATUS = new Set(["todo", "doing", "done"]);
  const VALID_PRIORITY = new Set(["low", "medium", "high"]);

  // Primero armamos el mapa del DOM. Si algo clave falta, es mejor detener aquí
  // y dejar un error claro en consola en vez de romper más adelante sin contexto.
  const elements = {
    taskForm: document.querySelector("#taskForm"),
    titleInput: document.querySelector("#title"),
    prioritySelect: document.querySelector("#priority"),
    searchInput: document.querySelector("#search"),
    filterPriority: document.querySelector("#filterPriority"),
    clearAllBtn: document.querySelector("#clearAll"),
    dropzones: {
      todo: document.querySelector('[data-dropzone="todo"]'),
      doing: document.querySelector('[data-dropzone="doing"]'),
      done: document.querySelector('[data-dropzone="done"]'),
    },
    counters: {
      todo: document.querySelector('[data-count="todo"]'),
      doing: document.querySelector('[data-count="doing"]'),
      done: document.querySelector('[data-count="done"]'),
    },
  };

  if (!isDomReady(elements)) {
    console.error(
      "TaskFlow: faltan elementos obligatorios en el HTML. Revisa la estructura antes de inicializar la app.",
    );
    return;
  }

  const {
    taskForm,
    titleInput,
    prioritySelect,
    searchInput,
    filterPriority,
    clearAllBtn,
    dropzones,
    counters,
  } = elements;

  /** @type {Task[]} */
  let tasks = loadTasks();

  const dragDepth = new WeakMap();

  bindEvents();
  render();

  function bindEvents() {
    taskForm.addEventListener("submit", (event) => {
      event.preventDefault();

      const title = titleInput.value.trim();
      const priority = normalizePriority(prioritySelect.value);

      if (!title) {
        titleInput.focus();
        return;
      }

      addTask({ title, priority });
      taskForm.reset();
      prioritySelect.value = "medium";
      titleInput.focus();
    });

    searchInput.addEventListener("input", render);
    filterPriority.addEventListener("change", render);

    clearAllBtn.addEventListener("click", () => {
      if (tasks.length === 0) return;

      const ok = confirm(
        "¿Seguro que quieres borrar todas las tareas? Esta acción no se puede deshacer.",
      );
      if (!ok) return;

      tasks = [];
      persistTasks();
      render();
      titleInput.focus();
    });

    Object.entries(dropzones).forEach(([status, zone]) => {
      dragDepth.set(zone, 0);

      zone.addEventListener("dragenter", (event) => {
        event.preventDefault();
        const nextDepth = (dragDepth.get(zone) ?? 0) + 1;
        dragDepth.set(zone, nextDepth);
        zone.classList.add("is-over");
      });

      zone.addEventListener("dragover", (event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
      });

      zone.addEventListener("dragleave", () => {
        const nextDepth = Math.max((dragDepth.get(zone) ?? 1) - 1, 0);
        dragDepth.set(zone, nextDepth);

        if (nextDepth === 0) {
          zone.classList.remove("is-over");
        }
      });

      zone.addEventListener("drop", (event) => {
        event.preventDefault();
        resetDropzoneState(zone);

        const taskId = event.dataTransfer?.getData("text/task-id");
        if (!taskId) return;

        moveTask(taskId, /** @type {Status} */ (status));
      });
    });
  }

  function addTask(input) {
    /** @type {Task} */
    const newTask = {
      id: createId(),
      title: input.title.trim(),
      priority: normalizePriority(input.priority),
      status: "todo",
      createdAt: Date.now(),
    };

    tasks = [newTask, ...tasks];
    persistTasks();
    render();
  }

  function deleteTask(id) {
    const task = tasks.find((item) => item.id === id);
    if (!task) return;

    const ok = confirm(`¿Eliminar la tarea “${task.title}”?`);
    if (!ok) return;

    tasks = tasks.filter((item) => item.id !== id);
    persistTasks();
    render();
  }

  function editTaskTitle(id, nextTitle) {
    const cleaned = nextTitle.trim();
    if (!cleaned) return;

    let changed = false;

    tasks = tasks.map((task) => {
      if (task.id !== id) return task;
      changed = task.title !== cleaned;
      return { ...task, title: cleaned };
    });

    if (!changed) return;

    persistTasks();
    render();
  }

  function moveTask(id, nextStatus) {
    if (!VALID_STATUS.has(nextStatus)) return;

    let changed = false;

    tasks = tasks.map((task) => {
      if (task.id !== id) return task;
      if (task.status === nextStatus) return task;
      changed = true;
      return { ...task, status: nextStatus };
    });

    if (!changed) return;

    persistTasks();
    render();
  }

  function render() {
    clearBoard();

    const query = searchInput.value.trim().toLowerCase();
    const priorityFilter = filterPriority.value;

    const visibleTasks = tasks.filter((task) => {
      const matchesQuery = !query || task.title.toLowerCase().includes(query);
      const matchesPriority =
        priorityFilter === "all" || task.priority === priorityFilter;
      return matchesQuery && matchesPriority;
    });

    const byStatus = groupBy(visibleTasks, (task) => task.status);

    renderColumn("todo", byStatus.todo ?? []);
    renderColumn("doing", byStatus.doing ?? []);
    renderColumn("done", byStatus.done ?? []);

    counters.todo.textContent = String((byStatus.todo ?? []).length);
    counters.doing.textContent = String((byStatus.doing ?? []).length);
    counters.done.textContent = String((byStatus.done ?? []).length);

    clearAllBtn.disabled = tasks.length === 0;
  }

  function renderColumn(status, items) {
    const zone = dropzones[status];

    if (items.length === 0) {
      zone.appendChild(createEmptyState(status));
      return;
    }

    items.forEach((task) => zone.appendChild(taskCard(task)));
  }

  function taskCard(task) {
    const el = document.createElement("article");
    el.className = "task-card";
    el.draggable = true;
    el.dataset.id = task.id;
    el.tabIndex = 0;
    el.setAttribute("aria-label", `Tarea: ${task.title}`);

    el.addEventListener("dragstart", (event) => {
      el.classList.add("is-dragging");
      event.dataTransfer?.setData("text/task-id", task.id);
      event.dataTransfer?.setData("text/plain", task.id);
      if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = "move";
      }
    });

    el.addEventListener("dragend", () => {
      el.classList.remove("is-dragging");
      Object.values(dropzones).forEach(resetDropzoneState);
    });

    const badgeLabel = priorityLabel(task.priority);

    el.innerHTML = `
      <div class="card-top">
        <span class="badge ${task.priority}">${badgeLabel}</span>
        <div class="card-actions">
          <button class="icon-btn" type="button" data-action="edit" aria-label="Editar tarea">✏️</button>
          <button class="icon-btn" type="button" data-action="delete" aria-label="Eliminar tarea">🗑️</button>
        </div>
      </div>
      <p class="card-title"></p>
      <p class="card-meta">Creada ${formatDate(task.createdAt)}</p>
    `;

    el.querySelector(".card-title").textContent = task.title;

    el.addEventListener("click", (event) => {
      const btn = event.target.closest("button[data-action]");
      if (!btn) return;
      handleCardAction(task, btn.dataset.action);
    });

    el.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        const next = prompt("Cambia el texto de la tarea:", task.title);
        if (next === null) return;
        editTaskTitle(task.id, next);
      }

      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        deleteTask(task.id);
      }
    });

    return el;
  }

  function handleCardAction(task, action) {
    if (action === "delete") {
      deleteTask(task.id);
      return;
    }

    if (action === "edit") {
      const next = prompt("Cambia el texto de la tarea:", task.title);
      if (next === null) return;
      editTaskTitle(task.id, next);
    }
  }

  function createEmptyState(status) {
    const messages = {
      todo: "Aquí caerán las tareas pendientes.",
      doing: "Cuando arrastres algo en curso, aparecerá aquí.",
      done: "Todavía no hay tareas terminadas.",
    };

    const el = document.createElement("div");
    el.className = "empty-state";
    el.textContent = messages[status] ?? "No hay tareas para mostrar.";
    return el;
  }

  function clearBoard() {
    Object.values(dropzones).forEach((zone) => {
      zone.innerHTML = "";
      resetDropzoneState(zone);
    });
  }

  function resetDropzoneState(zone) {
    dragDepth.set(zone, 0);
    zone.classList.remove("is-over");
  }

  function loadTasks() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];

      const data = JSON.parse(raw);
      if (!Array.isArray(data)) return [];

      return data
        .map(normalizeTask)
        .filter(Boolean)
        .sort((a, b) => b.createdAt - a.createdAt);
    } catch (error) {
      console.warn(
        "TaskFlow: no se pudieron recuperar las tareas guardadas.",
        error,
      );
      return [];
    }
  }

  function persistTasks() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
    } catch (error) {
      console.error(
        "TaskFlow: no se pudo guardar el estado en LocalStorage.",
        error,
      );
      alert(
        "No se pudieron guardar los cambios. Revisa si el navegador bloqueó el almacenamiento local.",
      );
    }
  }

  function normalizeTask(task) {
    if (!task || typeof task !== "object") return null;

    const title = typeof task.title === "string" ? task.title.trim() : "";
    const priority = normalizePriority(task.priority);
    const status = VALID_STATUS.has(task.status) ? task.status : "todo";
    const createdAt = Number.isFinite(task.createdAt)
      ? task.createdAt
      : Date.now();
    const id =
      typeof task.id === "string" && task.id.trim() ? task.id : createId();

    if (!title) return null;

    return { id, title, priority, status, createdAt };
  }

  function normalizePriority(value) {
    return VALID_PRIORITY.has(value) ? value : "medium";
  }

  function createId() {
    if (
      typeof crypto !== "undefined" &&
      typeof crypto.randomUUID === "function"
    ) {
      return crypto.randomUUID();
    }

    return `task-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function formatDate(timestamp) {
    try {
      return new Intl.DateTimeFormat("es", {
        dateStyle: "short",
        timeStyle: "short",
      }).format(timestamp);
    } catch {
      return new Date(timestamp).toLocaleString("es");
    }
  }

  function groupBy(items, keyFn) {
    return items.reduce((acc, item) => {
      const key = String(keyFn(item));
      (acc[key] ??= []).push(item);
      return acc;
    }, {});
  }

  function priorityLabel(priority) {
    if (priority === "high") return "Alta";
    if (priority === "medium") return "Media";
    return "Baja";
  }

  function isDomReady(refs) {
    const required = [
      refs.taskForm,
      refs.titleInput,
      refs.prioritySelect,
      refs.searchInput,
      refs.filterPriority,
      refs.clearAllBtn,
      refs.dropzones.todo,
      refs.dropzones.doing,
      refs.dropzones.done,
      refs.counters.todo,
      refs.counters.doing,
      refs.counters.done,
    ];

    return required.every(Boolean);
  }
})();
