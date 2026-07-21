const { useState, useEffect, useCallback, useMemo } = React;

/* ============================================================
   Данные и константы
   ============================================================ */
const PALETTE = ["#3E6259", "#C98A3E", "#B5533C", "#3E4C8A", "#8A5A3E", "#6B3E5F", "#4A7A8C", "#7A7A3E"];

const ICONS = {
  work: "💼", book: "📚", gym: "🏋️", coffee: "☕", heart: "❤️", home: "🏠",
  cart: "🛒", phone: "📞", people: "👥", music: "🎵", food: "🍽️", moon: "🌙",
  sun: "☀️", star: "⭐", code: "💻", plane: "✈️", pen: "🖊️", money: "💰",
  health: "🩺", study: "🎓", dog: "🐶",
};
const ICON_KEYS = Object.keys(ICONS);
const WEEKDAYS_SHORT = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
const HOURS = Array.from({ length: 18 }, (_, i) => i + 6); // 06:00–23:00
const STORAGE_KEY = "planner-items";

/* ============================================================
   Утилиты
   ============================================================ */
function dateKey(d) { return d.toISOString().slice(0, 10); }
function todayKey() { return dateKey(new Date()); }
function addDays(d, n) { const nd = new Date(d); nd.setDate(nd.getDate() + n); return nd; }
function formatDay(d) { return d.toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long" }); }
function formatShort(dstr) {
  if (!dstr) return "";
  return new Date(dstr + "T00:00:00").toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
}
function routineMatchesDate(item, date) {
  if (!item.recurrence) return true;
  if (item.recurrence.mode === "daily") return true;
  if (item.recurrence.mode === "weekly") return item.recurrence.days.includes(date.getDay());
  return true;
}
function minutesFromTime(t) {
  if (!t) return null;
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}
function uid() { return (crypto.randomUUID ? crypto.randomUUID() : "id-" + Date.now() + "-" + Math.random()); }
function computeStreak(completions) {
  let streak = 0;
  let cursor = new Date();
  if (!completions[todayKey()]) cursor.setDate(cursor.getDate() - 1);
  while (completions[dateKey(cursor)]) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}
function loadItems() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); }
  catch { return []; }
}
function saveItems(items) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(items)); return true; }
  catch { return false; }
}

const emptyForm = {
  id: null, type: "task", title: "", icon: "star", color: PALETTE[0],
  date: todayKey(), time: "", duration: 60,
  recurrenceMode: "daily", recurrenceDays: [1, 2, 3, 4, 5],
  delegate: false, delegatedTo: "", delegatedDue: "",
};

/* ============================================================
   Корневой компонент
   ============================================================ */
function Planner() {
  const [items, setItems] = useState(() => loadItems());
  const [error, setError] = useState("");
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [view, setView] = useState("list");
  const [form, setForm] = useState(null);
  const [installPrompt, setInstallPrompt] = useState(null);

  useEffect(() => {
    const handler = (e) => { e.preventDefault(); setInstallPrompt(e); };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const updateItems = useCallback((updater) => {
    setItems((prev) => {
      const next = updater(prev);
      if (!saveItems(next)) setError("Не удалось сохранить изменения на этом устройстве.");
      return next;
    });
  }, []);

  const selKey = dateKey(selectedDate);
  const isToday = selKey === todayKey();

  const occurrences = useMemo(() => {
    const list = [];
    for (const it of items) {
      if (it.type === "task") {
        if (it.date === selKey) {
          list.push({ item: it, occKey: selKey, done: !!it.done, time: it.time, title: it.title, icon: it.icon, color: it.color, delegatedTo: it.delegatedTo, delegatedDue: it.delegatedDue });
        }
      } else if (routineMatchesDate(it, selectedDate)) {
        list.push({ item: it, occKey: selKey, done: !!(it.completions && it.completions[selKey]), time: it.time, title: it.title, icon: it.icon, color: it.color, streak: computeStreak(it.completions || {}) });
      }
    }
    return list;
  }, [items, selKey, selectedDate]);

  const timed = occurrences.filter((o) => o.time).sort((a, b) => minutesFromTime(a.time) - minutesFromTime(b.time));
  const untimed = occurrences.filter((o) => !o.time);

  const toggleDone = (occ) => {
    updateItems((prev) => prev.map((it) => {
      if (it.id !== occ.item.id) return it;
      if (it.type === "task") return { ...it, done: !it.done };
      const completions = { ...(it.completions || {}) };
      if (completions[occ.occKey]) delete completions[occ.occKey]; else completions[occ.occKey] = true;
      return { ...it, completions };
    }));
  };
  const deleteItem = (id) => updateItems((prev) => prev.filter((it) => it.id !== id));
  const openNew = (type) => setForm({ ...emptyForm, id: null, type, date: selKey });
  const openEdit = (occ) => {
    const it = occ.item;
    setForm({
      id: it.id, type: it.type, title: it.title, icon: it.icon, color: it.color,
      date: it.date || selKey, time: it.time || "", duration: it.duration || 60,
      recurrenceMode: it.recurrence?.mode || "daily", recurrenceDays: it.recurrence?.days || [1, 2, 3, 4, 5],
      delegate: !!it.delegatedTo, delegatedTo: it.delegatedTo || "", delegatedDue: it.delegatedDue || "",
    });
  };

  const saveForm = (e) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    const base = { title: form.title.trim(), icon: form.icon, color: form.color, type: form.type, time: form.time || null, duration: Number(form.duration) || 60 };
    if (form.type === "task") {
      Object.assign(base, {
        date: form.date,
        done: form.id ? (items.find((i) => i.id === form.id)?.done ?? false) : false,
        delegatedTo: form.delegate ? form.delegatedTo.trim() || null : null,
        delegatedDue: form.delegate ? form.delegatedDue || null : null,
      });
    } else {
      Object.assign(base, {
        recurrence: form.recurrenceMode === "daily" ? { mode: "daily" } : { mode: "weekly", days: form.recurrenceDays },
        completions: form.id ? (items.find((i) => i.id === form.id)?.completions ?? {}) : {},
      });
    }
    if (form.id) updateItems((prev) => prev.map((it) => (it.id === form.id ? { ...it, ...base } : it)));
    else updateItems((prev) => [...prev, { id: uid(), createdAt: todayKey(), ...base }]);
    setForm(null);
  };

  const promptInstall = async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
  };

  return (
    <div style={{ minHeight: "100vh", width: "100%" }}>
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "2rem 1.25rem 3rem" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem" }}>
          <h1 style={{ fontFamily: "var(--font-display)", fontStyle: "italic", fontSize: "1.9rem", margin: 0 }}>Планинг</h1>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {installPrompt && (
              <button onClick={promptInstall} style={pillBtn(false)} title="Установить как приложение">⬇ Установить</button>
            )}
            <div style={{ display: "flex", gap: 4, borderRadius: 999, border: "1px solid var(--color-line)", padding: 4 }}>
              <button onClick={() => setView("list")} style={iconToggle(view === "list")} aria-label="Список">☰</button>
              <button onClick={() => setView("grid")} style={iconToggle(view === "grid")} aria-label="По часам">▦</button>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem", paddingBottom: "1rem", borderBottom: "1px solid var(--color-line)" }}>
          <button onClick={() => setSelectedDate((d) => addDays(d, -1))} style={navArrow}>‹</button>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontFamily: "var(--font-display)", fontSize: "1.15rem", textTransform: "capitalize" }}>{formatDay(selectedDate)}</div>
            {!isToday && <button onClick={() => setSelectedDate(new Date())} style={linkBtn}>сегодня</button>}
          </div>
          <button onClick={() => setSelectedDate((d) => addDays(d, 1))} style={navArrow}>›</button>
        </div>

        {error && <div style={{ marginBottom: "1rem", fontSize: "0.875rem", padding: "0.5rem 1rem", borderRadius: 6, background: "var(--color-danger-bg)", color: "var(--color-danger-text)" }}>{error}</div>}

        {untimed.length > 0 && (
          <Section title="Без времени">
            {untimed.map((occ) => <ItemRow key={occ.item.id} occ={occ} onToggle={toggleDone} onEdit={openEdit} onDelete={deleteItem} />)}
          </Section>
        )}

        {occurrences.length === 0 && (
          <div style={{ textAlign: "center", padding: "3.5rem 0", borderRadius: 8, border: "1px dashed var(--color-line)", marginBottom: "1.5rem" }}>
            <p style={{ fontFamily: "var(--font-display)", fontStyle: "italic", fontSize: "1.1rem", opacity: 0.8, margin: "0 0 0.25rem" }}>На этот день пока ничего нет</p>
            <p style={{ fontSize: "0.875rem", opacity: 0.5, margin: 0 }}>Добавь задачу или рутину ниже</p>
          </div>
        )}

        {view === "list" ? (
          timed.length > 0 && (
            <Section title="По времени">
              {timed.map((occ) => <ItemRow key={occ.item.id} occ={occ} onToggle={toggleDone} onEdit={openEdit} onDelete={deleteItem} />)}
            </Section>
          )
        ) : (
          <div style={{ marginBottom: "2rem", borderRadius: 8, border: "1px solid var(--color-line)", overflow: "hidden" }}>
            <div style={{ position: "relative", height: HOURS.length * 56 }}>
              {HOURS.map((h, i) => (
                <div key={h} style={{ position: "absolute", left: 0, right: 0, top: i * 56, height: 56, borderTop: "1px solid var(--color-line)", display: "flex" }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.7rem", opacity: 0.4, width: 56, paddingTop: 4, paddingLeft: 8, flexShrink: 0 }}>{String(h).padStart(2, "0")}:00</div>
                </div>
              ))}
              {isToday && <NowLine />}
              {timed.map((occ) => {
                const mins = minutesFromTime(occ.time);
                const top = ((mins - 360) / 60) * 56;
                if (top < -56 || top > HOURS.length * 56) return null;
                const dur = occ.item.duration || 60;
                const height = Math.max((dur / 60) * 56 - 4, 22);
                return (
                  <button key={occ.item.id} onClick={() => openEdit(occ)}
                    style={{ position: "absolute", left: 64, right: 8, top: Math.max(top, 0), height, borderRadius: 4, padding: "4px 8px", textAlign: "left", overflow: "hidden", background: occ.color + "26", borderLeft: `3px solid ${occ.color}`, border: "none", borderLeftWidth: 3, cursor: "pointer" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.8rem", fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      <span>{ICONS[occ.icon] || "⭐"}</span>
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{occ.title}</span>
                      {occ.done && <span>✓</span>}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <button onClick={() => openNew("task")} style={dashedBtn}>+ Задача</button>
          <button onClick={() => openNew("routine")} style={dashedBtn}>+ Рутина</button>
        </div>

        <div style={{ marginTop: "2rem", textAlign: "center", fontSize: "0.75rem", opacity: 0.4, fontFamily: "var(--font-mono)" }}>сохранено на этом устройстве</div>
      </div>

      {form && <FormModal form={form} setForm={setForm} onSave={saveForm} onClose={() => setForm(null)} onDelete={form.id ? () => { deleteItem(form.id); setForm(null); } : null} />}
    </div>
  );
}

/* ============================================================
   Мелкие компоненты
   ============================================================ */
function Section({ title, children }) {
  return (
    <div style={{ marginBottom: "1.5rem" }}>
      <p style={{ fontFamily: "var(--font-mono)", fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.05em", opacity: 0.5, marginBottom: 8 }}>{title}</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{children}</div>
    </div>
  );
}

function NowLine() {
  const now = new Date();
  const mins = now.getHours() * 60 + now.getMinutes();
  const top = ((mins - 360) / 60) * 56;
  if (top < 0 || top > HOURS.length * 56) return null;
  return (
    <div style={{ position: "absolute", left: 56, right: 0, top, borderTop: "1.5px solid var(--color-ink)" }}>
      <div style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--color-ink)", marginTop: -3, marginLeft: -3 }} />
    </div>
  );
}

function ItemRow({ occ, onToggle, onEdit, onDelete }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, borderRadius: 8, padding: 12, border: "1px solid var(--color-line)", background: "var(--color-paper-deep)" }}>
      <button onClick={() => onToggle(occ)} aria-label="Отметить выполненным"
        style={{ flexShrink: 0, width: 32, height: 32, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", border: `2px solid ${occ.color}`, background: occ.done ? occ.color : "transparent", cursor: "pointer" }}>
        {occ.done ? <span style={{ color: "var(--color-paper)" }}>✓</span> : <span style={{ fontSize: "0.8rem" }}>{ICONS[occ.icon] || "⭐"}</span>}
      </button>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: "0.9rem", textDecoration: occ.done ? "line-through" : "none", opacity: occ.done ? 0.5 : 1 }}>{occ.title}</span>
          {occ.time && <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.7rem", opacity: 0.5 }}>🕐 {occ.time}</span>}
          {occ.streak > 0 && <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.7rem", padding: "2px 6px", borderRadius: 999, background: occ.color + "22", color: occ.color }}>🔥{occ.streak}</span>}
        </div>
        {occ.delegatedTo && (
          <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.7rem", marginTop: 4, opacity: 0.7 }}>
            → {occ.delegatedTo}{occ.delegatedDue ? ` · до ${formatShort(occ.delegatedDue)}` : ""}
          </div>
        )}
      </div>
      <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
        <button onClick={() => onEdit(occ)} aria-label="Редактировать" style={ghostIconBtn}>✎</button>
        <button onClick={() => onDelete(occ.item.id)} aria-label="Удалить" style={ghostIconBtn}>🗑</button>
      </div>
    </div>
  );
}

function FormModal({ form, setForm, onSave, onClose, onDelete }) {
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const toggleDay = (d) => {
    const days = form.recurrenceDays.includes(d) ? form.recurrenceDays.filter((x) => x !== d) : [...form.recurrenceDays, d].sort();
    set({ recurrenceDays: days });
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(35,38,31,0.4)", padding: 16 }}>
      <form onSubmit={onSave} onClick={(e) => e.stopPropagation()}
        style={{ width: "100%", maxWidth: 440, borderRadius: 12, padding: 24, maxHeight: "88vh", overflowY: "auto", background: "var(--color-paper)", border: "1px solid var(--color-line)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <h2 style={{ fontFamily: "var(--font-display)", fontStyle: "italic", fontSize: "1.3rem", margin: 0 }}>{form.id ? "Редактировать" : form.type === "task" ? "Новая задача" : "Новая рутина"}</h2>
          <button type="button" onClick={onClose} style={ghostIconBtn}>✕</button>
        </div>

        {!form.id && (
          <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
            {["task", "routine"].map((t) => (
              <button key={t} type="button" onClick={() => set({ type: t })} style={pillBtn(form.type === t)}>{t === "task" ? "Задача" : "Рутина"}</button>
            ))}
          </div>
        )}

        <input autoFocus value={form.title} onChange={(e) => set({ title: e.target.value })} placeholder="Название" required style={textInput} />

        <FieldLabel>Иконка</FieldLabel>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 8, marginBottom: 20 }}>
          {ICON_KEYS.map((k) => (
            <button key={k} type="button" onClick={() => set({ icon: k })}
              style={{ aspectRatio: "1", borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", border: `1px solid ${form.icon === k ? form.color : "var(--color-line)"}`, background: form.icon === k ? form.color + "22" : "transparent", cursor: "pointer", fontSize: "1rem" }}>
              {ICONS[k]}
            </button>
          ))}
        </div>

        <FieldLabel>Цвет</FieldLabel>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 20 }}>
          {PALETTE.map((c) => (
            <button key={c} type="button" onClick={() => set({ color: c })}
              style={{ width: 28, height: 28, borderRadius: "50%", background: c, border: "none", cursor: "pointer", outline: form.color === c ? "2px solid var(--color-ink)" : "none", outlineOffset: 2 }} />
          ))}
        </div>

        {form.type === "task" ? (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
            <label style={fieldLabel}>Дата
              <input type="date" value={form.date} onChange={(e) => set({ date: e.target.value })} style={smallInput} />
            </label>
            <label style={fieldLabel}>Время (необязательно)
              <input type="time" value={form.time} onChange={(e) => set({ time: e.target.value })} style={smallInput} />
            </label>
          </div>
        ) : (
          <div style={{ marginBottom: 20 }}>
            <FieldLabel>Повтор</FieldLabel>
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              {["daily", "weekly"].map((m) => (
                <button key={m} type="button" onClick={() => set({ recurrenceMode: m })} style={pillBtn(form.recurrenceMode === m)}>
                  {m === "daily" ? "Каждый день" : "По дням недели"}
                </button>
              ))}
            </div>
            {form.recurrenceMode === "weekly" && (
              <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
                {WEEKDAYS_SHORT.map((label, idx) => (
                  <button key={idx} type="button" onClick={() => toggleDay(idx)}
                    style={{ width: 32, height: 32, borderRadius: "50%", fontSize: "0.7rem", border: `1px solid ${form.recurrenceDays.includes(idx) ? form.color : "var(--color-line)"}`, background: form.recurrenceDays.includes(idx) ? form.color : "transparent", color: form.recurrenceDays.includes(idx) ? "var(--color-paper)" : "var(--color-ink)", cursor: "pointer" }}>
                    {label}
                  </button>
                ))}
              </div>
            )}
            <label style={fieldLabel}>Время (необязательно)
              <input type="time" value={form.time} onChange={(e) => set({ time: e.target.value })} style={smallInput} />
            </label>
          </div>
        )}

        {form.time && (
          <label style={{ ...fieldLabel, display: "block", marginBottom: 20 }}>Длительность
            <select value={form.duration} onChange={(e) => set({ duration: e.target.value })} style={smallInput}>
              {[15, 30, 45, 60, 90, 120, 180].map((m) => <option key={m} value={m}>{m} мин</option>)}
            </select>
          </label>
        )}

        {form.type === "task" && (
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.9rem", marginBottom: 12, cursor: "pointer" }}>
              <input type="checkbox" checked={form.delegate} onChange={(e) => set({ delegate: e.target.checked })} />
              Делегировать это дело
            </label>
            {form.delegate && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <label style={fieldLabel}>Кому
                  <input value={form.delegatedTo} onChange={(e) => set({ delegatedTo: e.target.value })} placeholder="Имя" style={smallInput} />
                </label>
                <label style={fieldLabel}>Срок
                  <input type="date" value={form.delegatedDue} onChange={(e) => set({ delegatedDue: e.target.value })} style={smallInput} />
                </label>
              </div>
            )}
          </div>
        )}

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: 8 }}>
          {onDelete ? <button type="button" onClick={onDelete} style={{ ...linkBtn, opacity: 0.7 }}>🗑 Удалить</button> : <span />}
          <button type="submit" style={{ padding: "8px 20px", borderRadius: 6, fontSize: "0.9rem", fontWeight: 500, background: "var(--color-ink)", color: "var(--color-paper)", border: "none", cursor: "pointer" }}>Сохранить</button>
        </div>
      </form>
    </div>
  );
}

function FieldLabel({ children }) {
  return <p style={{ fontFamily: "var(--font-mono)", fontSize: "0.7rem", textTransform: "uppercase", opacity: 0.5, marginBottom: 8 }}>{children}</p>;
}

/* ============================================================
   Инлайн-стили общего назначения
   ============================================================ */
const navArrow = { padding: 8, opacity: 0.6, background: "none", border: "none", cursor: "pointer", fontSize: "1.2rem", color: "var(--color-ink)" };
const linkBtn = { fontFamily: "var(--font-mono)", fontSize: "0.7rem", opacity: 0.5, background: "none", border: "none", textDecoration: "underline", cursor: "pointer", color: "var(--color-ink)" };
const dashedBtn = { padding: "12px 0", borderRadius: 8, border: "1px dashed var(--color-line)", background: "none", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontSize: "0.9rem", opacity: 0.7, cursor: "pointer", color: "var(--color-ink)" };
const ghostIconBtn = { padding: 6, opacity: 0.6, background: "none", border: "none", cursor: "pointer", fontSize: "0.85rem", color: "var(--color-ink)" };
const textInput = { width: "100%", background: "transparent", border: "none", borderBottom: "1px solid var(--color-line)", paddingBottom: 8, marginBottom: 20, outline: "none", fontFamily: "var(--font-display)", fontStyle: "italic", fontSize: "1.1rem", color: "var(--color-ink)" };
const smallInput = { width: "100%", background: "transparent", border: "none", borderBottom: "1px solid var(--color-line)", paddingBottom: 4, outline: "none", fontSize: "0.9rem", color: "var(--color-ink)", marginTop: 4 };
const fieldLabel = { fontSize: "0.9rem", display: "block" };
function pillBtn(active) {
  return { flex: 1, padding: "6px 0", borderRadius: 999, fontSize: "0.85rem", border: `1px solid ${active ? "var(--color-ink)" : "var(--color-line)"}`, background: active ? "var(--color-ink)" : "transparent", color: active ? "var(--color-paper)" : "var(--color-ink)", cursor: "pointer" };
}
function iconToggle(active) {
  return { padding: "6px 10px", borderRadius: 999, border: "none", background: active ? "var(--color-ink)" : "transparent", color: active ? "var(--color-paper)" : "var(--color-ink)", cursor: "pointer" };
}

/* ============================================================
   Монтирование
   ============================================================ */
ReactDOM.createRoot(document.getElementById("root")).render(<Planner />);
