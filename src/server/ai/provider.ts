export interface AiInput {
  systemPrompt: string;
  userText: string;
  /** JPEG frames, in time order. */
  frames: Buffer[];
}

export interface AiProvider {
  readonly name: string;
  readonly model: string;
  /** Returns the parsed JSON, or the raw text if the model did not return JSON. */
  generate(input: AiInput): Promise<unknown>;
}

export class AiError extends Error {
  constructor(
    message: string,
    public readonly retryable: boolean,
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'AiError';
  }
}
