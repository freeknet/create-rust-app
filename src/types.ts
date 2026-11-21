/** User choices accepted by the scaffolder. */
export interface Answers {
  name: string;
  /** Executable name when it differs from the crate (`[[bin]]`); '' = the crate name. */
  bin: string;
  displayName: string;
  tagline: string;
  author: string;
  github: string;
  email: string;
  license: 'MIT' | 'MIT+CommonsClause' | 'Apache-2.0' | 'MIT OR Apache-2.0';
  edition: '2024' | '2021';
  msrv: string;
  toolchain: string;
  accent: string;
  kind: 'cli' | 'gui' | 'tui' | 'lib' | 'workspace';
  guiStack: 'eframe' | 'winit-glow';
  /** Shipped theme whose surfaces the signature theme uses (`--base`); '' when there is no GUI. */
  themeBase: string;
  crates: {
    errors: 'anyhow'; thiserror: boolean; logging: 'log' | 'env_logger' | 'tracing';
    serde: boolean; async: 'none' | 'tokio'; http: 'none' | 'ureq' | 'reqwest';
    sqlite: boolean; clap: boolean;
  };
  features: {
    themes: boolean; brand: boolean; motion: boolean; icons: boolean; config: boolean;
    winres: boolean; tray: boolean; singleInstance: boolean; commandPalette: boolean;
    screenshotExample: boolean; demo: boolean; subcommands: boolean;
  };
  tooling: {
    ci: boolean; release: boolean; cargoDeny: boolean; dependabot: boolean;
    toolchainPin: boolean; agentDocs: boolean; headerCheck: boolean; unsafeCheck: boolean;
    changelogGen: boolean; issueTemplates: boolean; codeowners: boolean; securityMd: boolean;
  };
  post: { git: boolean; fetch: boolean; cargoCheck: boolean; open: 'none' | 'code' | 'cursor' };
  preset: string | null;
}

/** The answers `--json` reports: `guiStack` reads '' (like `themeBase`) for kinds without a GUI. */
export type ReportedAnswers = Omit<Answers, 'guiStack'> & { guiStack: Answers['guiStack'] | '' };

export type PartialAnswers = {
  [K in keyof Answers]?: Answers[K] extends object ? Partial<Answers[K]> : Answers[K];
};

export type TokenKey = 'name' | 'bin' | 'crate' | 'Name' | 'NAME' | 'appCrate' | 'appCrateSnake'
  | 'displayName' | 'tagline' | 'author' | 'github' | 'email' | 'year' | 'license'
  | 'edition' | 'msrv' | 'toolchain' | 'accent'
  | 'baseName' | 'baseMode' | 'baseApp' | 'basePanel' | 'baseRaised' | 'baseHover' | 'baseBorder'
  | 'baseText' | 'baseTextMuted' | 'baseDanger' | 'baseWarning' | 'baseSuccess' | 'baseSpan' | 'baseAccentRgb';

export interface Ctx extends Answers {
  crate: string;
  Name: string;
  NAME: string;
  appCrate: string;
  year: string;
  hasGui: boolean;
  workspace: boolean;
  flags: Set<string>;
  tokens: Record<TokenKey, string>;
}

export interface Dep {
  name: string;
  version: string;
  features?: string[];
  defaultFeatures?: boolean;
  kind?: 'normal' | 'dev' | 'build';
  target?: string;
  crate?: 'app' | 'xtask';
}

export type PlanEntry = { dest: string; content: string } | { dest: string; copyFrom: string };
export interface Group { id: string; when: (ctx: Ctx) => boolean; mount?: (ctx: Ctx) => string }
export interface Caps {
  tier: 'truecolor' | 'ansi256' | 'ansi16' | 'none';
  /** Glyph set: full Unicode, the Windows console's Consolas subset, or ASCII. See ui/glyphs.ts. */
  glyphs: 'full' | 'console' | 'ascii';
  unicode: boolean;
  tty: boolean;
  columns: number;
  animate: boolean;
}
