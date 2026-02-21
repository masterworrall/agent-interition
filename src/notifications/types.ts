export interface SharingNotification {
  /** URL of the notification resource in the inbox */
  id: string;
  /** WebID of the agent who shared the resource */
  actor: string;
  /** WebID of the agent the resource was shared with */
  target: string;
  /** URL of the shared resource */
  resourceUrl: string;
  /** Access modes granted */
  modes: string[];
  /** ISO 8601 timestamp */
  published: string;
  /** Human-readable summary */
  summary?: string;
}
