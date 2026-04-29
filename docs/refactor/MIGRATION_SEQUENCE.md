# Migration Sequence

Recommended execution order for the structural refactor:

1. Freeze architecture and repo rules in docs.
2. Create skeleton folders under `core/`, `migration/`, `shared/`, `apps/`, `openapi/`, and `infra/`.
3. Introduce `shared/src/lib` and `shared/src/lib/field-mapping` with non-business helpers first.
4. Add `core/api-worker` as the future public proxy layer.
5. Move dashboard frontend into `apps/dashboard/admin-console-v1`.
6. Move canonical production workers into `core/`.
7. Move migration and legacy workers into `migration/`.
8. Quarantine legacy chat overlap under `migration/legacy-chat/`.
9. Consolidate specs under `openapi/` and infra references under `infra/`.
10. Resolve duplicate suffix files only after canonical runtime files are verified.

Guardrails:
- preserve worker boundaries
- do not let frontend call truth workers directly
- do not merge client lane with model/apply lane
- do not move TarT into client purchase guidance
- keep Kenji as the continuity layer for client-facing flow
