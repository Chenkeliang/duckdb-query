"""
Property-based tests for keyboard shortcuts API
Feature: custom-keyboard-shortcuts, Property 4: Persistence Round-Trip
Validates: Requirements 2.4, 4.2, 4.3
"""

import pytest
from hypothesis import given, strategies as st, settings
from fastapi.testclient import TestClient
import sys
import os

# Add api directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from main import app
from routers.settings import DEFAULT_SHORTCUTS

client = TestClient(app)


# Strategy for generating valid shortcut strings
shortcut_modifiers = st.sampled_from(["Cmd", "Ctrl", "Alt", "Cmd+Shift", "Ctrl+Shift", "Cmd+Alt", "Ctrl+Alt"])
shortcut_keys = st.sampled_from(list("ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"))

@st.composite
def shortcut_string(draw):
    """Generate valid shortcut strings like 'Cmd+K', 'Ctrl+Shift+A'"""
    modifier = draw(shortcut_modifiers)
    key = draw(shortcut_keys)
    return f"{modifier}+{key}"


class TestShortcutsAPI:
    """Basic API tests"""
    
    def test_get_shortcuts_returns_all_defaults(self):
        """Test that GET returns all default shortcuts"""
        response = client.get("/api/settings/shortcuts")
        assert response.status_code == 200
        
        data = response.json()
        assert data["success"] is True
        assert "shortcuts" in data["data"]
        assert "defaults" in data["data"]
        
        # Should have all default shortcuts
        shortcuts = data["data"]["shortcuts"]
        assert len(shortcuts) == len(DEFAULT_SHORTCUTS)
        
        # Each shortcut should have required fields
        for shortcut in shortcuts:
            assert "action_id" in shortcut
            assert "shortcut" in shortcut
            assert shortcut["action_id"] in DEFAULT_SHORTCUTS
    
    def test_update_shortcut_invalid_action(self):
        """Test that updating invalid action_id returns error"""
        response = client.put(
            "/api/settings/shortcuts/invalid_action",
            json={"shortcut": "Cmd+X"}
        )
        assert response.status_code == 400
    
    def test_reset_all_shortcuts(self):
        """Test resetting all shortcuts"""
        response = client.post(
            "/api/settings/shortcuts/reset",
            json={}
        )
        assert response.status_code == 200
        assert response.json()["success"] is True


class TestPersistenceRoundTrip:
    """
    Property 4: Persistence Round-Trip
    For any shortcut update, saving to DuckDB and then loading SHALL return the same shortcut value.
    """
    
    @given(shortcut=shortcut_string())
    @settings(max_examples=100)
    def test_update_then_load_returns_same_value(self, shortcut: str):
        """
        **Feature: custom-keyboard-shortcuts, Property 4: Persistence Round-Trip**
        **Validates: Requirements 2.4, 4.2, 4.3**
        
        For any valid shortcut string, updating and then loading should return the same value.
        """
        action_id = "openCommandPalette"  # Use a known valid action
        
        # Update the shortcut
        update_response = client.put(
            f"/api/settings/shortcuts/{action_id}",
            json={"shortcut": shortcut}
        )
        assert update_response.status_code == 200
        
        # Load shortcuts
        get_response = client.get("/api/settings/shortcuts")
        assert get_response.status_code == 200
        
        # Find the updated shortcut
        shortcuts = get_response.json()["data"]["shortcuts"]
        found = None
        for s in shortcuts:
            if s["action_id"] == action_id:
                found = s
                break
        
        assert found is not None
        assert found["shortcut"] == shortcut
        
        # Cleanup: reset to default
        client.post("/api/settings/shortcuts/reset", json={"action_id": action_id})
    
    @given(action_id=st.sampled_from(list(DEFAULT_SHORTCUTS.keys())))
    @settings(max_examples=100)
    def test_reset_restores_default(self, action_id: str):
        """
        **Feature: custom-keyboard-shortcuts, Property 5: Reset Restores Defaults**
        **Validates: Requirements 3.1, 3.2**
        
        For any action, after reset, the shortcut should equal its default value.
        """
        # First, update to a custom value
        client.put(
            f"/api/settings/shortcuts/{action_id}",
            json={"shortcut": "Cmd+Shift+Z"}
        )
        
        # Reset the shortcut
        reset_response = client.post(
            "/api/settings/shortcuts/reset",
            json={"action_id": action_id}
        )
        assert reset_response.status_code == 200
        
        # Load and verify it's back to default
        get_response = client.get("/api/settings/shortcuts")
        shortcuts = get_response.json()["data"]["shortcuts"]
        
        found = None
        for s in shortcuts:
            if s["action_id"] == action_id:
                found = s
                break
        
        assert found is not None
        assert found["shortcut"] == DEFAULT_SHORTCUTS[action_id]


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
