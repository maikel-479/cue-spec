export interface CueDirective {
  raw: string;
  element: string;
  tags: string[];
  scope: ScopeRef | null;
  line: number;
  col: number;
}

export interface ScopeRef {
  type: "file" | "id" | "last" | "glob";
  value: string;
  mode: "augment" | "replace";
}

export interface ElementDef {
  name: string;
  description: string;
  version: string;
  class: "model" | "harness";
  handler?: string;
  allowedTools?: string;
  inputs?: string[];
  tags: Record<string, TagDef>;
  uses: UsesDef[];
  bodyPath: string;
  tomlPath: string;
}

export interface TagDef {
  description: string;
  inline?: string;
  overrides: string[];
  exclusive?: boolean;
}

export interface UsesDef {
  tag: string;
  source: string;
}

export interface SectionRange {
  start: number;
  end: number;
  tag: string;
}

export interface ResolvedDirective {
  directive: CueDirective;
  element: ElementDef;
  sections: string[];
  text: string;
}

export interface HookInput {
  session_id: string;
  transcript_path: string;
  cwd: string;
  permission_mode: string;
  hook_event_name: string;
  prompt: string;
}

export interface HookOutput {
  hookSpecificOutput?: {
    hookEventName: string;
    additionalContext?: string;
    modifiedPrompt?: string;
  };
  decision?: "block";
  reason?: string;
}
