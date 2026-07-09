def normalize_connection_id(connection_id: str) -> str:
    """Strip the ``db_`` prefix that ``/databases/list`` adds to connection ids but the
    introspect / federated-query endpoints don't accept. So an id like ``db_SORDER``
    (from list_connections) becomes ``SORDER`` (what those endpoints look up)."""
    cid = str(connection_id)
    return cid[3:] if cid.startswith("db_") else cid


def normalize_attach_list(attach_databases: list | None) -> list:
    """normalize_connection_id over an attach_databases list. Non-dict entries and
    entries without connection_id pass through untouched (backend validates shape)."""
    return [
        {**db, "connection_id": normalize_connection_id(db["connection_id"])}
        if isinstance(db, dict) and db.get("connection_id") else db
        for db in (attach_databases or [])
    ]
