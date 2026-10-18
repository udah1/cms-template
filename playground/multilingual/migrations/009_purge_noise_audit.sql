-- Drop non-CMS noise from audit history (auth sessions / password / preview tokens).
-- CMS change history should only reflect content mutations and publish/rollback.

DELETE FROM audit_log
WHERE entity_type IN ('auth', 'preview')
   OR action IN (
     'auth.login',
     'auth.logout',
     'auth.change_password',
     'preview.create'
   );
