export interface ContextBudget {
  maxBytes: number;
  maxTokens: number;
}

export interface ContextExclusion {
  sectionId: string;
  reasonCode: string;
}

export interface ContextOverflow {
  sectionId: string;
  bytes: number;
  tokens: number;
}

export interface ContextCapsule {
  routeId: string;
  selectedId: string;
  sections: Array<{ sectionId: string; revision: string; path: string; bytes: number; tokens: number }>;
  exclusions: ContextExclusion[];
  overflow: ContextOverflow[];
  bytes: number;
  tokens: number;
  sourceIds: string[];
}

export class ContextCompileError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}
