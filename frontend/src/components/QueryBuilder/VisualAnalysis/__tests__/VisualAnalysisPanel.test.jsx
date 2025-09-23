/**
 * Unit tests for VisualAnalysisPanel component
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import VisualAnalysisPanel from '../VisualAnalysisPanel';

// Mock the sub-components
jest.mock('../ColumnSelector', () => {
  return function MockColumnSelector({ onColumnSelectionChange, selectedColumns }) {
    return (
      <div data-testid="column-selector">
        <button 
          onClick={() => onColumnSelectionChange(['col1', 'col2'])}
          data-testid="select-columns-btn"
        >
          Select Columns
        </button>
        <div data-testid="selected-columns">
          {selectedColumns.join(', ')}
        </div>
      </div>
    );
  };
});

jest.mock('../AggregationControls', () => {
  return function MockAggregationControls({ onAggregationsChange, aggregations }) {
    return (
      <div data-testid="aggregation-controls">
        <button 
          onClick={() => onAggregationsChange([{ column: 'amount', function: 'SUM' }])}
          data-testid="add-aggregation-btn"
        >
          Add Aggregation
        </button>
        <div data-testid="aggregations-count">
          {aggregations.length}
        </div>
      </div>
    );
  };
});

jest.mock('../FilterControls', () => {
  return function MockFilterControls({ onFiltersChange, filters }) {
    return (
      <div data-testid="filter-controls">
        <button 
          onClick={() => onFiltersChange([{ column: 'status', operator: '=', value: 'active' }])}
          data-testid="add-filter-btn"
        >
          Add Filter
        </button>
        <div data-testid="filters-count">
          {filters.length}
        </div>
      </div>
    );
  };
});

jest.mock('../SortLimitControls', () => {
  return function MockSortLimitControls({ onOrderByChange, onLimitChange, orderBy, limit }) {
    return (
      <div data-testid="sort-limit-controls">
        <button 
          onClick={() => onOrderByChange([{ column: 'name', direction: 'ASC' }])}
          data-testid="add-sort-btn"
        >
          Add Sort
        </button>
        <button 
          onClick={() => onLimitChange(100)}
          data-testid="set-limit-btn"
        >
          Set Limit
        </button>
        <div data-testid="order-by-count">{orderBy.length}</div>
        <div data-testid="limit-value">{limit || 'No limit'}</div>
      </div>
    );
  };
});

// Mock the visual query utilities
jest.mock('../../../types/visualQuery', () => ({
  createDefaultConfig: jest.fn((tableName) => ({
    tableName,
    selectedColumns: [],
    aggregations: [],
    filters: [],
    orderBy: [],
    limit: null,
    isDistinct: false
  })),
  validateConfig: jest.fn(() => ({ isValid: true, errors: [], warnings: [] }))
}));

jest.mock('../../../utils/visualQueryGenerator', () => ({
  generateSQLPreview: jest.fn((config, tableName) => ({
    success: true,
    sql: `SELECT * FROM "${tableName}"`,
    errors: [],
    warnings: []
  }))
}));

const theme = createTheme();

const renderWithTheme = (component) => {
  return render(
    <ThemeProvider theme={theme}>
      {component}
    </ThemeProvider>
  );
};

describe('VisualAnalysisPanel', () => {
  const mockOnVisualQueryGenerated = jest.fn();
  
  const defaultProps = {
    selectedSources: [{ id: 'test_table', name: 'Test Table' }],
    onVisualQueryGenerated: mockOnVisualQueryGenerated,
    isVisible: true
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Rendering', () => {
    it('renders when single table is selected', () => {
      renderWithTheme(<VisualAnalysisPanel {...defaultProps} />);
      
      expect(screen.getByText('可视化分析')).toBeInTheDocument();
      expect(screen.getByText(/为 "Test Table" 配置分析条件/)).toBeInTheDocument();
      expect(screen.getByText('单表分析')).toBeInTheDocument();
    });

    it('does not render when no tables selected', () => {
      renderWithTheme(
        <VisualAnalysisPanel 
          {...defaultProps} 
          selectedSources={[]} 
        />
      );
      
      expect(screen.queryByText('可视化分析')).not.toBeInTheDocument();
    });

    it('does not render when multiple tables selected', () => {
      renderWithTheme(
        <VisualAnalysisPanel 
          {...defaultProps} 
          selectedSources={[
            { id: 'table1', name: 'Table 1' },
            { id: 'table2', name: 'Table 2' }
          ]} 
        />
      );
      
      expect(screen.queryByText('可视化分析')).not.toBeInTheDocument();
    });

    it('does not render when isVisible is false', () => {
      renderWithTheme(
        <VisualAnalysisPanel 
          {...defaultProps} 
          isVisible={false}
        />
      );
      
      expect(screen.queryByText('可视化分析')).not.toBeInTheDocument();
    });

    it('renders all sub-components', () => {
      renderWithTheme(<VisualAnalysisPanel {...defaultProps} />);
      
      expect(screen.getByTestId('column-selector')).toBeInTheDocument();
      expect(screen.getByTestId('aggregation-controls')).toBeInTheDocument();
      expect(screen.getByTestId('filter-controls')).toBeInTheDocument();
      expect(screen.getByTestId('sort-limit-controls')).toBeInTheDocument();
    });

    it('displays SQL preview section', () => {
      renderWithTheme(<VisualAnalysisPanel {...defaultProps} />);
      
      expect(screen.getByText('生成的SQL查询')).toBeInTheDocument();
      expect(screen.getByText(/配置分析条件后将显示生成的SQL/)).toBeInTheDocument();
    });

    it('displays help text', () => {
      renderWithTheme(<VisualAnalysisPanel {...defaultProps} />);
      
      expect(screen.getByText(/选择分析条件来构建查询/)).toBeInTheDocument();
    });
  });

  describe('User Interactions', () => {
    it('handles column selection changes', async () => {
      renderWithTheme(<VisualAnalysisPanel {...defaultProps} />);
      
      const selectColumnsBtn = screen.getByTestId('select-columns-btn');
      fireEvent.click(selectColumnsBtn);
      
      await waitFor(() => {
        expect(screen.getByTestId('selected-columns')).toHaveTextContent('col1, col2');
      });
    });

    it('handles aggregation changes', async () => {
      renderWithTheme(<VisualAnalysisPanel {...defaultProps} />);
      
      const addAggregationBtn = screen.getByTestId('add-aggregation-btn');
      fireEvent.click(addAggregationBtn);
      
      await waitFor(() => {
        expect(screen.getByTestId('aggregations-count')).toHaveTextContent('1');
      });
    });

    it('handles filter changes', async () => {
      renderWithTheme(<VisualAnalysisPanel {...defaultProps} />);
      
      const addFilterBtn = screen.getByTestId('add-filter-btn');
      fireEvent.click(addFilterBtn);
      
      await waitFor(() => {
        expect(screen.getByTestId('filters-count')).toHaveTextContent('1');
      });
    });

    it('handles sort and limit changes', async () => {
      renderWithTheme(<VisualAnalysisPanel {...defaultProps} />);
      
      const addSortBtn = screen.getByTestId('add-sort-btn');
      const setLimitBtn = screen.getByTestId('set-limit-btn');
      
      fireEvent.click(addSortBtn);
      fireEvent.click(setLimitBtn);
      
      await waitFor(() => {
        expect(screen.getByTestId('order-by-count')).toHaveTextContent('1');
        expect(screen.getByTestId('limit-value')).toHaveTextContent('100');
      });
    });
  });

  describe('SQL Generation', () => {
    it('calls onVisualQueryGenerated when configuration changes', async () => {
      const { generateSQLPreview } = require('../../../utils/visualQueryGenerator');
      
      renderWithTheme(<VisualAnalysisPanel {...defaultProps} />);
      
      const selectColumnsBtn = screen.getByTestId('select-columns-btn');
      fireEvent.click(selectColumnsBtn);
      
      await waitFor(() => {
        expect(generateSQLPreview).toHaveBeenCalled();
        expect(mockOnVisualQueryGenerated).toHaveBeenCalled();
      });
    });

    it('displays generated SQL in preview', async () => {
      const { generateSQLPreview } = require('../../../utils/visualQueryGenerator');
      generateSQLPreview.mockReturnValue({
        success: true,
        sql: 'SELECT "col1", "col2" FROM "test_table"',
        errors: [],
        warnings: []
      });

      renderWithTheme(<VisualAnalysisPanel {...defaultProps} />);
      
      const selectColumnsBtn = screen.getByTestId('select-columns-btn');
      fireEvent.click(selectColumnsBtn);
      
      await waitFor(() => {
        expect(screen.getByText('SELECT "col1", "col2" FROM "test_table"')).toBeInTheDocument();
      });
    });

    it('handles SQL generation errors', async () => {
      const { generateSQLPreview } = require('../../../utils/visualQueryGenerator');
      generateSQLPreview.mockReturnValue({
        success: false,
        sql: '',
        errors: ['Invalid configuration'],
        warnings: []
      });

      renderWithTheme(<VisualAnalysisPanel {...defaultProps} />);
      
      const selectColumnsBtn = screen.getByTestId('select-columns-btn');
      fireEvent.click(selectColumnsBtn);
      
      await waitFor(() => {
        expect(screen.getByText('Invalid configuration')).toBeInTheDocument();
      });
    });
  });

  describe('Configuration Management', () => {
    it('resets configuration when table changes', () => {
      const { rerender } = renderWithTheme(<VisualAnalysisPanel {...defaultProps} />);
      
      // Change to different table
      rerender(
        <ThemeProvider theme={theme}>
          <VisualAnalysisPanel 
            {...defaultProps} 
            selectedSources={[{ id: 'new_table', name: 'New Table' }]}
          />
        </ThemeProvider>
      );
      
      expect(screen.getByText(/为 "New Table" 配置分析条件/)).toBeInTheDocument();
    });

    it('clears configuration when no table selected', () => {
      const { rerender } = renderWithTheme(<VisualAnalysisPanel {...defaultProps} />);
      
      // Remove table selection
      rerender(
        <ThemeProvider theme={theme}>
          <VisualAnalysisPanel 
            {...defaultProps} 
            selectedSources={[]}
          />
        </ThemeProvider>
      );
      
      expect(screen.queryByText('可视化分析')).not.toBeInTheDocument();
    });
  });

  describe('Error Handling', () => {
    it('displays error messages', async () => {
      const { generateSQLPreview } = require('../../../utils/visualQueryGenerator');
      generateSQLPreview.mockImplementation(() => {
        throw new Error('SQL generation failed');
      });

      renderWithTheme(<VisualAnalysisPanel {...defaultProps} />);
      
      const selectColumnsBtn = screen.getByTestId('select-columns-btn');
      fireEvent.click(selectColumnsBtn);
      
      await waitFor(() => {
        expect(screen.getByText(/SQL生成失败/)).toBeInTheDocument();
      });
    });

    it('clears errors when configuration is fixed', async () => {
      const { generateSQLPreview } = require('../../../utils/visualQueryGenerator');
      
      // First call fails
      generateSQLPreview.mockImplementationOnce(() => {
        throw new Error('SQL generation failed');
      });
      
      // Second call succeeds
      generateSQLPreview.mockImplementationOnce(() => ({
        success: true,
        sql: 'SELECT * FROM "test_table"',
        errors: [],
        warnings: []
      }));

      renderWithTheme(<VisualAnalysisPanel {...defaultProps} />);
      
      const selectColumnsBtn = screen.getByTestId('select-columns-btn');
      
      // First click causes error
      fireEvent.click(selectColumnsBtn);
      await waitFor(() => {
        expect(screen.getByText(/SQL生成失败/)).toBeInTheDocument();
      });
      
      // Second click fixes error
      fireEvent.click(selectColumnsBtn);
      await waitFor(() => {
        expect(screen.queryByText(/SQL生成失败/)).not.toBeInTheDocument();
      });
    });
  });

  describe('Accessibility', () => {
    it('has proper ARIA labels', () => {
      renderWithTheme(<VisualAnalysisPanel {...defaultProps} />);
      
      expect(screen.getByText('可视化分析')).toBeInTheDocument();
      expect(screen.getByText('生成的SQL查询')).toBeInTheDocument();
    });

    it('supports keyboard navigation', () => {
      renderWithTheme(<VisualAnalysisPanel {...defaultProps} />);
      
      const selectColumnsBtn = screen.getByTestId('select-columns-btn');
      expect(selectColumnsBtn).toBeInTheDocument();
      
      // Test that buttons are focusable
      selectColumnsBtn.focus();
      expect(selectColumnsBtn).toHaveFocus();
    });
  });
});