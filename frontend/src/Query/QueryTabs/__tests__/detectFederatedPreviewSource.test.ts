/** 2026-09-08: standalone mysql_query must retain attachments when opened for preview/save. */
import { describe, expect, it } from 'vitest';
import { detectFederatedPreviewSource } from '../detectFederatedPreviewSource';

describe('query-function preview source', () => {
  it('uses the literal alias without treating remote SQL as local table references', () => {
    expect(detectFederatedPreviewSource(
      "SELECT * FROM mysql_query('SORDER', $$SELECT * FROM business.orders$$)",
      [{ id: 'sorder', name: 'SORDER', type: 'mysql', status: 'active', params: {} }],
    )).toEqual({ type: 'federated', attachDatabases: [{ alias: 'SORDER', connectionId: 'sorder' }] });
  });
});
