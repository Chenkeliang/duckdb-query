/**
 * Integration tests for QueryBuilder with Visual Query functionality
 */

import { ThemeProvider, createTheme } from '@mui/material/styles';
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { ToastProvider } from '../../../contexts/ToastContext';
import QueryBuilder from '../QueryBuilder';

// Mock API client
jest.mock('../../../services/apiClient', () => ({
  performQuery: jest.fn(),
  executeDuckDBSQL: jest.fn(),
}));

// Mock VisualAnalysisPanel
jest.mock('../VisualAnalysisPanel', () => {
  return function MockVisualAnalysisPanel({
    selectedSources,
    onVisualQueryGenerated,
    isVisible
  }) {
    if (!isVisible || selectedSources.length !== 1) {
      return null;
    }

    return (
      <div data-testid="visual-analysis-panel">
        <h3>Visual Analysis Panel</h3>
        <button
          data-testid="generate-visual-query"
          onClick={() => {
            const mockSQL = `SELECT "name", "age" FROM "${selectedSources[0].id}" WHERE "status" = 'active' ORDER BY "age" DESC LIMIT 100`;
            const mockConfig = {
              tableName: selectedSources[0].id,
              selectedColumns: ['name', 'age'],
              filters: [{ column: 'status', operator: '=', value: 'active' }],
              orderBy: [{ column: 'age', direction: 'DESC' }],
              limit: 100
            };
            onVisualQueryGenerated(mockSQL, mockConfig);
          }}
        >
          Generate Visual Query
        </button>
      </div>
    );
  };
});

const theme = createTheme();

const renderWithProviders = (component) => {
  return render(
    <ThemeProvider theme={theme}>
      <ToastProvider>
        {component}
      </ToastProvider>
    </ThemeProvider>
  );
};

describe('QueryBuilder Integration Tests', () => {
  const mockDataSources = [
    {
      id: 'users_table',
      name: 'Users',
      sourceType: 'duckdb',
      columns: ['id', 'name', 'age', 'email', 'status']
    },
    {
      id: 'orders_table',
      name: 'Orders',
      sourceType: 'duckdb',
      columns: ['id', 'user_id', 'amount', 'order_date']
    }
  ];

  const defaultProps = {
    dataSources: mockDataSources,
    selectedSources: [],
    setSelectedSources: jest.fn(),
    onResultsReceived: jest.fn()
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Visual Query Integration', () => {
    it('shows visual analysis panel when single table is selected', () => {
      const props = {
        ...defaultProps,
        selectedSources: [mockDataSources[0]]
      };

      renderWithProviders(<QueryBuilder {...props} />);

      expect(screen.getByTestId('visual-analysis-panel')).toBeInTheDocument();
      expect(screen.getByText('Visual Analysis Panel')).toBeInTheDocument();
    });

    it('hides visual analysis panel when multiple tables are selected', () => {
      const props = {
        ...defaultProps,
        selectedSources: mockDataSources
      };

      renderWithProviders(<QueryBuilder {...props} />);

      expect(screen.queryByTestId('visual-analysis-panel')).not.toBeInTheDocument();
    });

    it('hides visual analysis panel when no tables are selected', () => {
      renderWithProviders(<QueryBuilder {...props} />);

      expect(screen.queryByTestId('visual-analysis-panel')).not.toBeInTheDocument();
    });

    it('executes visual query when generated', async () => {
      const { executeDuckDBSQL } = require('../../../services/apiClient');
      const mockResults = {
        success: true,
        data: [
          { name: 'Alice', age: 30 },
          { name: 'Bob', age: 25 }
        ],
        columns: ['name', 'age']
      };

      executeDuckDBSQL.mockResolvedValue(mockResults);

      const props = {
        ...defaultProps,
        selectedSources: [mockDataSources[0]]
      };

      renderWithProviders(<QueryBuilder {...props} />);

      // Generate visual query
      const generateBtn = screen.getByTestId('generate-visual-query');
      fireEvent.click(generateBtn);

      // Execute query
      const executeBtn = screen.getByText('执行查询');
      fireEvent.click(executeBtn);

      await waitFor(() => {
        expect(executeDuckDBSQL).toHaveBeenCalledWith(
          expect.stringContaining('SELECT "name", "age"'),
          null,
          false
        );
      });

      expect(props.onResultsReceived).toHaveBeenCalledWith(
        expect.objectContaining({
          ...mockResults,
          isVisualQuery: true,
          visualConfig: expect.any(Object),
          generatedSQL: expect.stringContaining('SELECT "name", "age"')
        })
      );
    });

    it('falls back to regular query API if direct SQL execution fails', async () => {
      const { executeDuckDBSQL, performQuery } = require('../../../services/apiClient');

      // Mock direct SQL execution failure
      executeDuckDBSQL.mockRejectedValue(new Error('SQL execution failed'));

      // Mock regular query API success
      const mockResults = {
        success: true,
        data: [{ name: 'Alice', age: 30 }],
        columns: ['name', 'age']
      };
      performQuery.mockResolvedValue(mockResults);

      const props = {
        ...defaultProps,
        selectedSources: [mockDataSources[0]]
      };

      renderWithProviders(<QueryBuilder {...props} />);

      // Generate visual query
      const generateBtn = screen.getByTestId('generate-visual-query');
      fireEvent.click(generateBtn);

      // Execute query
      const executeBtn = screen.getByText('执行查询');
      fireEvent.click(executeBtn);

      await waitFor(() => {
        expect(executeDuckDBSQL).toHaveBeenCalled();
        expect(performQuery).toHaveBeenCalled();
      });

      expect(props.onResultsReceived).toHaveBeenCalledWith(
        expect.objectContaining({
          ...mockResults,
          isVisualQuery: true
        })
      );
    });

    it('handles visual query execution errors', async () => {
      const { executeDuckDBSQL, performQuery } = require('../../../services/apiClient');

      // Mock both APIs failing
      executeDuckDBSQL.mockRejectedValue(new Error('SQL execution failed'));
      performQuery.mockResolvedValue({
        success: false,
        error: 'Query execution failed'
      });

      const props = {
        ...defaultProps,
        selectedSources: [mockDataSources[0]]
      };

      renderWithProviders(<QueryBuilder {...props} />);

      // Generate visual query
      const generateBtn = screen.getByTestId('generate-visual-query');
      fireEvent.click(generateBtn);

      // Execute query
      const executeBtn = screen.getByText('执行查询');
      fireEvent.click(executeBtn);

      await waitFor(() => {
        expect(screen.getByText('Query execution failed')).toBeInTheDocument();
      });

      expect(props.onResultsReceived).not.toHaveBeenCalled();
    });
  });

  describe('Multi-table Query Integration', () => {
    it('executes multi-table queries without visual analysis', async () => {
      const { performQuery } = require('../../../services/apiClient');

      const mockResults = {
        success: true,
        data: [
          { users_name: 'Alice', orders_amount: 100 },
          { users_name: 'Bob', orders_amount: 200 }
        ],
        columns: ['users_name', 'orders_amount'],
        sql: 'SELECT users.name as users_name, orders.amount as orders_amount FROM users INNER JOIN orders ON users.id = orders.user_id'
      };

      performQuery.mockResolvedValue(mockResults);

      const props = {
        ...defaultProps,
        selectedSources: mockDataSources
      };

      renderWithProviders(<QueryBuilder {...props} />);

      // Should not show visual analysis panel
      expect(screen.queryByTestId('visual-analysis-panel')).not.toBeInTheDocument();

      // Execute multi-table query
      const executeBtn = screen.getByText('执行查询');
      fireEvent.click(executeBtn);

      await waitFor(() => {
        expect(performQuery).toHaveBeenCalledWith(
          expect.objectContaining({
            sources: expect.arrayContaining([
              expect.objectContaining({ id: 'users_table' }),
              expect.objectContaining({ id: 'orders_table' })
            ]),
            joins: expect.any(Array)
          })
        );
      });

      expect(props.onResultsReceived).toHaveBeenCalledWith(mockResults);
    });

    it('maintains backward compatibility with existing JOIN functionality', async () => {
      const { performQuery } = require('../../../services/apiClient');

      performQuery.mockResolvedValue({
        success: true,
        data: [],
        columns: []
      });

      const props = {
        ...defaultProps,
        selectedSources: mockDataSources
      };

      renderWithProviders(<QueryBuilder {...props} />);

      // Add JOIN condition (this would be done through JoinCondition component)
      // For this test, we'll simulate the state that would exist after adding a JOIN

      const executeBtn = screen.getByText('执行查询');
      fireEvent.click(executeBtn);

      await waitFor(() => {
        expect(performQuery).toHaveBeenCalledWith(
          expect.objectContaining({
            sources: expect.any(Array),
            joins: expect.any(Array)
          })
        );
      });
    });
  });

  describe('Error Handling Integration', () => {
    it('displays error messages for failed queries', async () => {
      const { performQuery } = require('../../../services/apiClient');

      performQuery.mockRejectedValue(new Error('Network error'));

      const props = {
        ...defaultProps,
        selectedSources: [mockDataSources[0]]
      };

      renderWithProviders(<QueryBuilder {...props} />);

      const executeBtn = screen.getByText('执行查询');
      fireEvent.click(executeBtn);

      await waitFor(() => {
        expect(screen.getByText(/查询执行失败/)).toBeInTheDocument();
      });
    });

    it('handles validation errors from backend', async () => {
      const { performQuery } = require('../../../services/apiClient');

      performQuery.mockResolvedValue({
        success: false,
        error: 'Invalid table name'
      });

      const props = {
        ...defaultProps,
        selectedSources: [mockDataSources[0]]
      };

      renderWithProviders(<QueryBuilder {...props} />);

      const executeBtn = screen.getByText('执行查询');
      fireEvent.click(executeBtn);

      await waitFor(() => {
        expect(screen.getByText('Invalid table name')).toBeInTheDocument();
      });
    });

    it('prevents execution when no sources are selected', () => {
      renderWithProviders(<QueryBuilder {...defaultProps} />);

      const executeBtn = screen.getByText('执行查询');
      fireEvent.click(executeBtn);

      expect(screen.getByText('请至少选择一个数据源')).toBeInTheDocument();
    });
  });

  describe('State Management Integration', () => {
    it('updates visual query state when configuration changes', () => {
      const props = {
        ...defaultProps,
        selectedSources: [mockDataSources[0]]
      };

      renderWithProviders(<QueryBuilder {...props} />);

      // Generate visual query
      const generateBtn = screen.getByTestId('generate-visual-query');
      fireEvent.click(generateBtn);

      // Verify that the component state is updated
      // (This would be verified through the execute button behavior)
      const executeBtn = screen.getByText('执行查询');
      expect(executeBtn).not.toBeDisabled();
    });

    it('clears visual query state when switching to multi-table mode', () => {
      const setSelectedSources = jest.fn();
      const props = {
        ...defaultProps,
        selectedSources: [mockDataSources[0]],
        setSelectedSources
      };

      const { rerender } = renderWithProviders(<QueryBuilder {...props} />);

      // Generate visual query
      const generateBtn = screen.getByTestId('generate-visual-query');
      fireEvent.click(generateBtn);

      // Switch to multi-table mode
      const updatedProps = {
        ...props,
        selectedSources: mockDataSources
      };

      rerender(
        <ThemeProvider theme={theme}>
          <ToastProvider>
            <QueryBuilder {...updatedProps} />
          </ToastProvider>
        </ThemeProvider>
      );

      // Visual analysis panel should be hidden
      expect(screen.queryByTestId('visual-analysis-panel')).not.toBeInTheDocument();
    });
  });

  describe('Performance Integration', () => {
    it('handles large result sets efficiently', async () => {
      const { executeDuckDBSQL } = require('../../../services/apiClient');

      // Mock large result set
      const largeResults = {
        success: true,
        data: Array.from({ length: 10000 }, (_, i) => ({
          id: i,
          name: `User ${i}`,
          value: Math.random() * 1000
        })),
        columns: ['id', 'name', 'value']
      };

      executeDuckDBSQL.mockResolvedValue(largeResults);

      const props = {
        ...defaultProps,
        selectedSources: [mockDataSources[0]]
      };

      renderWithProviders(<QueryBuilder {...props} />);

      // Generate and execute visual query
      const generateBtn = screen.getByTestId('generate-visual-query');
      fireEvent.click(generateBtn);

      const executeBtn = screen.getByText('执行查询');
      fireEvent.click(executeBtn);

      await waitFor(() => {
        expect(props.onResultsReceived).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.arrayContaining([
              expect.objectContaining({ id: expect.any(Number) })
            ])
          })
        );
      }, { timeout: 5000 });
    });

    it('shows loading state during query execution', async () => {
      const { executeDuckDBSQL } = require('../../../services/apiClient');

      // Mock slow query
      executeDuckDBSQL.mockImplementation(() =>
        new Promise(resolve =>
          setTimeout(() => resolve({ success: true, data: [], columns: [] }), 1000)
        )
      );

      const props = {
        ...defaultProps,
        selectedSources: [mockDataSources[0]]
      };

      renderWithProviders(<QueryBuilder {...props} />);

      // Generate visual query
      const generateBtn = screen.getByTestId('generate-visual-query');
      fireEvent.click(generateBtn);

      // Execute query
      const executeBtn = screen.getByText('执行查询');
      fireEvent.click(executeBtn);

      // Should show loading state
      expect(screen.getByText('查询执行中...')).toBeInTheDocument();
      expect(executeBtn).toBeDisabled();

      // Wait for completion
      await waitFor(() => {
        expect(screen.queryByText('查询执行中...')).not.toBeInTheDocument();
      }, { timeout: 2000 });
    });
  });
});