export interface AgentDirectoryEntry {
  /** Agent's WebID */
  webId: string;
  /** Agent's display name */
  name: string;
  /** Agent's Pod URL */
  podUrl: string;
  /** Agent's capabilities */
  capabilities: string[];
}
