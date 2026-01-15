/**
 * UnrecognizedPrefixWarning 组件单元测试
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { UnrecognizedPrefixWarning } from '../UnrecognizedPrefixWarning';

// Mock i18next
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, defaultValue: string) => defaultValue,
  }),
}));

describe('UnrecognizedPrefixWarning', () => {
  it('should not render when prefixes array is empty', () => {
    const { container } = render(<UnrecognizedPrefixWarning prefixes={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('should render warning with single prefix', () => {
    render(<UnrecognizedPrefixWarning prefixes={['unknown_db']} />);

    expect(screen.getByText('发现未识别的数据库前缀')).toBeInTheDocument();
    expect(screen.getByText('unknown_db')).toBeInTheDocument();
  });

  it('should render warning with multiple prefixes', () => {
    render(<UnrecognizedPrefixWarning prefixes={['db1', 'db2', 'db3']} />);

    expect(screen.getByText('db1')).toBeInTheDocument();
    expect(screen.getByText('db2')).toBeInTheDocument();
    expect(screen.getByText('db3')).toBeInTheDocument();
  });

  it('should call onConfigureConnection when configure button is clicked', () => {
    const onConfigureConnection = vi.fn();
    render(
      <UnrecognizedPrefixWarning
        prefixes={['unknown_db']}
        onConfigureConnection={onConfigureConnection}
      />
    );

    const configureButton = screen.getByText('配置连接');
    fireEvent.click(configureButton);

    expect(onConfigureConnection).toHaveBeenCalledWith('unknown_db');
  });

  it('should call onIgnore when ignore button is clicked', () => {
    const onIgnore = vi.fn();
    render(
      <UnrecognizedPrefixWarning prefixes={['unknown_db']} onIgnore={onIgnore} />
    );

    const ignoreButton = screen.getByText('忽略并执行');
    fireEvent.click(ignoreButton);

    expect(onIgnore).toHaveBeenCalled();
  });

  it('should call onDismiss when close button is clicked', () => {
    const onDismiss = vi.fn();
    render(
      <UnrecognizedPrefixWarning
        prefixes={['unknown_db']}
        onDismiss={onDismiss}
        dismissible={true}
      />
    );

    const closeButton = screen.getByLabelText('关闭');
    fireEvent.click(closeButton);

    expect(onDismiss).toHaveBeenCalled();
  });

  it('should not show close button when dismissible is false', () => {
    render(
      <UnrecognizedPrefixWarning
        prefixes={['unknown_db']}
        onDismiss={vi.fn()}
        dismissible={false}
      />
    );

    expect(screen.queryByLabelText('关闭')).not.toBeInTheDocument();
  });

  it('should show "配置连接" for multiple prefixes', () => {
    const onConfigureConnection = vi.fn();
    render(
      <UnrecognizedPrefixWarning
        prefixes={['db1', 'db2']}
        onConfigureConnection={onConfigureConnection}
      />
    );

    expect(screen.getByText('配置连接')).toBeInTheDocument();
  });
});
