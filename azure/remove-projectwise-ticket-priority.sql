-- Apply after deploying the server that no longer writes tickets.priority.
-- Removes only the obsolete ProjectWise classification; other ticket fields remain intact.
ALTER TABLE tickets DROP COLUMN IF EXISTS priority;
