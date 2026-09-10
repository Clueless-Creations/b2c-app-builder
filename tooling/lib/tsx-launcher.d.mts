export function resolveTsxCli(packageRoot: string): string;
export function resolveCompiledScript(packageRoot: string, scriptPath: string): string | undefined;
export function resolveRuntimeNodeArgs(packageRoot: string, args: string[]): string[];
export function launchTypeScript(packageRoot: string, args: string[], extraEnv?: Record<string, string>): number;
