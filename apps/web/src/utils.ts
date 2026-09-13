export const formatDate = (value?: string) => value ? new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "—";
export const formatPercent = (value?: number) => value == null ? "—" : `${Number(value).toFixed(value % 1 ? 1 : 0)}%`;
export const titleStatus = (status?: string) => status?.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()) ?? "Pending";
