def normalize_connection_id(connection_id: str) -> str:
    """Strip the ``db_`` prefix that ``/databases/list`` adds to connection ids but the
    introspect / federated-query endpoints don't accept. So an id like ``db_SORDER``
    (from list_connections) becomes ``SORDER`` (what those endpoints look up)."""
    cid = str(connection_id)
    return cid[3:] if cid.startswith("db_") else cid
