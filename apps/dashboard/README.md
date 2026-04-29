# Dashboard Apps

This folder is reserved for the real dashboard surface.

Current target:
- `admin-console-v1/`

Architecture rule:
- `/dashboard` must remain the single real dashboard
- the dashboard frontend should talk to the facade/proxy layer, not directly to truth workers
