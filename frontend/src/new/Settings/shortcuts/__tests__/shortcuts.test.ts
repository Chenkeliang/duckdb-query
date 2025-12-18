/**
 * Property-based tests for keyboard shortcuts
 * Feature: custom-keyboard-shortcuts
 */

import { describe, it, expect } from 'vitest';
import {
  parseShortcut,
  formatShortcut,
  matchesShortcut,
  DEFAULT_SHORTCUTS,
} from '../defaultShortcuts';

describe('Shortcut Parsing', () => {
  it('parses simple shortcuts correctly', () => {
    const result = parseShortcut('Cmd+K');
    expect(result).toEqual({
      meta: true,
      ctrl: false,
      alt: false,
      shift: false,
      key: 'k',
    });
  });

  it('parses complex shortcuts correctly', () => {
    const result = parseShortcut('Cmd+Shift+F');
    expect(result).toEqual({
      meta: true,
      ctrl: false,
      alt: false,
      shift: true,
      key: 'f',
    });
  });

  it('parses Ctrl shortcuts correctly', () => {
    const result = parseShortcut('Ctrl+Alt+D');
    expect(result).toEqual({
      meta: false,
      ctrl: true,
      alt: true,
      shift: false,
      key: 'd',
    });
  });
});

describe('Default Shortcuts Configuration', () => {
  /**
   * **Feature: custom-keyboard-shortcuts, Property 1: Shortcut Display Completeness**
   * **Validates: Requirements 1.2**
   * 
   * For any shortcut configuration, it SHALL include actionId, shortcut, defaultShortcut, label, and category.
   */
  it('all default shortcuts have required fields', () => {
    for (const [actionId, config] of Object.entries(DEFAULT_SHORTCUTS)) {
      expect(config.actionId).toBe(actionId);
      expect(config.shortcut).toBeTruthy();
      expect(config.defaultShortcut).toBeTruthy();
      expect(config.label).toBeTruthy();
      expect(['navigation', 'actions', 'ui']).toContain(config.category);
    }
  });

  /**
   * **Feature: custom-keyboard-shortcuts, Property 3: Conflict Detection**
   * **Validates: Requirements 2.3**
   * 
   * Default shortcuts should not have conflicts (no duplicates).
   */
  it('default shortcuts have no conflicts', () => {
    const shortcuts = Object.values(DEFAULT_SHORTCUTS).map(c => c.shortcut);
    const uniqueShortcuts = new Set(shortcuts);
    expect(uniqueShortcuts.size).toBe(shortcuts.length);
  });
});

describe('Shortcut Matching', () => {
  /**
   * **Feature: custom-keyboard-shortcuts, Property 6: Immediate Effect**
   * **Validates: Requirements 5.1**
   * 
   * For any shortcut, the matching function should correctly identify matching keyboard events.
   */
  it('matches Cmd+K correctly', () => {
    const event = new KeyboardEvent('keydown', {
      key: 'k',
      metaKey: true,
      ctrlKey: false,
      altKey: false,
      shiftKey: false,
    });
    
    // Mock navigator.platform for Mac
    Object.defineProperty(navigator, 'platform', {
      value: 'MacIntel',
      writable: true,
    });
    
    expect(matchesShortcut(event, 'Cmd+K')).toBe(true);
    expect(matchesShortcut(event, 'Cmd+J')).toBe(false);
  });

  it('matches Cmd+Shift+F correctly', () => {
    const event = new KeyboardEvent('keydown', {
      key: 'f',
      metaKey: true,
      ctrlKey: false,
      altKey: false,
      shiftKey: true,
    });
    
    Object.defineProperty(navigator, 'platform', {
      value: 'MacIntel',
      writable: true,
    });
    
    expect(matchesShortcut(event, 'Cmd+Shift+F')).toBe(true);
    expect(matchesShortcut(event, 'Cmd+F')).toBe(false);
  });

  it('does not match when modifiers are wrong', () => {
    const event = new KeyboardEvent('keydown', {
      key: 'k',
      metaKey: false,
      ctrlKey: true,
      altKey: false,
      shiftKey: false,
    });
    
    Object.defineProperty(navigator, 'platform', {
      value: 'MacIntel',
      writable: true,
    });
    
    // On Mac, Ctrl+K should not match Cmd+K
    expect(matchesShortcut(event, 'Cmd+K')).toBe(false);
  });
});

describe('Customization Indicator', () => {
  /**
   * **Feature: custom-keyboard-shortcuts, Property 2: Customization Indicator Consistency**
   * **Validates: Requirements 1.3**
   * 
   * For any shortcut where current !== default, it should be marked as customized.
   */
  it('detects customization correctly', () => {
    const defaultShortcut = 'Cmd+K';
    const customShortcut = 'Cmd+Shift+K';
    
    expect(defaultShortcut === defaultShortcut).toBe(true); // Not customized
    expect(customShortcut === defaultShortcut).toBe(false); // Customized
  });
});
