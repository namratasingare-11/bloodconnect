import { useEffect, useState } from 'react';
import { db } from '../db/databaseStore';

/**
 * Subscribes a React component to DatabaseStore mutations and returns a revision counter
 * that triggers clean re-renders whenever store data or MySQL live status updates.
 */
export function useDatabaseSubscription(): number {
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    return db.subscribe(() => {
      setRevision(prev => prev + 1);
    });
  }, []);

  return revision;
}
