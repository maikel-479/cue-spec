# Security checklist

Loaded only when a review is scoped to `security` or touches auth/input paths.

- **Injection:** SQL/command/XML/header injection from untrusted input.
- **Secrets:** credentials, keys, tokens committed or logged; use the secret store.
- **Authz:** missing permission checks, IDOR, privilege escalation.
- **Deserialization:** untrusted input passed to `eval`, `pickle`, `yaml.load`, etc.
