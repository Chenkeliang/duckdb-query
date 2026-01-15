/**
 * 可访问性工具函数测试
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  generateAriaId,
  createButtonAriaProps,
  createTableAriaProps,
  createDialogAriaProps,
  createLiveRegionAriaProps,
  createKeyboardHandler,
  FocusManager,
  announceToScreenReader,
  isElementVisible,
  getAccessibleName,
  checkAccessibility,
} from '../accessibility';

describe('accessibility utils', () => {
  describe('generateAriaId', () => {
    it('应该生成唯一的 ID', () => {
      const id1 = generateAriaId('test');
      const id2 = generateAriaId('test');
      
      expect(id1).toMatch(/^test-/);
      expect(id2).toMatch(/^test-/);
      expect(id1).not.toBe(id2);
    });

    it('应该使用提供的前缀', () => {
      const id = generateAriaId('button');
      expect(id.startsWith('button-')).toBe(true);
    });
  });

  describe('createButtonAriaProps', () => {
    it('应该创建基本的按钮 ARIA 属性', () => {
      const props = createButtonAriaProps({ label: '提交' });
      
      expect(props['aria-label']).toBe('提交');
    });

    it('应该包含所有可选属性', () => {
      const props = createButtonAriaProps({
        label: '菜单',
        description: 'menu-desc',
        pressed: true,
        expanded: true,
        hasPopup: 'menu',
        controls: 'menu-content',
        disabled: false,
      });
      
      expect(props['aria-label']).toBe('菜单');
      expect(props['aria-describedby']).toBe('menu-desc');
      expect(props['aria-pressed']).toBe(true);
      expect(props['aria-expanded']).toBe(true);
      expect(props['aria-haspopup']).toBe('menu');
      expect(props['aria-controls']).toBe('menu-content');
      expect(props['aria-disabled']).toBe(false);
    });
  });

  describe('createTableAriaProps', () => {
    it('应该创建表格 ARIA 属性', () => {
      const props = createTableAriaProps({
        label: '用户列表',
        rowCount: 100,
        colCount: 5,
      });
      
      expect(props.role).toBe('table');
      expect(props['aria-label']).toBe('用户列表');
      expect(props['aria-rowcount']).toBe(100);
      expect(props['aria-colcount']).toBe(5);
    });

    it('交互式表格应该使用 grid role', () => {
      const props = createTableAriaProps({
        label: '数据网格',
        interactive: true,
      });
      
      expect(props.role).toBe('grid');
    });

    it('应该支持 busy 状态', () => {
      const props = createTableAriaProps({
        label: '加载中',
        busy: true,
      });
      
      expect(props['aria-busy']).toBe(true);
    });
  });

  describe('createDialogAriaProps', () => {
    it('应该创建对话框 ARIA 属性', () => {
      const props = createDialogAriaProps({
        titleId: 'dialog-title',
      });
      
      expect(props.role).toBe('dialog');
      expect(props['aria-modal']).toBe(true);
      expect(props['aria-labelledby']).toBe('dialog-title');
    });

    it('警告对话框应该使用 alertdialog role', () => {
      const props = createDialogAriaProps({
        titleId: 'alert-title',
        isAlert: true,
      });
      
      expect(props.role).toBe('alertdialog');
    });

    it('应该支持描述 ID', () => {
      const props = createDialogAriaProps({
        titleId: 'dialog-title',
        descriptionId: 'dialog-desc',
      });
      
      expect(props['aria-describedby']).toBe('dialog-desc');
    });
  });

  describe('createLiveRegionAriaProps', () => {
    it('应该创建默认的实时区域属性', () => {
      const props = createLiveRegionAriaProps({});
      
      expect(props['aria-live']).toBe('polite');
    });

    it('应该支持 assertive 优先级', () => {
      const props = createLiveRegionAriaProps({ priority: 'assertive' });
      
      expect(props['aria-live']).toBe('assertive');
    });

    it('应该支持 atomic 和 relevant 属性', () => {
      const props = createLiveRegionAriaProps({
        atomic: true,
        relevant: 'additions',
      });
      
      expect(props['aria-atomic']).toBe(true);
      expect(props['aria-relevant']).toBe('additions');
    });
  });

  describe('createKeyboardHandler', () => {
    it('应该处理 Enter 键', () => {
      const onEnter = vi.fn();
      const handler = createKeyboardHandler({ onEnter });
      
      handler({ key: 'Enter' } as React.KeyboardEvent);
      
      expect(onEnter).toHaveBeenCalled();
    });

    it('应该处理 Escape 键', () => {
      const onEscape = vi.fn();
      const handler = createKeyboardHandler({ onEscape });
      
      handler({ key: 'Escape' } as React.KeyboardEvent);
      
      expect(onEscape).toHaveBeenCalled();
    });

    it('应该处理方向键', () => {
      const onArrowUp = vi.fn();
      const onArrowDown = vi.fn();
      const onArrowLeft = vi.fn();
      const onArrowRight = vi.fn();
      
      const handler = createKeyboardHandler({
        onArrowUp,
        onArrowDown,
        onArrowLeft,
        onArrowRight,
      });
      
      handler({ key: 'ArrowUp' } as React.KeyboardEvent);
      handler({ key: 'ArrowDown' } as React.KeyboardEvent);
      handler({ key: 'ArrowLeft' } as React.KeyboardEvent);
      handler({ key: 'ArrowRight' } as React.KeyboardEvent);
      
      expect(onArrowUp).toHaveBeenCalled();
      expect(onArrowDown).toHaveBeenCalled();
      expect(onArrowLeft).toHaveBeenCalled();
      expect(onArrowRight).toHaveBeenCalled();
    });

    it('应该处理 Tab 键', () => {
      const onTab = vi.fn();
      const handler = createKeyboardHandler({ onTab });
      
      handler({ key: 'Tab', shiftKey: false } as React.KeyboardEvent);
      handler({ key: 'Tab', shiftKey: true } as React.KeyboardEvent);
      
      expect(onTab).toHaveBeenCalledTimes(2);
      expect(onTab).toHaveBeenNthCalledWith(1, false);
      expect(onTab).toHaveBeenNthCalledWith(2, true);
    });

    it('应该处理 Home 和 End 键', () => {
      const onHome = vi.fn();
      const onEnd = vi.fn();
      
      const handler = createKeyboardHandler({ onHome, onEnd });
      
      handler({ key: 'Home' } as React.KeyboardEvent);
      handler({ key: 'End' } as React.KeyboardEvent);
      
      expect(onHome).toHaveBeenCalled();
      expect(onEnd).toHaveBeenCalled();
    });

    it('应该支持 preventDefault', () => {
      const onEnter = vi.fn();
      const preventDefault = vi.fn();
      
      const handler = createKeyboardHandler({ onEnter, preventDefault: true });
      
      handler({ key: 'Enter', preventDefault } as unknown as React.KeyboardEvent);
      
      expect(preventDefault).toHaveBeenCalled();
    });
  });

  describe('FocusManager', () => {
    let container: HTMLDivElement;
    let focusManager: FocusManager;

    beforeEach(() => {
      container = document.createElement('div');
      container.innerHTML = `
        <button id="btn1">Button 1</button>
        <input id="input1" type="text" />
        <button id="btn2">Button 2</button>
        <a id="link1" href="#">Link</a>
      `;
      document.body.appendChild(container);
      
      focusManager = new FocusManager();
      focusManager.setContainer(container);
    });

    afterEach(() => {
      document.body.removeChild(container);
    });

    it('应该获取所有可聚焦元素', () => {
      const elements = focusManager.getFocusableElements();
      expect(elements).toHaveLength(4);
    });

    it('应该聚焦第一个元素', () => {
      focusManager.focusFirst();
      expect(document.activeElement?.id).toBe('btn1');
    });

    it('应该聚焦最后一个元素', () => {
      focusManager.focusLast();
      expect(document.activeElement?.id).toBe('link1');
    });

    it('应该聚焦下一个元素', () => {
      focusManager.focusFirst();
      focusManager.focusNext();
      expect(document.activeElement?.id).toBe('input1');
    });

    it('应该聚焦上一个元素', () => {
      focusManager.focusLast();
      focusManager.focusPrevious();
      expect(document.activeElement?.id).toBe('btn2');
    });

    it('应该循环聚焦', () => {
      focusManager.focusLast();
      focusManager.focusNext();
      expect(document.activeElement?.id).toBe('btn1');
    });
  });

  describe('announceToScreenReader', () => {
    afterEach(() => {
      // 清理可能残留的通知元素
      const announcements = document.querySelectorAll('[role="status"]');
      announcements.forEach((el) => el.remove());
    });

    it('应该创建通知元素', () => {
      announceToScreenReader('测试消息');
      
      const announcement = document.querySelector('[role="status"]');
      expect(announcement).not.toBeNull();
      expect(announcement?.textContent).toBe('测试消息');
    });

    it('应该支持 assertive 优先级', () => {
      announceToScreenReader('紧急消息', 'assertive');
      
      const announcement = document.querySelector('[role="status"]');
      expect(announcement?.getAttribute('aria-live')).toBe('assertive');
    });
  });

  describe('isElementVisible', () => {
    let element: HTMLDivElement;

    beforeEach(() => {
      element = document.createElement('div');
      document.body.appendChild(element);
    });

    afterEach(() => {
      document.body.removeChild(element);
    });

    it('应该检测可见元素', () => {
      expect(isElementVisible(element)).toBe(true);
    });

    it('应该检测 display: none', () => {
      element.style.display = 'none';
      expect(isElementVisible(element)).toBe(false);
    });

    it('应该检测 visibility: hidden', () => {
      element.style.visibility = 'hidden';
      expect(isElementVisible(element)).toBe(false);
    });

    it('应该检测 opacity: 0', () => {
      element.style.opacity = '0';
      expect(isElementVisible(element)).toBe(false);
    });
  });

  describe('getAccessibleName', () => {
    let element: HTMLButtonElement;

    beforeEach(() => {
      element = document.createElement('button');
      document.body.appendChild(element);
    });

    afterEach(() => {
      document.body.removeChild(element);
    });

    it('应该返回 aria-label', () => {
      element.setAttribute('aria-label', '提交按钮');
      expect(getAccessibleName(element)).toBe('提交按钮');
    });

    it('应该返回 aria-labelledby 引用的内容', () => {
      const label = document.createElement('span');
      label.id = 'label-id';
      label.textContent = '标签内容';
      document.body.appendChild(label);
      
      element.setAttribute('aria-labelledby', 'label-id');
      expect(getAccessibleName(element)).toBe('标签内容');
      
      document.body.removeChild(label);
    });

    it('应该返回元素内容', () => {
      element.textContent = '按钮文本';
      expect(getAccessibleName(element)).toBe('按钮文本');
    });
  });

  describe('checkAccessibility', () => {
    let container: HTMLDivElement;

    beforeEach(() => {
      container = document.createElement('div');
      document.body.appendChild(container);
    });

    afterEach(() => {
      document.body.removeChild(container);
    });

    it('应该通过可访问的元素', () => {
      container.innerHTML = `
        <button aria-label="提交">提交</button>
        <img src="test.jpg" alt="测试图片" />
        <label for="input1">姓名</label>
        <input id="input1" type="text" />
      `;
      
      const result = checkAccessibility(container);
      expect(result.passed).toBe(true);
      expect(result.issues).toHaveLength(0);
    });

    it('应该检测缺少可访问名称的按钮', () => {
      container.innerHTML = `<button></button>`;
      
      const result = checkAccessibility(container);
      expect(result.passed).toBe(false);
      expect(result.issues).toContain('Button 1 is missing an accessible name');
    });

    it('应该检测缺少 alt 的图片', () => {
      container.innerHTML = `<img src="test.jpg" />`;
      
      const result = checkAccessibility(container);
      expect(result.passed).toBe(false);
      expect(result.issues).toContain('Image 1 is missing alt text');
    });

    it('应该检测缺少标签的表单控件', () => {
      container.innerHTML = `<input type="text" />`;
      
      const result = checkAccessibility(container);
      expect(result.passed).toBe(false);
      expect(result.issues).toContain('Form control 1 is missing a label');
    });
  });
});
