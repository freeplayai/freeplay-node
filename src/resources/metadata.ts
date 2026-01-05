/**
 * Metadata Resource for Freeplay SDK
 *
 * This module provides the ability to update session and trace metadata after creation.
 *
 * Why this was created:
 * - Customers need to associate IDs and metadata with sessions/traces after the conversation ends
 *   (e.g., ticket IDs, summary IDs, resolution status generated post-conversation)
 * - Without this, users had to log dummy completions just to update metadata
 * - Provides a clean API for metadata updates without additional trace/session creation
 *
 * What it does:
 * - Exposes `client.metadata.updateSession()` to update session metadata
 * - Exposes `client.metadata.updateTrace()` to update trace metadata
 * - Uses merge semantics: new keys overwrite existing keys, preserving unmentioned keys
 * - Returns Promise<void> indicating successful update
 *
 * Usage:
 *    await fpclient.metadata.updateSession({
 *      projectId: projectId,
 *      sessionId: sessionId,
 *      metadata: { "ticket_id": "TICKET-123", "status": "resolved" }
 *    });
 */

import { CustomMetadata } from "../model.js";
import { CallSupport } from "../support.js";

export class Metadata {
  private callSupport: CallSupport;

  constructor(callSupport: CallSupport) {
    this.callSupport = callSupport;
  }

  /**
   * Update session metadata. New keys overwrite existing keys.
   *
   * @example
   * ```typescript
   * await freeplay.metadata.updateSession({
   *   projectId: "550e8400-e29b-41d4-a716-446655440000",
   *   sessionId: "660e8400-e29b-41d4-a716-446655440000",
   *   metadata: {
   *     customer_id: "cust_123",
   *     rating: 5,
   *     premium: true,
   *   },
   * });
   * ```
   */
  async updateSession({
    projectId,
    sessionId,
    metadata,
  }: {
    projectId: string;
    sessionId: string;
    metadata: CustomMetadata;
  }): Promise<void> {
    await this.callSupport.updateSessionMetadata(
      projectId,
      sessionId,
      metadata,
    );
  }

  /**
   * Update trace metadata. New keys overwrite existing keys.
   *
   * @example
   * ```typescript
   * await freeplay.metadata.updateTrace({
   *   projectId: "550e8400-e29b-41d4-a716-446655440000",
   *   sessionId: "660e8400-e29b-41d4-a716-446655440000",
   *   traceId: "770e8400-e29b-41d4-a716-446655440000",
   *   metadata: {
   *     resolution_category: "billing",
   *     resolved: true,
   *   },
   * });
   * ```
   */
  async updateTrace({
    projectId,
    sessionId,
    traceId,
    metadata,
  }: {
    projectId: string;
    sessionId: string;
    traceId: string;
    metadata: CustomMetadata;
  }): Promise<void> {
    await this.callSupport.updateTraceMetadata(
      projectId,
      sessionId,
      traceId,
      metadata,
    );
  }
}







