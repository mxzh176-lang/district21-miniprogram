# Project Guardrails

Before changing this repository, read `docs/DEVELOPMENT_GUARDRAILS.md` and treat it as a release gate.

Non-negotiable priorities, in order:

1. Keep the mini program eligible for filing, personal-entity verification and WeChat review.
2. Keep the product an internal organization and archive management tool. Do not add public posting, comments, follower relationships, forwarding feeds, forums, open chat or other social/UGC behavior without a new compliance review.
3. Preserve organization-scoped, role-scoped, position-scoped and term-scoped authorization. UI hiding is never sufficient; cloud functions must enforce write permissions.
4. Pages must call `utils/api.js`; pages must not call CloudBase or databases directly. Provider-specific code belongs in services/adapters.
5. Keep data portable to an independent server, MySQL/RDS and OSS. Do not store images directly in event documents.
6. Collect the minimum personal data. Internal identity registration is not government or WeChat real-name verification. Never require ID cards, facial data or phone numbers unless a later documented legal and product review requires them.
7. Do not delete audit logs, weaken permissions or broaden data visibility merely to make a feature work.
8. Whenever files under `cloudfunctions/` change, explicitly tell the user that the affected cloud function must be redeployed before testing the feature.
9. Dark-theme forms must keep typed text visible on real devices and in WeChat DevTools. Inputs and textareas need explicit text color, placeholder color, cursor color and stable native rendering settings.

If a requested feature conflicts with these rules, stop and explain the conflict before implementation.
