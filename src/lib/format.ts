const TIME_ZONE = "Europe/Rome";

export function formatDate(value: string | Date): string {
  return new Intl.DateTimeFormat("it-IT", { dateStyle: "medium", timeZone: TIME_ZONE }).format(
    new Date(value),
  );
}

export function formatDateTime(value: string | Date): string {
  return new Intl.DateTimeFormat("it-IT", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: TIME_ZONE,
  }).format(new Date(value));
}
