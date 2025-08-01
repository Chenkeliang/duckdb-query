/**
 * Toast通知反馈机制测试
 * 测试所有操作按钮的Toast通知功能
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ToastProvider } from '../frontend/src/contexts/ToastContext';
import FileUploader from '../frontend/src/components/DataSourceManager/FileUploader';
import DatabaseConnector from '../frontend/src/components/DataSourceManager/DatabaseConnector';
import DataSourceList from '../frontend/src/components/DataSourceManager/DataSourceList';
import ModernDataDisplay from '../frontend/src/components/Results/ModernDataDisplay';

// Mock API calls
jest.mock('../frontend/src/services/apiClient', () => ({
  uploadFile: jest.fn(),
  connectDatabase: jest.fn(),
  deleteFile: jest.fn(),
  handleApiError: jest.fn(),
}));

// 测试组件包装器
const TestWrapper = ({ children }) => (
  <ToastProvider>
    {children}
  </ToastProvider>
);

describe('Toast通知反馈机制测试', () => {
  
  describe('FileUploader组件', () => {
    test('文件上传成功时显示成功Toast', async () => {
      const mockOnUpload = jest.fn().mockResolvedValue({ success: true });
      
      render(
        <TestWrapper>
          <FileUploader onUpload={mockOnUpload} />
        </TestWrapper>
      );

      // 模拟文件上传
      const file = new File(['test content'], 'test.csv', { type: 'text/csv' });
      const input = screen.getByRole('button', { name: /选择文件/i });
      
      fireEvent.change(input, { target: { files: [file] } });
      
      await waitFor(() => {
        expect(screen.getByText(/文件.*上传成功/)).toBeInTheDocument();
      });
    });

    test('文件上传失败时显示错误Toast', async () => {
      const mockOnUpload = jest.fn().mockRejectedValue(new Error('上传失败'));
      
      render(
        <TestWrapper>
          <FileUploader onUpload={mockOnUpload} />
        </TestWrapper>
      );

      const file = new File(['test content'], 'test.csv', { type: 'text/csv' });
      const input = screen.getByRole('button', { name: /选择文件/i });
      
      fireEvent.change(input, { target: { files: [file] } });
      
      await waitFor(() => {
        expect(screen.getByText(/文件上传失败/)).toBeInTheDocument();
      });
    });

    test('不支持的文件格式显示错误Toast', async () => {
      render(
        <TestWrapper>
          <FileUploader onUpload={jest.fn()} />
        </TestWrapper>
      );

      const file = new File(['test content'], 'test.txt', { type: 'text/plain' });
      const input = screen.getByRole('button', { name: /选择文件/i });
      
      fireEvent.change(input, { target: { files: [file] } });
      
      await waitFor(() => {
        expect(screen.getByText(/不支持的文件格式/)).toBeInTheDocument();
      });
    });
  });

  describe('DatabaseConnector组件', () => {
    test('数据库连接成功时显示成功Toast', async () => {
      const mockOnConnect = jest.fn().mockResolvedValue({ success: true });
      
      render(
        <TestWrapper>
          <DatabaseConnector onConnect={mockOnConnect} />
        </TestWrapper>
      );

      // 填写连接信息
      fireEvent.change(screen.getByLabelText(/数据库类型/), { target: { value: 'mysql' } });
      fireEvent.change(screen.getByLabelText(/主机地址/), { target: { value: 'localhost' } });
      fireEvent.change(screen.getByLabelText(/数据库名称/), { target: { value: 'test' } });
      
      // 点击连接按钮
      fireEvent.click(screen.getByRole('button', { name: /连接数据源/ }));
      
      await waitFor(() => {
        expect(screen.getByText(/数据源连接成功/)).toBeInTheDocument();
      });
    });

    test('数据库连接失败时显示错误Toast', async () => {
      const mockOnConnect = jest.fn().mockRejectedValue(new Error('连接失败'));
      
      render(
        <TestWrapper>
          <DatabaseConnector onConnect={mockOnConnect} />
        </TestWrapper>
      );

      // 填写连接信息并点击连接
      fireEvent.change(screen.getByLabelText(/数据库类型/), { target: { value: 'mysql' } });
      fireEvent.click(screen.getByRole('button', { name: /连接数据源/ }));
      
      await waitFor(() => {
        expect(screen.getByText(/连接失败/)).toBeInTheDocument();
      });
    });

    test('测试连接成功时显示成功Toast', async () => {
      // Mock fetch for test connection
      global.fetch = jest.fn().mockResolvedValue({
        json: () => Promise.resolve({ success: true, latency_ms: 50 })
      });

      render(
        <TestWrapper>
          <DatabaseConnector onConnect={jest.fn()} />
        </TestWrapper>
      );

      // 填写连接信息
      fireEvent.change(screen.getByLabelText(/数据库类型/), { target: { value: 'mysql' } });
      fireEvent.change(screen.getByLabelText(/主机地址/), { target: { value: 'localhost' } });
      fireEvent.change(screen.getByLabelText(/数据库名称/), { target: { value: 'test' } });
      
      // 点击测试连接按钮
      fireEvent.click(screen.getByRole('button', { name: /测试连接/ }));
      
      await waitFor(() => {
        expect(screen.getByText(/连接测试成功/)).toBeInTheDocument();
      });
    });
  });

  describe('DataSourceList组件', () => {
    test('删除文件成功时显示成功Toast', async () => {
      global.fetch = jest.fn().mockResolvedValue({ ok: true });
      
      const mockDataSources = [
        { id: '1', name: 'test.csv', sourceType: 'file' }
      ];
      
      render(
        <TestWrapper>
          <DataSourceList 
            dataSources={mockDataSources} 
            onRefresh={jest.fn()} 
          />
        </TestWrapper>
      );

      // 点击删除按钮
      fireEvent.click(screen.getByRole('button', { name: /删除文件/ }));
      
      // 确认删除
      fireEvent.click(screen.getByRole('button', { name: /删除/ }));
      
      await waitFor(() => {
        expect(screen.getByText(/文件删除成功/)).toBeInTheDocument();
      });
    });

    test('删除文件失败时显示错误Toast', async () => {
      global.fetch = jest.fn().mockResolvedValue({ ok: false });
      
      const mockDataSources = [
        { id: '1', name: 'test.csv', sourceType: 'file' }
      ];
      
      render(
        <TestWrapper>
          <DataSourceList 
            dataSources={mockDataSources} 
            onRefresh={jest.fn()} 
          />
        </TestWrapper>
      );

      fireEvent.click(screen.getByRole('button', { name: /删除文件/ }));
      fireEvent.click(screen.getByRole('button', { name: /删除/ }));
      
      await waitFor(() => {
        expect(screen.getByText(/删除文件失败/)).toBeInTheDocument();
      });
    });
  });

  describe('ModernDataDisplay组件', () => {
    test('保存为数据源成功时显示成功Toast', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        json: () => Promise.resolve({ success: true, table_alias: 'test_table' })
      });

      const mockData = [{ id: 1, name: 'test' }];
      const mockColumns = ['id', 'name'];
      
      render(
        <TestWrapper>
          <ModernDataDisplay 
            data={mockData} 
            columns={mockColumns}
            sqlQuery="SELECT * FROM test"
          />
        </TestWrapper>
      );

      // 点击保存为数据源按钮
      fireEvent.click(screen.getByRole('button', { name: /保存为数据源/ }));
      
      // 填写表名并保存
      fireEvent.change(screen.getByLabelText(/DuckDB表别名/), { target: { value: 'test_table' } });
      fireEvent.click(screen.getByRole('button', { name: /保存/ }));
      
      await waitFor(() => {
        expect(screen.getByText(/查询结果已保存为DuckDB表/)).toBeInTheDocument();
      });
    });

    test('导出数据成功时显示成功Toast', async () => {
      const mockOnExport = jest.fn();
      const mockData = [{ id: 1, name: 'test' }];
      const mockColumns = ['id', 'name'];
      
      render(
        <TestWrapper>
          <ModernDataDisplay 
            data={mockData} 
            columns={mockColumns}
            onExport={mockOnExport}
          />
        </TestWrapper>
      );

      // 点击导出按钮
      fireEvent.click(screen.getByRole('button', { name: /导出/ }));
      
      // 选择导出格式
      fireEvent.click(screen.getByText(/导出为 CSV/));
      
      await waitFor(() => {
        expect(screen.getByText(/数据导出为 CSV 格式成功/)).toBeInTheDocument();
      });
    });
  });

  describe('Toast系统集成测试', () => {
    test('多个Toast同时显示时正确堆叠', async () => {
      render(
        <TestWrapper>
          <FileUploader onUpload={jest.fn().mockRejectedValue(new Error('错误1'))} />
          <DatabaseConnector onConnect={jest.fn().mockRejectedValue(new Error('错误2'))} />
        </TestWrapper>
      );

      // 触发多个错误
      const file = new File(['test'], 'test.txt', { type: 'text/plain' });
      fireEvent.change(screen.getByRole('button', { name: /选择文件/i }), { 
        target: { files: [file] } 
      });
      
      fireEvent.click(screen.getByRole('button', { name: /连接数据源/ }));
      
      await waitFor(() => {
        expect(screen.getByText(/不支持的文件格式/)).toBeInTheDocument();
        expect(screen.getByText(/连接失败/)).toBeInTheDocument();
      });
    });

    test('Toast自动隐藏功能正常工作', async () => {
      jest.useFakeTimers();
      
      const mockOnUpload = jest.fn().mockResolvedValue({ success: true });
      
      render(
        <TestWrapper>
          <FileUploader onUpload={mockOnUpload} />
        </TestWrapper>
      );

      const file = new File(['test'], 'test.csv', { type: 'text/csv' });
      fireEvent.change(screen.getByRole('button', { name: /选择文件/i }), { 
        target: { files: [file] } 
      });
      
      await waitFor(() => {
        expect(screen.getByText(/文件.*上传成功/)).toBeInTheDocument();
      });
      
      // 4秒后Toast应该消失
      jest.advanceTimersByTime(4000);
      
      await waitFor(() => {
        expect(screen.queryByText(/文件.*上传成功/)).not.toBeInTheDocument();
      });
      
      jest.useRealTimers();
    });
  });
});
