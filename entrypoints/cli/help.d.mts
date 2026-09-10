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

export const COMMANDS: Map<string, CommandMeta>;
export const HELP_SECTIONS: HelpSection[];
export function listedCommandNames(sections?: HelpSection[]): string[];
export function renderUsage(commands?: Map<string, CommandMeta>): string;
