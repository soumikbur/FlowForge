import {
  ConnectorDefinition,
  ConnectorCategory,
  ConnectorDefinitionSchema,
} from "@flowforge/shared";

export interface ConnectorHandlerContext {
  organizationId: string;
  connectionId?: string;
  credentials: Record<string, unknown>;
  timeoutMs?: number;
  idempotentRetry?: boolean;
}

export interface ConnectorHandlerResult {
  success: boolean;
  data: unknown;
  metadata?: Record<string, unknown>;
}

export type ConnectorHandler = (
  operationId: string,
  parameters: Record<string, unknown>,
  context: ConnectorHandlerContext,
) => Promise<ConnectorHandlerResult>;

export type ConnectorTester = (
  credentials: Record<string, unknown>,
  config?: Record<string, unknown>,
) => Promise<{
  success: boolean;
  message: string;
  latencyMs?: number;
  errorCategory?: string;
}>;

export class ConnectorRegistry {
  private connectors = new Map<string, ConnectorDefinition>();
  private handlers = new Map<string, ConnectorHandler>();
  private testers = new Map<string, ConnectorTester>();

  /**
   * Registers a connector definition, handler, and optional test probe.
   * Throws an error if connector ID is already registered or schema is invalid.
   */
  public register(
    definition: ConnectorDefinition,
    handler: ConnectorHandler,
    tester?: ConnectorTester,
  ): void {
    const parsed = ConnectorDefinitionSchema.safeParse(definition);
    if (!parsed.success) {
      throw new Error(
        `Invalid connector definition for '${definition?.id}': ${parsed.error.message}`,
      );
    }

    if (this.connectors.has(definition.id)) {
      throw new Error(
        `Connector with ID '${definition.id}' is already registered in registry.`,
      );
    }

    this.connectors.set(definition.id, parsed.data);
    this.handlers.set(definition.id, handler);
    if (tester) {
      this.testers.set(definition.id, tester);
    }
  }

  /**
   * Retrieves connector definition by ID.
   */
  public get(id: string): ConnectorDefinition {
    const conn = this.connectors.get(id);
    if (!conn) {
      throw new Error(`Connector '${id}' not found in registry.`);
    }
    return conn;
  }

  /**
   * Retrieves connector operation handler by ID.
   */
  public getHandler(id: string): ConnectorHandler {
    const handler = this.handlers.get(id);
    if (!handler) {
      throw new Error(
        `Execution handler for connector '${id}' not registered.`,
      );
    }
    return handler;
  }

  /**
   * Retrieves connection test probe by ID if registered.
   */
  public getTester(id: string): ConnectorTester | undefined {
    return this.testers.get(id);
  }

  /**
   * Checks if connector exists in registry.
   */
  public has(id: string): boolean {
    return this.connectors.has(id);
  }

  /**
   * Lists all registered connectors, optionally filtered by category.
   */
  public list(category?: ConnectorCategory): ConnectorDefinition[] {
    const all = Array.from(this.connectors.values());
    if (category) {
      return all.filter((c) => c.category === category);
    }
    return all;
  }
}

export const defaultConnectorRegistry = new ConnectorRegistry();
