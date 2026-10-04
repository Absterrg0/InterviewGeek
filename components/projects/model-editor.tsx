"use client";

import { useState } from "react";
import { COMPONENT_KINDS, FLOW_KINDS, type ComponentKind, type FlowKind } from "@/lib/domain/content";
import type { Project } from "@/lib/domain/learner";
import { uniqueSlug } from "@/lib/domain/layout";
import { modelOf, modelProblems, removeComponent, type ProjectModel } from "@/lib/domain/project-model";

const KIND_LABEL: Record<ComponentKind, string> = {
  client: "Client",
  edge: "Edge / gateway",
  service: "Service",
  worker: "Worker",
  database: "Database",
  queue: "Queue",
  "object-store": "Object storage",
  cache: "Cache",
  stream: "Log / stream",
  external: "External service",
};

const FLOW_LABEL: Record<FlowKind, string> = {
  request: "Request (caller waits)",
  async: "Asynchronous",
  data: "Bulk data",
  push: "Server push",
};

function Field({
  label,
  value,
  onChange,
  placeholder,
  className = "",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="block text-xs font-medium text-ink-3 mb-1.5">{label}</span>
      <input
        className="field py-2 text-sm"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

function Select<T extends string>({
  label,
  value,
  options,
  onChange,
  className = "",
}: {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="block text-xs font-medium text-ink-3 mb-1.5">{label}</span>
      <select
        className="field py-2 text-sm"
        value={value}
        onChange={(e) => {
          const next = options.find((o) => o.value === e.target.value);
          if (next) onChange(next.value);
        }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

const KIND_OPTIONS = COMPONENT_KINDS.map((k) => ({
  value: k,
  label: KIND_LABEL[k],
}));
const FLOW_OPTIONS = FLOW_KINDS.map((k) => ({
  value: k,
  label: FLOW_LABEL[k],
}));

/**
 * Edits a draft of the model and saves it only when valid. Mount it with a key
 * that changes on save (the project's updatedAt) so the draft restarts from
 * what was stored.
 */
export function ModelEditor({ project, onSave }: { project: Project; onSave: (model: ProjectModel) => void }) {
  const [model, setModel] = useState<ProjectModel>(() => modelOf(project));
  const [newComponent, setNewComponent] = useState<{
    label: string;
    kind: ComponentKind;
  }>({ label: "", kind: "service" });
  const [newFlow, setNewFlow] = useState<{
    from: string;
    to: string;
    label: string;
    kind: FlowKind;
  }>({
    from: "",
    to: "",
    label: "",
    kind: "request",
  });
  const [newInvariant, setNewInvariant] = useState("");

  const dirty = JSON.stringify(model) !== JSON.stringify(modelOf(project));
  const problems = modelProblems(model);
  const componentOptions = model.components.map((c) => ({
    value: c.id,
    label: c.label || c.id,
  }));
  const from = newFlow.from || model.components[0]?.id || "";
  const to = newFlow.to || model.components[1]?.id || model.components[0]?.id || "";

  const updateComponent = (id: string, patch: Partial<ProjectModel["components"][number]>) =>
    setModel({
      ...model,
      components: model.components.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    });
  const updateFlow = (id: string, patch: Partial<ProjectModel["flows"][number]>) =>
    setModel({
      ...model,
      flows: model.flows.map((f) => (f.id === id ? { ...f, ...patch } : f)),
    });
  const updateInvariant = (id: string, patch: Partial<ProjectModel["invariants"][number]>) =>
    setModel({
      ...model,
      invariants: model.invariants.map((i) => (i.id === id ? { ...i, ...patch } : i)),
    });

  return (
    <div className="space-y-12 pb-24">
      <section aria-labelledby="components-heading">
        <h2 id="components-heading" className="font-display text-[1.0625rem] leading-tight">
          Components
        </h2>
        <p className="mt-1 mb-4 text-sm text-ink-2">
          The parts that run or hold state: apps, services, workers, databases, queues, third-party APIs.
        </p>
        <ul className="space-y-3">
          {model.components.map((c) => (
            <li key={c.id} className="panel p-4">
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_12rem_auto] sm:items-end">
                <Field label="Name" value={c.label} onChange={(label) => updateComponent(c.id, { label })} />
                <Select
                  label="Kind"
                  value={c.kind}
                  options={KIND_OPTIONS}
                  onChange={(kind) => updateComponent(c.id, { kind })}
                />
                <button
                  type="button"
                  className="btn btn-ghost text-sm"
                  onClick={() => setModel(removeComponent(model, c.id))}
                  aria-label={`Remove ${c.label || "component"}`}
                >
                  Remove
                </button>
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <Field
                  label="Responsible for"
                  value={c.responsibility}
                  placeholder="What it does, in one line"
                  onChange={(responsibility) => updateComponent(c.id, { responsibility })}
                />
                <Field
                  label="Durable state it owns (optional)"
                  value={c.durableState ?? ""}
                  placeholder="e.g. orders, sessions, uploaded files"
                  onChange={(v) =>
                    updateComponent(c.id, {
                      durableState: v.trim() ? v : undefined,
                    })
                  }
                />
              </div>
            </li>
          ))}
        </ul>
        <form
          className="mt-3 flex flex-wrap items-end gap-3 rounded-xl border border-dashed border-rule-strong p-4"
          onSubmit={(e) => {
            e.preventDefault();
            const label = newComponent.label.trim();
            if (!label) return;
            const id = uniqueSlug(
              label,
              model.components.map((c) => c.id),
            );
            setModel({
              ...model,
              components: [...model.components, { id, label, kind: newComponent.kind, responsibility: "" }],
            });
            setNewComponent({ label: "", kind: newComponent.kind });
          }}
        >
          <Field
            label="New component"
            value={newComponent.label}
            placeholder="e.g. Checkout API"
            onChange={(label) => setNewComponent({ ...newComponent, label })}
            className="flex-1 min-w-48"
          />
          <Select
            label="Kind"
            value={newComponent.kind}
            options={KIND_OPTIONS}
            onChange={(kind) => setNewComponent({ ...newComponent, kind })}
            className="w-48"
          />
          <button type="submit" className="btn btn-secondary" disabled={!newComponent.label.trim()}>
            Add component
          </button>
        </form>
      </section>

      <section aria-labelledby="flows-heading">
        <h2 id="flows-heading" className="font-display text-[1.0625rem] leading-tight">
          Flows
        </h2>
        <p className="mt-1 mb-4 text-sm text-ink-2">
          How requests, messages and data move. Mark whether the caller waits (request) or not (asynchronous).
        </p>
        {model.components.length < 2 ? (
          <p className="text-sm text-ink-3">Add at least two components to describe flows between them.</p>
        ) : (
          <>
            <ul className="space-y-3">
              {model.flows.map((f) => (
                <li
                  key={f.id}
                  className="panel p-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-[10rem_10rem_minmax(0,1fr)_11rem_auto] lg:items-end"
                >
                  <Select
                    label="From"
                    value={f.from}
                    options={componentOptions}
                    onChange={(v) => updateFlow(f.id, { from: v })}
                  />
                  <Select
                    label="To"
                    value={f.to}
                    options={componentOptions}
                    onChange={(v) => updateFlow(f.id, { to: v })}
                  />
                  <Field label="What moves" value={f.label} onChange={(label) => updateFlow(f.id, { label })} />
                  <Select
                    label="Kind"
                    value={f.kind}
                    options={FLOW_OPTIONS}
                    onChange={(kind) => updateFlow(f.id, { kind })}
                  />
                  <button
                    type="button"
                    className="btn btn-ghost text-sm"
                    onClick={() =>
                      setModel({
                        ...model,
                        flows: model.flows.filter((x) => x.id !== f.id),
                      })
                    }
                    aria-label={`Remove flow ${f.label}`}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
            <form
              className="mt-3 grid gap-3 rounded-xl border border-dashed border-rule-strong p-4 sm:grid-cols-2 lg:grid-cols-[10rem_10rem_minmax(0,1fr)_11rem_auto] lg:items-end"
              onSubmit={(e) => {
                e.preventDefault();
                const label = newFlow.label.trim();
                if (!label || !from || !to) return;
                const id = uniqueSlug(
                  label,
                  model.flows.map((x) => x.id),
                );
                setModel({
                  ...model,
                  flows: [...model.flows, { id, from, to, label, kind: newFlow.kind }],
                });
                setNewFlow({ ...newFlow, label: "" });
              }}
            >
              <Select
                label="From"
                value={from}
                options={componentOptions}
                onChange={(v) => setNewFlow({ ...newFlow, from: v })}
              />
              <Select
                label="To"
                value={to}
                options={componentOptions}
                onChange={(v) => setNewFlow({ ...newFlow, to: v })}
              />
              <Field
                label="New flow: what moves"
                value={newFlow.label}
                placeholder="e.g. Place order"
                onChange={(label) => setNewFlow({ ...newFlow, label })}
              />
              <Select
                label="Kind"
                value={newFlow.kind}
                options={FLOW_OPTIONS}
                onChange={(kind) => setNewFlow({ ...newFlow, kind })}
              />
              <button type="submit" className="btn btn-secondary" disabled={!newFlow.label.trim() || from === to}>
                Add flow
              </button>
            </form>
          </>
        )}
      </section>

      <section aria-labelledby="invariants-heading">
        <h2 id="invariants-heading" className="font-display text-[1.0625rem] leading-tight">
          Invariants
        </h2>
        <p className="mt-1 mb-4 text-sm text-ink-2">
          Things that must always be true, such as &ldquo;an order is charged at most once&rdquo; or &ldquo;a username
          is unique&rdquo;. You will be asked where each one is enforced.
        </p>
        <ul className="space-y-3">
          {model.invariants.map((inv) => (
            <li key={inv.id} className="panel p-4 space-y-3">
              <div className="flex items-end gap-3">
                <Field
                  label="Statement"
                  value={inv.statement}
                  onChange={(statement) => updateInvariant(inv.id, { statement })}
                  className="flex-1"
                />
                <button
                  type="button"
                  className="btn btn-ghost text-sm"
                  onClick={() =>
                    setModel({
                      ...model,
                      invariants: model.invariants.filter((x) => x.id !== inv.id),
                    })
                  }
                  aria-label={`Remove invariant ${inv.statement}`}
                >
                  Remove
                </button>
              </div>
              {model.components.length > 0 && (
                <fieldset>
                  <legend className="text-xs font-medium text-ink-3 mb-2">Enforced by</legend>
                  <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                    {model.components.map((c) => (
                      <label key={c.id} className="inline-flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          className="size-4 accent-[var(--accent)]"
                          checked={inv.enforcedBy.includes(c.id)}
                          onChange={(e) =>
                            updateInvariant(inv.id, {
                              enforcedBy: e.target.checked
                                ? [...inv.enforcedBy, c.id]
                                : inv.enforcedBy.filter((id) => id !== c.id),
                            })
                          }
                        />
                        {c.label || c.id}
                      </label>
                    ))}
                  </div>
                </fieldset>
              )}
            </li>
          ))}
        </ul>
        <form
          className="mt-3 flex flex-wrap items-end gap-3 rounded-xl border border-dashed border-rule-strong p-4"
          onSubmit={(e) => {
            e.preventDefault();
            const statement = newInvariant.trim();
            if (!statement) return;
            const id = uniqueSlug(
              statement,
              model.invariants.map((i) => i.id),
            );
            setModel({
              ...model,
              invariants: [...model.invariants, { id, statement, enforcedBy: [], mechanism: "" }],
            });
            setNewInvariant("");
          }}
        >
          <Field
            label="New invariant"
            value={newInvariant}
            placeholder="e.g. A seat is never sold twice"
            onChange={setNewInvariant}
            className="flex-1 min-w-60"
          />
          <button type="submit" className="btn btn-secondary" disabled={!newInvariant.trim()}>
            Add invariant
          </button>
        </form>
      </section>

      {dirty && (
        <div className="fixed inset-x-0 bottom-0 z-30 px-3 sm:px-5 pb-3" role="region" aria-label="Unsaved changes">
          <div className="panel mx-auto max-w-4xl px-4 py-2.5 shadow-[var(--shadow-raised)] flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm min-w-0">
              {problems.length > 0 ? (
                <p className="text-signal-gap">
                  {problems[0]}
                  {problems.length > 1 ? ` (and ${problems.length - 1} more)` : ""}
                </p>
              ) : (
                <p className="text-ink-2">Unsaved changes to the model.</p>
              )}
            </div>
            <div className="flex gap-2">
              <button type="button" className="btn btn-ghost" onClick={() => setModel(modelOf(project))}>
                Discard
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={problems.length > 0}
                onClick={() => onSave(model)}
              >
                Save model
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
