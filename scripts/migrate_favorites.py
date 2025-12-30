#!/usr/bin/env python3
"""
SQL Favorites Migration Script
==============================
Migrates SQL favorites from legacy JSON file to DuckDB metadata storage.

Usage:
    python scripts/migrate_favorites.py

Behavior:
    1. Reads `config/sql-favorites.json`
    2. Imports valid entries into DuckDB `system_sql_favorites` table
    3. Skips duplicates (based on ID)
    4. Renames source file to `sql-favorites.json.migrated` on success
"""

import sys
import os
from pathlib import Path

# Add project root and api directory to python path
project_root = Path(__file__).resolve().parent.parent
sys.path.append(str(project_root))
sys.path.append(str(project_root / "api"))

from api.core.metadata_manager import metadata_manager

def main():
    print("Starting SQL Favorites migration...")
    
    try:
        result = metadata_manager.import_legacy_sql_favorites()
        
        if result["success"]:
            print("\nMigration Successful!")
            print(f"  - Imported: {result.get('imported', 0)}")
            print(f"  - Source: {result.get('path')}")
            print(f"  - Archived: {result.get('migrated_path')}")
            sys.exit(0)
        else:
            print("\nMigration Failed or Skipped!")
            print(f"  - Reason: {result.get('message')}")
            if "path" in result:
                print(f"  - Path: {result['path']}")
            
            # If it's just "file not found", it's not really an error for the script execution per se, 
            # but usually means nothing to migrate.
            if "未找到配置文件" in result.get("message", ""):
                sys.exit(0)
            else:
                sys.exit(1)
                
    except Exception as e:
        print(f"\nCritical Error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    main()
