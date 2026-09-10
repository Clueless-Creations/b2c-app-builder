export type CommandMeta = {
  script: string;
  prefixArgs?: string[];
  summary: string;
  aliasOf?: string;
};

export type HelpCluster = {
  label?: string;
  commands: string[];
};

export type HelpSection = {
  heading: string;
  commands?: string[];
  clusters?: HelpCluster[];
};

export declare const COMMANDS: Map<string, CommandMeta>;
export declare const HELP_SECTIONS: HelpSection[];
export declare const HELP_WRAP_COLUMNS: number;
export function listedCommandNames(sections?: HelpSection[]): string[];
export function renderUsage(commands?: Map<string, CommandMeta>): string;
