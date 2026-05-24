/**
 * Toast queue — non-blocking transient notifications.
 * Auto-dismiss timing per spec: success/info 4s, warning 7s, error persistent.
 */

export type ToastKind = "success" | "info" | "warning" | "error";

export interface Toast {
  id: number;
  kind: ToastKind;
  title: string;
  body?: string;
}

class ToastStore {
  items: Toast[] = $state([]);
  private nextId = 1;

  push(kind: ToastKind, title: string, body?: string) {
    const id = this.nextId++;
    this.items = [...this.items, { id, kind, title, body }];
    if (kind !== "error") {
      const ms = kind === "warning" ? 7000 : 4000;
      setTimeout(() => this.dismiss(id), ms);
    }
  }

  success(title: string, body?: string) { this.push("success", title, body); }
  info(title: string, body?: string)    { this.push("info", title, body); }
  warning(title: string, body?: string) { this.push("warning", title, body); }
  error(title: string, body?: string)   { this.push("error", title, body); }

  dismiss(id: number) {
    this.items = this.items.filter((t) => t.id !== id);
  }
}

export const toast = new ToastStore();
