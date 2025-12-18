/**
 * 可访问性工具函数
 * 提供 ARIA 属性和键盘导航支持
 */

/**
 * 生成唯一的 ARIA ID
 */
export function generateAriaId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * 按钮的 ARIA 属性
 */
export interface ButtonAriaProps {
  'aria-label': string;
  'aria-describedby'?: string;
  'aria-pressed'?: boolean;
  'aria-expanded'?: boolean;
  'aria-haspopup'?: boolean | 'menu' | 'listbox' | 'tree' | 'grid' | 'dialog';
  'aria-controls'?: string;
  'aria-disabled'?: boolean;
}

/**
 * 创建按钮的 ARIA 属性
 */
export function createButtonAriaProps(options: {
  label: string;
  description?: string;
  pressed?: boolean;
  expanded?: boolean;
  hasPopup?: boolean | 'menu' | 'listbox' | 'tree' | 'grid' | 'dialog';
  controls?: string;
  disabled?: boolean;
}): ButtonAriaProps {
  const props: ButtonAriaProps = {
    'aria-label': options.label,
  };

  if (options.description) {
    props['aria-describedby'] = options.description;
  }
  if (options.pressed !== undefined) {
    props['aria-pressed'] = options.pressed;
  }
  if (options.expanded !== undefined) {
    props['aria-expanded'] = options.expanded;
  }
  if (options.hasPopup !== undefined) {
    props['aria-haspopup'] = options.hasPopup;
  }
  if (options.controls) {
    props['aria-controls'] = options.controls;
  }
  if (options.disabled !== undefined) {
    props['aria-disabled'] = options.disabled;
  }

  return props;
}

/**
 * 表格的 ARIA 属性
 */
export interface TableAriaProps {
  role: 'grid' | 'table';
  'aria-label': string;
  'aria-describedby'?: string;
  'aria-rowcount'?: number;
  'aria-colcount'?: number;
  'aria-busy'?: boolean;
}

/**
 * 创建表格的 ARIA 属性
 */
export function createTableAriaProps(options: {
  label: string;
  description?: string;
  rowCount?: number;
  colCount?: number;
  busy?: boolean;
  interactive?: boolean;
}): TableAriaProps {
  const props: TableAriaProps = {
    role: options.interactive ? 'grid' : 'table',
    'aria-label': options.label,
  };

  if (options.description) {
    props['aria-describedby'] = options.description;
  }
  if (options.rowCount !== undefined) {
    props['aria-rowcount'] = options.rowCount;
  }
  if (options.colCount !== undefined) {
    props['aria-colcount'] = options.colCount;
  }
  if (options.busy !== undefined) {
    props['aria-busy'] = options.busy;
  }

  return props;
}

/**
 * 对话框的 ARIA 属性
 */
export interface DialogAriaProps {
  role: 'dialog' | 'alertdialog';
  'aria-modal': boolean;
  'aria-labelledby': string;
  'aria-describedby'?: string;
}

/**
 * 创建对话框的 ARIA 属性
 */
export function createDialogAriaProps(options: {
  titleId: string;
  descriptionId?: string;
  isAlert?: boolean;
}): DialogAriaProps {
  return {
    role: options.isAlert ? 'alertdialog' : 'dialog',
    'aria-modal': true,
    'aria-labelledby': options.titleId,
    ...(options.descriptionId && { 'aria-describedby': options.descriptionId }),
  };
}

/**
 * 实时区域的 ARIA 属性
 */
export interface LiveRegionAriaProps {
  'aria-live': 'polite' | 'assertive' | 'off';
  'aria-atomic'?: boolean;
  'aria-relevant'?: 'additions' | 'removals' | 'text' | 'all';
}

/**
 * 创建实时区域的 ARIA 属性
 */
export function createLiveRegionAriaProps(options: {
  priority?: 'polite' | 'assertive';
  atomic?: boolean;
  relevant?: 'additions' | 'removals' | 'text' | 'all';
}): LiveRegionAriaProps {
  return {
    'aria-live': options.priority || 'polite',
    ...(options.atomic !== undefined && { 'aria-atomic': options.atomic }),
    ...(options.relevant && { 'aria-relevant': options.relevant }),
  };
}

/**
 * 键盘导航处理器
 */
export interface KeyboardNavigationOptions {
  onEnter?: () => void;
  onEscape?: () => void;
  onArrowUp?: () => void;
  onArrowDown?: () => void;
  onArrowLeft?: () => void;
  onArrowRight?: () => void;
  onTab?: (shiftKey: boolean) => void;
  onHome?: () => void;
  onEnd?: () => void;
  preventDefault?: boolean;
}

/**
 * 创建键盘事件处理器
 */
export function createKeyboardHandler(options: KeyboardNavigationOptions) {
  return (event: React.KeyboardEvent) => {
    const { key, shiftKey } = event;

    switch (key) {
      case 'Enter':
        if (options.onEnter) {
          if (options.preventDefault) event.preventDefault();
          options.onEnter();
        }
        break;
      case 'Escape':
        if (options.onEscape) {
          if (options.preventDefault) event.preventDefault();
          options.onEscape();
        }
        break;
      case 'ArrowUp':
        if (options.onArrowUp) {
          if (options.preventDefault) event.preventDefault();
          options.onArrowUp();
        }
        break;
      case 'ArrowDown':
        if (options.onArrowDown) {
          if (options.preventDefault) event.preventDefault();
          options.onArrowDown();
        }
        break;
      case 'ArrowLeft':
        if (options.onArrowLeft) {
          if (options.preventDefault) event.preventDefault();
          options.onArrowLeft();
        }
        break;
      case 'ArrowRight':
        if (options.onArrowRight) {
          if (options.preventDefault) event.preventDefault();
          options.onArrowRight();
        }
        break;
      case 'Tab':
        if (options.onTab) {
          options.onTab(shiftKey);
        }
        break;
      case 'Home':
        if (options.onHome) {
          if (options.preventDefault) event.preventDefault();
          options.onHome();
        }
        break;
      case 'End':
        if (options.onEnd) {
          if (options.preventDefault) event.preventDefault();
          options.onEnd();
        }
        break;
    }
  };
}

/**
 * 焦点管理工具
 */
export class FocusManager {
  private container: HTMLElement | null = null;
  private focusableSelector = 
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

  setContainer(element: HTMLElement | null) {
    this.container = element;
  }

  getFocusableElements(): HTMLElement[] {
    if (!this.container) return [];
    return Array.from(this.container.querySelectorAll(this.focusableSelector));
  }

  focusFirst() {
    const elements = this.getFocusableElements();
    if (elements.length > 0) {
      elements[0].focus();
    }
  }

  focusLast() {
    const elements = this.getFocusableElements();
    if (elements.length > 0) {
      elements[elements.length - 1].focus();
    }
  }

  focusNext() {
    const elements = this.getFocusableElements();
    const currentIndex = elements.indexOf(document.activeElement as HTMLElement);
    if (currentIndex < elements.length - 1) {
      elements[currentIndex + 1].focus();
    } else {
      elements[0].focus(); // 循环到第一个
    }
  }

  focusPrevious() {
    const elements = this.getFocusableElements();
    const currentIndex = elements.indexOf(document.activeElement as HTMLElement);
    if (currentIndex > 0) {
      elements[currentIndex - 1].focus();
    } else {
      elements[elements.length - 1].focus(); // 循环到最后一个
    }
  }

  trapFocus(event: KeyboardEvent) {
    if (event.key !== 'Tab') return;

    const elements = this.getFocusableElements();
    if (elements.length === 0) return;

    const firstElement = elements[0];
    const lastElement = elements[elements.length - 1];

    if (event.shiftKey) {
      if (document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      }
    } else {
      if (document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    }
  }
}

/**
 * 屏幕阅读器通知
 */
export function announceToScreenReader(
  message: string,
  priority: 'polite' | 'assertive' = 'polite'
) {
  const announcement = document.createElement('div');
  announcement.setAttribute('role', 'status');
  announcement.setAttribute('aria-live', priority);
  announcement.setAttribute('aria-atomic', 'true');
  announcement.className = 'sr-only';
  announcement.textContent = message;

  document.body.appendChild(announcement);

  // 移除通知元素
  setTimeout(() => {
    document.body.removeChild(announcement);
  }, 1000);
}

/**
 * 检查元素是否可见
 */
export function isElementVisible(element: HTMLElement): boolean {
  const style = window.getComputedStyle(element);
  return (
    style.display !== 'none' &&
    style.visibility !== 'hidden' &&
    style.opacity !== '0'
  );
}

/**
 * 获取元素的可访问名称
 */
export function getAccessibleName(element: HTMLElement): string {
  // 优先使用 aria-label
  const ariaLabel = element.getAttribute('aria-label');
  if (ariaLabel) return ariaLabel;

  // 其次使用 aria-labelledby
  const labelledBy = element.getAttribute('aria-labelledby');
  if (labelledBy) {
    const labelElement = document.getElementById(labelledBy);
    if (labelElement) return labelElement.textContent || '';
  }

  // 最后使用元素内容
  return element.textContent || '';
}

/**
 * 可访问性检查结果
 */
export interface AccessibilityCheckResult {
  passed: boolean;
  issues: string[];
}

/**
 * 检查元素的可访问性
 */
export function checkAccessibility(element: HTMLElement): AccessibilityCheckResult {
  const issues: string[] = [];

  // 检查按钮是否有可访问名称
  const buttons = element.querySelectorAll('button');
  buttons.forEach((button, index) => {
    if (!getAccessibleName(button as HTMLElement)) {
      issues.push(`Button ${index + 1} is missing an accessible name`);
    }
  });

  // 检查图片是否有 alt 属性
  const images = element.querySelectorAll('img');
  images.forEach((img, index) => {
    if (!img.getAttribute('alt')) {
      issues.push(`Image ${index + 1} is missing alt text`);
    }
  });

  // 检查表单控件是否有标签
  const inputs = element.querySelectorAll('input, select, textarea');
  inputs.forEach((input, index) => {
    const id = input.getAttribute('id');
    const hasLabel = id && element.querySelector(`label[for="${id}"]`);
    const hasAriaLabel = input.getAttribute('aria-label');
    const hasAriaLabelledBy = input.getAttribute('aria-labelledby');

    if (!hasLabel && !hasAriaLabel && !hasAriaLabelledBy) {
      issues.push(`Form control ${index + 1} is missing a label`);
    }
  });

  return {
    passed: issues.length === 0,
    issues,
  };
}

export default {
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
};
