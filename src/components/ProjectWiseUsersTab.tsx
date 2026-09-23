import { useEffect, useState } from 'react';
import { E365UsagePanel } from '@/components/E365UsagePanel';
import type { E365UsageRow, ProjectWiseWebUserRow } from '@/types/monitoring';

interface ProjectWiseUsersTabProps {
  canManage: boolean;
  e365Rows: E365UsageRow[];
  isLocalPreview: boolean;
  onImportE365Files: (files: File[]) => Promise<E365UsageRow[]>;
  webRows: ProjectWiseWebUserRow[];
}

export function ProjectWiseUsersTab({
  canManage,
  e365Rows,
  isLocalPreview,
  onImportE365Files,
  webRows,
}: ProjectWiseUsersTabProps) {
  const [localWebRows, setLocalWebRows] = useState<ProjectWiseWebUserRow[]>(webRows);

  useEffect(() => {
    if (webRows.length > 0) {
      setLocalWebRows(webRows);
    }
  }, [webRows]);

  return (
    <E365UsagePanel
      canManage={canManage}
      initialRows={e365Rows}
      isLocalPreview={isLocalPreview}
      onImportE365Files={onImportE365Files}
      portalRows={localWebRows}
      onPortalRowsLoaded={setLocalWebRows}
    />
  );
}
