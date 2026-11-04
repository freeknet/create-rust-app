/** User choices accepted by the scaffolder. */
export interface Answers {
  name: string;
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
  crates: {
    errors: 'anyhow'; thiserror: boolean; logging: 'log' | 'env_logger' | 'tracing';
    serde: boolean; async: 'none' | 'tokio'; http: 'none' | 'ureq' | 'reqwest';
    sqlite: boolean; clap: boolean;
  };
  features: {
    themes: boolean; brand: boolean; motion: boolean; icons: boolean; config: boolean;
    winres: boolean; tray: boolean; singleInstance: boolean; commandPalette: boolean;
    screenshotExample: boolean;
  };
  tooling: {
    ci: boolean; release: boolean; cargoDeny: boolean; dependabot: boolean;
    toolchainPin: boolean; agentDocs: boolean; headerCheck: boolean; unsafeCheck: boolean;
    changelogGen: boolean; issueTemplates: boolean; codeowners: boolean; securityMd: boolean;
  };
  post: { git: boolean; fetch: boolean; cargoCheck: boolean; open: 'none' | 'code' | 'cursor' };
  preset: string | null;
}

export type PartialAnswers = {
  [K in keyof Answers]?: Answers[K] extends object ? Partial<Answers[K]> : Answers[K];
};

export type TokenKey = 'name' | 'crate' | 'Name' | 'NAME' | 'appCrate' | 'appCrateSnake'
  | 'displayName' | 'tagline' | 'author' | 'github' | 'email' | 'year' | 'license'
  | 'edition' | 'msrv' | 'toolchain' | 'accent';

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
  unicode: boolean;
  tty: boolean;
  columns: number;
  animate: boolean;
}
