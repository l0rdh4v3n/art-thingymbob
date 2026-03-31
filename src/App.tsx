import { FormEvent, useEffect, useMemo, useState } from 'react';

type PlannerTask = {
  id: string;
  text: string;
  duration: number;
  createdAt: number;
};

type ScheduleSettings = {
  dayStart: string;
  dayEnd: string;
  lunchStart: string;
  lunchDuration: number;
  dinnerStart: string;
  dinnerDuration: number;
};

type ScheduleItemKind = 'task' | 'meal' | 'free';

type ScheduleItem = {
  id: string;
  kind: ScheduleItemKind;
  label: string;
  start: number;
  end: number;
  taskId?: string;
  taskDuration?: number;
};

type GeneratedPlan = {
  id: string;
  createdAt: number;
  tasks: PlannerTask[];
  settings: ScheduleSettings;
  items: ScheduleItem[];
  unscheduled: PlannerTask[];
};

type StoredState = {
  tasks: PlannerTask[];
  settings: ScheduleSettings;
  generatedPlan: GeneratedPlan | null;
  history: GeneratedPlan[];
};

const STORAGE_KEY = 'schedule-generator:v1';
const FIXED_LUNCH_START = '12:00';
const FIXED_DINNER_START = '18:00';

const DEFAULT_SETTINGS: ScheduleSettings = {
  dayStart: '08:30',
  dayEnd: '21:00',
  lunchStart: FIXED_LUNCH_START,
  lunchDuration: 60,
  dinnerStart: FIXED_DINNER_START,
  dinnerDuration: 60,
};

function isPlannerTask(value: unknown): value is PlannerTask {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as PlannerTask).id === 'string' &&
    typeof (value as PlannerTask).text === 'string' &&
    typeof (value as PlannerTask).duration === 'number' &&
    Number.isFinite((value as PlannerTask).duration) &&
    typeof (value as PlannerTask).createdAt === 'number'
  );
}

function isScheduleSettings(value: unknown): value is ScheduleSettings {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as ScheduleSettings).dayStart === 'string' &&
    typeof (value as ScheduleSettings).dayEnd === 'string' &&
    typeof (value as ScheduleSettings).lunchStart === 'string' &&
    typeof (value as ScheduleSettings).lunchDuration === 'number' &&
    typeof (value as ScheduleSettings).dinnerStart === 'string' &&
    typeof (value as ScheduleSettings).dinnerDuration === 'number'
  );
}

function isScheduleItem(value: unknown): value is ScheduleItem {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as ScheduleItem).id === 'string' &&
    typeof (value as ScheduleItem).label === 'string' &&
    typeof (value as ScheduleItem).start === 'number' &&
    typeof (value as ScheduleItem).end === 'number' &&
    typeof (value as ScheduleItem).kind === 'string'
  );
}

function isGeneratedPlan(value: unknown): value is GeneratedPlan {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as GeneratedPlan).id === 'string' &&
    typeof (value as GeneratedPlan).createdAt === 'number' &&
    Array.isArray((value as GeneratedPlan).tasks) &&
    (value as GeneratedPlan).tasks.every(isPlannerTask) &&
    isScheduleSettings((value as GeneratedPlan).settings) &&
    Array.isArray((value as GeneratedPlan).items) &&
    (value as GeneratedPlan).items.every(isScheduleItem) &&
    Array.isArray((value as GeneratedPlan).unscheduled) &&
    (value as GeneratedPlan).unscheduled.every(isPlannerTask)
  );
}

function normalizeSettings(value: Partial<ScheduleSettings> | null | undefined): ScheduleSettings {
  if (!value) {
    return { ...DEFAULT_SETTINGS };
  }

  return {
    dayStart: typeof value.dayStart === 'string' ? value.dayStart : DEFAULT_SETTINGS.dayStart,
    dayEnd: typeof value.dayEnd === 'string' ? value.dayEnd : DEFAULT_SETTINGS.dayEnd,
    lunchStart: FIXED_LUNCH_START,
    lunchDuration:
      typeof value.lunchDuration === 'number' ? value.lunchDuration : DEFAULT_SETTINGS.lunchDuration,
    dinnerStart: FIXED_DINNER_START,
    dinnerDuration:
      typeof value.dinnerDuration === 'number'
        ? value.dinnerDuration
        : DEFAULT_SETTINGS.dinnerDuration,
  };
}

function loadState(): StoredState {
  if (typeof window === 'undefined') {
    return {
      tasks: [],
      settings: { ...DEFAULT_SETTINGS },
      generatedPlan: null,
      history: [],
    };
  }

  const stored = window.localStorage.getItem(STORAGE_KEY);

  if (!stored) {
    return {
      tasks: [],
      settings: { ...DEFAULT_SETTINGS },
      generatedPlan: null,
      history: [],
    };
  }

  try {
    const parsed = JSON.parse(stored) as unknown;

    if (Array.isArray(parsed)) {
      return {
        tasks: parsed.filter(isPlannerTask),
        settings: { ...DEFAULT_SETTINGS },
        generatedPlan: null,
        history: [],
      };
    }

    if (typeof parsed === 'object' && parsed !== null) {
      const state = parsed as Partial<StoredState> & {
        tasks?: unknown;
        settings?: unknown;
        generatedPlan?: unknown;
        history?: unknown;
      };

      return {
        tasks: Array.isArray(state.tasks) ? state.tasks.filter(isPlannerTask) : [],
        settings: normalizeSettings(isScheduleSettings(state.settings) ? state.settings : null),
        generatedPlan: isGeneratedPlan(state.generatedPlan) ? state.generatedPlan : null,
        history: Array.isArray(state.history)
          ? state.history.filter(isGeneratedPlan).slice(0, 6)
          : [],
      };
    }
  } catch {
    return {
      tasks: [],
      settings: { ...DEFAULT_SETTINGS },
      generatedPlan: null,
      history: [],
    };
  }

  return {
    tasks: [],
    settings: { ...DEFAULT_SETTINGS },
    generatedPlan: null,
    history: [],
  };
}

function timeStringToMinutes(value: string): number {
  const [hoursText, minutesText] = value.split(':');
  const hours = Number(hoursText);
  const minutes = Number(minutesText);

  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    return Number.NaN;
  }

  return hours * 60 + minutes;
}

function minutesToClock(minutes: number): string {
  const date = new Date(2020, 0, 1, 0, 0, 0, 0);
  date.setMinutes(minutes);

  return date.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatDateTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString([], {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function formatDuration(minutes: number): string {
  if (minutes < 60) {
    return `${minutes} min`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  return remainingMinutes === 0 ? `${hours} hr` : `${hours} hr ${remainingMinutes} min`;
}

function shuffleValues<T>(values: T[]): T[] {
  const result = [...values];

  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }

  return result;
}

function pickWeightedIndex(weights: number[]): number {
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  let threshold = Math.random() * totalWeight;

  for (let index = 0; index < weights.length; index += 1) {
    threshold -= weights[index];

    if (threshold <= 0) {
      return index;
    }
  }

  return weights.length - 1;
}

function randomPartition(total: number, parts: number): number[] {
  if (parts <= 0) {
    return [];
  }

  if (parts === 1) {
    return [total];
  }

  const cuts = [0, total];

  for (let index = 0; index < parts - 1; index += 1) {
    cuts.push(Math.floor(Math.random() * (total + 1)));
  }

  cuts.sort((left, right) => left - right);

  return cuts.slice(1).map((value, index) => value - cuts[index]);
}

function buildSegmentItems(start: number, end: number, segmentTasks: PlannerTask[]): ScheduleItem[] {
  const segmentItems: ScheduleItem[] = [];
  const orderedTasks = shuffleValues(segmentTasks);
  const taskMinutes = orderedTasks.reduce((sum, task) => sum + task.duration, 0);
  const gaps = randomPartition(end - start - taskMinutes, orderedTasks.length + 1);
  let cursor = start;

  orderedTasks.forEach((task, index) => {
    if (gaps[index] > 0) {
      segmentItems.push({
        id: crypto.randomUUID(),
        kind: 'free',
        label: 'Open time',
        start: cursor,
        end: cursor + gaps[index],
      });

      cursor += gaps[index];
    }

    segmentItems.push({
      id: crypto.randomUUID(),
      kind: 'task',
      label: task.text,
      start: cursor,
      end: cursor + task.duration,
      taskId: task.id,
      taskDuration: task.duration,
    });

    cursor += task.duration;
  });

  if (gaps[orderedTasks.length] > 0) {
    segmentItems.push({
      id: crypto.randomUUID(),
      kind: 'free',
      label: 'Open time',
      start: cursor,
      end: cursor + gaps[orderedTasks.length],
    });
  }

  return segmentItems;
}

function App() {
  const initialState = useMemo(() => loadState(), []);
  const [tasks, setTasks] = useState<PlannerTask[]>(() => initialState.tasks);
  const [settings, setSettings] = useState<ScheduleSettings>(() => initialState.settings);
  const [generatedPlan, setGeneratedPlan] = useState<GeneratedPlan | null>(
    () => initialState.generatedPlan,
  );
  const [history, setHistory] = useState<GeneratedPlan[]>(() => initialState.history);
  const [taskDraft, setTaskDraft] = useState('');
  const [durationDraft, setDurationDraft] = useState('45');
  const [addError, setAddError] = useState('');
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const [editingDuration, setEditingDuration] = useState('45');
  const [editError, setEditError] = useState('');
  const [scheduleError, setScheduleError] = useState('');

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ tasks, settings, generatedPlan, history }),
    );
  }, [generatedPlan, history, settings, tasks]);

  const totalTaskMinutes = useMemo(
    () => tasks.reduce((total, task) => total + task.duration, 0),
    [tasks],
  );

  const planMinutes = generatedPlan
    ? generatedPlan.items.reduce((total, item) => total + (item.end - item.start), 0)
    : 0;

  const taskCount = tasks.length;
  const scheduledCount = generatedPlan?.items.filter((item) => item.kind === 'task').length ?? 0;
  const mealCount = generatedPlan?.items.filter((item) => item.kind === 'meal').length ?? 0;
  const historyCount = history.length;

  function addTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const text = taskDraft.trim();
    const duration = Number(durationDraft);

    if (!text) {
      setAddError('Enter a task before adding it to the generator.');
      return;
    }

    if (!Number.isFinite(duration) || duration <= 0) {
      setAddError('Task duration must be greater than zero.');
      return;
    }

    const nextTask: PlannerTask = {
      id: crypto.randomUUID(),
      text,
      duration,
      createdAt: Date.now(),
    };

    setTasks((current) => [nextTask, ...current]);
    setTaskDraft('');
    setDurationDraft('45');
    setAddError('');
  }

  function startEditing(task: PlannerTask) {
    setEditingTaskId(task.id);
    setEditingText(task.text);
    setEditingDuration(task.duration.toString());
    setEditError('');
  }

  function cancelEditing() {
    setEditingTaskId(null);
    setEditingText('');
    setEditingDuration('45');
    setEditError('');
  }

  function saveTaskEdit(taskId: string) {
    const nextText = editingText.trim();
    const nextDuration = Number(editingDuration);

    if (!nextText) {
      setEditError('Task text cannot be empty.');
      return;
    }

    if (!Number.isFinite(nextDuration) || nextDuration <= 0) {
      setEditError('Task duration must be greater than zero.');
      return;
    }

    setTasks((current) =>
      current.map((task) =>
        task.id === taskId ? { ...task, text: nextText, duration: nextDuration } : task,
      ),
    );

    setEditError('');
    cancelEditing();
  }

  function deleteTask(taskId: string) {
    setTasks((current) => current.filter((task) => task.id !== taskId));

    if (editingTaskId === taskId) {
      cancelEditing();
    }
  }

  function clearTasks() {
    setTasks([]);
    cancelEditing();
  }

  function updateSettings<K extends keyof ScheduleSettings>(key: K, value: ScheduleSettings[K]) {
    setSettings((current) => ({ ...current, [key]: value }));
    setScheduleError('');
  }

  function generateSchedule() {
    const dayStart = timeStringToMinutes(settings.dayStart);
    const dayEnd = timeStringToMinutes(settings.dayEnd);
    const lunchStart = timeStringToMinutes(FIXED_LUNCH_START);
    const dinnerStart = timeStringToMinutes(FIXED_DINNER_START);
    const lunchEnd = lunchStart + settings.lunchDuration;
    const dinnerEnd = dinnerStart + settings.dinnerDuration;

    if ([dayStart, dayEnd, lunchStart, dinnerStart].some(Number.isNaN)) {
      setScheduleError('Check the day and meal times before generating a schedule.');
      return;
    }

    if (dayStart >= dayEnd) {
      setScheduleError('The day end must be after the day start.');
      return;
    }

    if (lunchStart < dayStart || lunchEnd > dayEnd) {
      setScheduleError('Lunch needs to fit inside the day range.');
      return;
    }

    if (dinnerStart < dayStart || dinnerEnd > dayEnd) {
      setScheduleError('Dinner needs to fit inside the day range.');
      return;
    }

    if (lunchEnd > dinnerStart) {
      setScheduleError('Lunch and dinner cannot overlap.');
      return;
    }

    const meals = [
      {
        id: crypto.randomUUID(),
        kind: 'meal' as const,
        label: 'Lunch',
        start: lunchStart,
        end: lunchEnd,
      },
      {
        id: crypto.randomUUID(),
        kind: 'meal' as const,
        label: 'Dinner',
        start: dinnerStart,
        end: dinnerEnd,
      },
    ].sort((left, right) => left.start - right.start);

    const shuffledTasks = shuffleValues(tasks.map((task) => ({ ...task })));
    const segmentAssignments = [
      [] as PlannerTask[],
      [] as PlannerTask[],
      [] as PlannerTask[],
    ];
    const segmentCapacities = [lunchStart - dayStart, dinnerStart - lunchEnd, dayEnd - dinnerEnd];
    const unassignedTasks: PlannerTask[] = [];

    shuffledTasks.forEach((task) => {
      const fittingSegments = segmentCapacities
        .map((capacity, index) => ({ capacity, index }))
        .filter((segment) => segment.capacity >= task.duration);

      if (fittingSegments.length === 0) {
        unassignedTasks.push(task);
        return;
      }

      const chosenSegment = fittingSegments[
        pickWeightedIndex(fittingSegments.map((segment) => segment.capacity))
      ];
      segmentAssignments[chosenSegment.index].push(task);
      segmentCapacities[chosenSegment.index] -= task.duration;
    });

    const items: ScheduleItem[] = [];
    items.push(...buildSegmentItems(dayStart, lunchStart, segmentAssignments[0]));
    items.push(meals[0]);
    items.push(...buildSegmentItems(lunchEnd, dinnerStart, segmentAssignments[1]));
    items.push(meals[1]);
    items.push(...buildSegmentItems(dinnerEnd, dayEnd, segmentAssignments[2]));

    const snapshot: GeneratedPlan = {
      id: crypto.randomUUID(),
      createdAt: Date.now(),
      tasks: tasks.map((task) => ({ ...task })),
      settings: { ...settings },
      items,
      unscheduled: unassignedTasks,
    };

    setGeneratedPlan(snapshot);
    setHistory((current) => [snapshot, ...current.filter((entry) => entry.id !== snapshot.id)].slice(0, 6));
    setScheduleError('');
  }

  function loadHistoryPlan(plan: GeneratedPlan) {
    setGeneratedPlan(plan);
    setSettings(plan.settings);
    setScheduleError('');
  }

  const scheduleSummary = generatedPlan
    ? {
        totalMinutes: planMinutes,
        openMinutes: generatedPlan.items
          .filter((item) => item.kind === 'free')
          .reduce((total, item) => total + (item.end - item.start), 0),
      }
    : null;

  return (
    <main className="shell planner-shell">
      <div className="backdrop backdrop-one" />
      <div className="backdrop backdrop-two" />

      <section className="hero">
        <div>
          <p className="eyebrow">Day schedule generator</p>
          <h1>Turn your task list into a plan for the whole day.</h1>
          <p className="lede">
            Add the work you want to get done, then generate a schedule that places tasks around
            meals like lunch and dinner.
          </p>
        </div>

        <div className="stats" aria-label="Schedule summary">
          <div>
            <span className="stat-value">{taskCount}</span>
            <span className="stat-label">Tasks</span>
          </div>
          <div>
            <span className="stat-value">{scheduledCount}</span>
            <span className="stat-label">Scheduled</span>
          </div>
          <div>
            <span className="stat-value">{mealCount}</span>
            <span className="stat-label">Meals</span>
          </div>
          <div>
            <span className="stat-value">{historyCount}</span>
            <span className="stat-label">Saved plans</span>
          </div>
        </div>
      </section>

      <section className="panel split-panel">
        <div className="panel-card">
          <div className="section-header">
            <div>
              <h2>Add tasks</h2>
              <p className="section-subtitle">
                Put in the work you want done. Duration helps the generator fit each task into the day.
              </p>
            </div>
            <span>{taskCount}</span>
          </div>

          <form onSubmit={addTask} className="task-form">
            <div className="composer-row composer-row-task">
              <div className="field-group">
                <label className="field-label" htmlFor="task-text">
                  Task
                </label>
                <input
                  id="task-text"
                  type="text"
                  value={taskDraft}
                  onChange={(event) => {
                    setTaskDraft(event.target.value);
                    setAddError('');
                  }}
                  placeholder="Write a report, answer email, workout..."
                  autoComplete="off"
                />
              </div>

              <div className="field-group duration-group">
                <label className="field-label" htmlFor="task-duration">
                  Duration
                </label>
                <input
                  id="task-duration"
                  type="number"
                  min="5"
                  step="5"
                  value={durationDraft}
                  onChange={(event) => {
                    setDurationDraft(event.target.value);
                    setAddError('');
                  }}
                />
              </div>

              <button type="submit" className="primary-button">
                Add task
              </button>
            </div>

            {addError ? <p className="form-error">{addError}</p> : null}
          </form>
        </div>

        <div className="panel-card">
          <div className="section-header">
            <div>
              <h2>Schedule settings</h2>
              <p className="section-subtitle">
                  Set the workday. Lunch stays fixed at 12:00 and dinner stays fixed at 6:00.
              </p>
            </div>
          </div>

          <div className="settings-grid">
            <label className="field-group">
              <span className="field-label">Day start</span>
              <input
                type="time"
                value={settings.dayStart}
                onChange={(event) => updateSettings('dayStart', event.target.value)}
              />
            </label>

            <label className="field-group">
              <span className="field-label">Day end</span>
              <input
                type="time"
                value={settings.dayEnd}
                onChange={(event) => updateSettings('dayEnd', event.target.value)}
              />
            </label>

            <label className="field-group">
              <span className="field-label">Lunch time (fixed)</span>
              <input
                type="time"
                value={settings.lunchStart}
                disabled
              />
            </label>

            <label className="field-group">
              <span className="field-label">Lunch duration</span>
              <input
                type="number"
                min="15"
                step="15"
                value={settings.lunchDuration}
                onChange={(event) =>
                  updateSettings('lunchDuration', Number(event.target.value) || 0)
                }
              />
            </label>

            <label className="field-group">
              <span className="field-label">Dinner time (fixed)</span>
              <input
                type="time"
                value={settings.dinnerStart}
                disabled
              />
            </label>

            <label className="field-group">
              <span className="field-label">Dinner duration</span>
              <input
                type="number"
                min="15"
                step="15"
                value={settings.dinnerDuration}
                onChange={(event) =>
                  updateSettings('dinnerDuration', Number(event.target.value) || 0)
                }
              />
            </label>
          </div>

          <div className="settings-actions">
            <button type="button" className="primary-button" onClick={generateSchedule}>
              Generate schedule
            </button>
            <button type="button" className="secondary-button" onClick={() => setGeneratedPlan(null)}>
              Clear schedule
            </button>
            <button type="button" className="ghost-button" onClick={clearTasks}>
              Clear tasks
            </button>
          </div>

          {scheduleError ? <p className="form-error">{scheduleError}</p> : null}
        </div>
      </section>

      <section className="panel list-panel">
        <div className="section-header">
          <div>
            <h2>Desired tasks</h2>
            <p className="section-subtitle">
              Edit or remove tasks before generating. Total task time: {formatDuration(totalTaskMinutes)}.
            </p>
          </div>
          <span>{tasks.length}</span>
        </div>

        {tasks.length === 0 ? (
          <div className="empty-state">
            <p className="empty-title">No tasks yet</p>
            <p className="empty-copy">
              Add a few things you want to do, then generate a day plan with meals built in.
            </p>
          </div>
        ) : (
          <ul className="task-list">
            {tasks.map((task) => {
              const isEditing = editingTaskId === task.id;

              return (
                <li key={task.id} className="task-item">
                  <div className="task-body">
                    {isEditing ? (
                      <div className="editor">
                        <div className="editor-grid">
                          <label className="field-group">
                            <span className="field-label">Task</span>
                            <input
                              type="text"
                              value={editingText}
                              onChange={(event) => {
                                setEditingText(event.target.value);
                                setEditError('');
                              }}
                              autoFocus
                            />
                          </label>

                          <label className="field-group duration-group">
                            <span className="field-label">Duration</span>
                            <input
                              type="number"
                              min="5"
                              step="5"
                              value={editingDuration}
                              onChange={(event) => {
                                setEditingDuration(event.target.value);
                                setEditError('');
                              }}
                            />
                          </label>
                        </div>

                        {editError ? <p className="form-error">{editError}</p> : null}

                        <div className="editor-actions">
                          <button type="button" className="secondary-button" onClick={cancelEditing}>
                            Cancel
                          </button>
                          <button
                            type="button"
                            className="primary-button"
                            onClick={() => saveTaskEdit(task.id)}
                          >
                            Save task
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="task-heading-row">
                          <p className="task-text">{task.text}</p>
                          <span className="duration-pill">{formatDuration(task.duration)}</span>
                        </div>
                        <p className="task-meta">Added {formatDateTime(task.createdAt)}</p>
                      </>
                    )}
                  </div>

                  {!isEditing ? (
                    <div className="task-actions">
                      <button
                        type="button"
                        className="ghost-button"
                        onClick={() => startEditing(task)}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="ghost-button danger-button"
                        onClick={() => deleteTask(task.id)}
                      >
                        Delete
                      </button>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="panel schedule-panel">
        <div className="section-header">
          <div>
            <h2>Generated schedule</h2>
            <p className="section-subtitle">
              Tasks are placed around lunch and dinner, with open time shown between blocks.
            </p>
          </div>

          <div className="section-header-actions">
            <span>{generatedPlan?.items.length ?? 0}</span>
          </div>
        </div>

        {generatedPlan ? (
          <div className="schedule-wrap">
            <div className="schedule-summary">
              <div>
                <p className="summary-label">Generated</p>
                <p className="summary-value">{formatDateTime(generatedPlan.createdAt)}</p>
              </div>
              <div>
                <p className="summary-label">Planned time</p>
                <p className="summary-value">{formatDuration(scheduleSummary?.totalMinutes ?? 0)}</p>
              </div>
              <div>
                <p className="summary-label">Open time</p>
                <p className="summary-value">{formatDuration(scheduleSummary?.openMinutes ?? 0)}</p>
              </div>
              <div>
                <p className="summary-label">Unscheduled</p>
                <p className="summary-value">{generatedPlan.unscheduled.length}</p>
              </div>
            </div>

            {generatedPlan.unscheduled.length > 0 ? (
              <p className="section-empty schedule-warning">
                {generatedPlan.unscheduled.length} task
                {generatedPlan.unscheduled.length === 1 ? '' : 's'} did not fit into today.
              </p>
            ) : null}

            <ul className="schedule-list">
              {generatedPlan.items.map((item) => (
                <li key={item.id} className={`schedule-item schedule-${item.kind}`}>
                  <div>
                    <p className="schedule-time">
                      {minutesToClock(item.start)} - {minutesToClock(item.end)}
                    </p>
                    <p className="schedule-label">{item.label}</p>
                  </div>

                  <span className="schedule-tag">
                    {item.kind === 'task'
                      ? 'Task'
                      : item.kind === 'meal'
                        ? 'Meal'
                        : 'Open time'}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="empty-state">
            <p className="empty-title">No schedule yet</p>
            <p className="empty-copy">
              Add tasks, set your day, and click generate to build a full-day plan.
            </p>
          </div>
        )}
      </section>

      <section className="panel history-panel">
        <div className="section-header">
          <div>
            <h2>Recent plans</h2>
            <p className="section-subtitle">
              Reopen earlier schedules if you want to recall a previous day layout.
            </p>
          </div>
          <span>{history.length}</span>
        </div>

        {history.length === 0 ? (
          <p className="section-empty">Generate a schedule to start saving history.</p>
        ) : (
          <ul className="history-list">
            {history.map((plan) => (
              <li key={plan.id} className="history-item">
                <div className="history-body">
                  <div className="history-heading">
                    <div>
                      <p className="history-text">{formatDateTime(plan.createdAt)}</p>
                      <p className="history-meta">
                        {plan.tasks.length} tasks, {plan.items.length} blocks, {plan.unscheduled.length}{' '}
                        unscheduled
                      </p>
                    </div>
                    <button
                      type="button"
                      className="secondary-button history-button"
                      onClick={() => loadHistoryPlan(plan)}
                    >
                      Load plan
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

export default App;