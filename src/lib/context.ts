import type { Persona } from "./persona";

export type FillableElement =
  | HTMLInputElement
  | HTMLTextAreaElement
  | HTMLSelectElement;

const FILLABLE_INPUT_TYPES = new Set([
  "text",
  "search",
  "email",
  "url",
  "tel",
  "password",
  "number",
  "date",
  "datetime-local",
  "month",
  "time",
  "week",
  "color",
]);

export function toFillable(el: Element | null): FillableElement | null {
  if (!el) return null;
  if (el instanceof HTMLTextAreaElement) return el;
  if (el instanceof HTMLSelectElement) return el;
  if (el instanceof HTMLInputElement) {
    return FILLABLE_INPUT_TYPES.has(el.type) ? el : null;
  }
  const closest = el.closest("input,textarea,select");
  if (!closest) return null;
  return toFillable(closest);
}

export function getFocusedFillable(): FillableElement | null {
  let node: Element | null = document.activeElement;
  while (node instanceof HTMLIFrameElement) {
    try {
      node = node.contentDocument?.activeElement ?? null;
    } catch {
      return null;
    }
  }
  return toFillable(node);
}

export type FieldDescriptor = {
  tag: "input" | "textarea" | "select";
  type?: string;
  name?: string;
  id?: string;
  placeholder?: string;
  ariaLabel?: string;
  label?: string;
  required?: boolean;
  maxLength?: number;
  pattern?: string;
  autocomplete?: string;
  options?: string[];
  currentValue?: string;
  lengthHint?: LengthHint;
};

export type FormContext = {
  pageTitle: string;
  pageUrl: string;
  pageLanguage: string;
  pageSummary?: string;
  persona?: Persona;
  focused: FieldDescriptor;
  siblings: FieldDescriptor[];
};

type LengthHint = "short" | "medium" | "long";

const MAX_SIBLINGS = 12;
const MAX_TEXT = 120;

function estimateTextareaLengthHint(el: HTMLTextAreaElement): LengthHint {
  const rows = el.rows;
  if (rows <= 2) return "short";
  if (rows <= 6) return "medium";
  return "long";
}

function clip(text: string | null | undefined): string | undefined {
  if (!text) return undefined;
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (!trimmed) return undefined;
  return trimmed.length > MAX_TEXT ? `${trimmed.slice(0, MAX_TEXT)}…` : trimmed;
}

function findLabel(el: Element): string | undefined {
  if (
    el instanceof HTMLInputElement ||
    el instanceof HTMLTextAreaElement ||
    el instanceof HTMLSelectElement
  ) {
    if (el.labels && el.labels.length > 0) {
      return clip(Array.from(el.labels).map((l) => l.innerText).join(" "));
    }
    if (el.id) {
      const labelEl = el.ownerDocument.querySelector(
        `label[for="${CSS.escape(el.id)}"]`,
      );
      if (labelEl instanceof HTMLLabelElement) return clip(labelEl.innerText);
    }
    const wrappingLabel = el.closest("label");
    if (wrappingLabel instanceof HTMLLabelElement)
      return clip(wrappingLabel.innerText);
  }
  return undefined;
}

function describe(el: Element): FieldDescriptor | null {
  if (el instanceof HTMLInputElement) {
    return {
      tag: "input",
      type: el.type,
      name: el.name || undefined,
      id: el.id || undefined,
      placeholder: clip(el.placeholder),
      ariaLabel: clip(el.getAttribute("aria-label")),
      label: findLabel(el),
      required: el.required || undefined,
      maxLength: el.maxLength > 0 ? el.maxLength : undefined,
      pattern: el.pattern || undefined,
      autocomplete: el.autocomplete || undefined,
      currentValue: clip(el.value),
    };
  }
  if (el instanceof HTMLTextAreaElement) {
    return {
      tag: "textarea",
      name: el.name || undefined,
      id: el.id || undefined,
      placeholder: clip(el.placeholder),
      ariaLabel: clip(el.getAttribute("aria-label")),
      label: findLabel(el),
      required: el.required || undefined,
      maxLength: el.maxLength > 0 ? el.maxLength : undefined,
      autocomplete: el.autocomplete || undefined,
      currentValue: clip(el.value),
      lengthHint: estimateTextareaLengthHint(el),
    };
  }
  if (el instanceof HTMLSelectElement) {
    return {
      tag: "select",
      name: el.name || undefined,
      id: el.id || undefined,
      ariaLabel: clip(el.getAttribute("aria-label")),
      label: findLabel(el),
      required: el.required || undefined,
      options: Array.from(el.options)
        .map((o) => clip(o.textContent) ?? "")
        .filter(Boolean)
        .slice(0, 32),
      currentValue: clip(el.value),
    };
  }
  return null;
}

export function detectLanguage(doc: Document): string {
  return doc.documentElement.lang || navigator.language || "en";
}

export function buildContext(
  focused: FillableElement,
  extras?: { pageSummary?: string; persona?: Persona },
): FormContext {
  const focusedDescriptor = describe(focused);
  if (!focusedDescriptor) {
    throw new Error("focused element is not describable");
  }
  const form = focused.form ?? focused.closest("form");
  const siblings: FieldDescriptor[] = [];
  if (form) {
    for (const el of Array.from(form.elements)) {
      if (el === focused) continue;
      const desc = describe(el);
      if (!desc) continue;
      siblings.push(desc);
      if (siblings.length >= MAX_SIBLINGS) break;
    }
  }
  const doc = focused.ownerDocument;
  return {
    pageTitle: clip(doc.title) ?? "",
    pageUrl: doc.defaultView?.location.href ?? "",
    pageLanguage: detectLanguage(doc),
    pageSummary: extras?.pageSummary,
    persona: extras?.persona,
    focused: focusedDescriptor,
    siblings,
  };
}

const MAX_PLANNER_FIELDS = 20;

export type PlannerContext = {
  pageLanguage: string;
  pageTitle: string;
  pageUrl: string;
  pageSummary?: string;
  formFields: FieldDescriptor[];
};

export function buildPlannerContext(
  form: HTMLFormElement,
  extras?: { pageSummary?: string },
): PlannerContext {
  const doc = form.ownerDocument;
  const formFields: FieldDescriptor[] = [];
  for (const el of Array.from(form.elements)) {
    const desc = describe(el);
    if (!desc) continue;
    formFields.push(desc);
    if (formFields.length >= MAX_PLANNER_FIELDS) break;
  }
  return {
    pageLanguage: detectLanguage(doc),
    pageTitle: clip(doc.title) ?? "",
    pageUrl: doc.defaultView?.location.href ?? "",
    pageSummary: extras?.pageSummary,
    formFields,
  };
}
