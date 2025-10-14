import React, { useState } from "react";
import {
  Box,
  Button,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Typography,
  IconButton,
  Tooltip,
  Paper,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  Collapse,
  Chip,
  Divider,
} from "@mui/material";
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  Sort as SortIcon,
  ArrowUpward as ArrowUpwardIcon,
  ArrowDownward as ArrowDownwardIcon,
  HelpOutline as HelpOutlineIcon,
} from "@mui/icons-material";
import { SortDirection } from "../../utils/visualQueryUtils";

/**
 * SortControls - 排序控制组件
 * 允许用户配置排序条件
 */
const SortControls = ({
  columns = [],
  orderBy = [],
  onOrderByChange,
  disabled = false,
}) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const [newSort, setNewSort] = useState({
    column: "",
    direction: SortDirection.ASC,
    cast: "auto",
  });

  // 添加排序条件
  const handleAddSort = () => {
    if (!newSort.column) {
      return;
    }

    const sortItem = {
      id: Date.now() + Math.random(),
      column: newSort.column,
      direction: newSort.direction,
      cast: newSort.cast || "auto",
    };

    onOrderByChange([...orderBy, sortItem]);

    // 重置表单
    setNewSort({
      column: "",
      direction: SortDirection.ASC,
      cast: "auto",
    });
  };

  // 删除排序条件
  const handleRemoveSort = (id) => {
    onOrderByChange(orderBy.filter((sort) => sort.id !== id));
  };

  // 更新排序条件
  const handleUpdateSort = (id, field, value) => {
    const updatedSorts = orderBy.map((sort) => {
      if (sort.id === id) {
        return { ...sort, [field]: value };
      }
      return sort;
    });

    onOrderByChange(updatedSorts);
  };

  // 移动排序条件位置
  const handleMoveSort = (id, direction) => {
    const currentIndex = orderBy.findIndex((sort) => sort.id === id);
    if (currentIndex === -1) return;

    const newIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
    if (newIndex < 0 || newIndex >= orderBy.length) return;

    const newOrderBy = [...orderBy];
    [newOrderBy[currentIndex], newOrderBy[newIndex]] = [
      newOrderBy[newIndex],
      newOrderBy[currentIndex],
    ];

    onOrderByChange(newOrderBy);
  };

  // 获取方向显示名称
  const getDirectionDisplayName = (direction) => {
    return direction === SortDirection.ASC ? "升序" : "降序";
  };

  // 获取方向图标
  const getDirectionIcon = (direction) => {
    return direction === SortDirection.ASC ? (
      <ArrowUpwardIcon fontSize="small" />
    ) : (
      <ArrowDownwardIcon fontSize="small" />
    );
  };

  // 获取方向颜色
  const getDirectionColor = (direction) => {
    return direction === SortDirection.ASC ? "primary" : "secondary";
  };

  return (
    <Box sx={{ width: "100%" }}>
      {/* 标题和控制 - 统一蓝色风格 */}
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 2, px: 0.5 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Box sx={{ width: 8, height: 8, bgcolor: "#3b82f6", borderRadius: "50%" }} />
          <Typography variant="subtitle2" sx={{ fontWeight: 700, color: "text.primary" }}>
            排序 (ORDER BY)
          </Typography>
          <Typography variant="caption" sx={{ color: "text.secondary" }}>
            {orderBy.length}个规则
          </Typography>
        </Box>
        <Typography
          variant="caption"
          onClick={handleAddSort}
          disabled={disabled || !newSort.column}
          sx={{
            color: "#3b82f6",
            fontWeight: 600,
            cursor: disabled || !newSort.column ? "not-allowed" : "pointer",
            opacity: disabled || !newSort.column ? 0.5 : 1,
            display: "flex",
            alignItems: "center",
            gap: 0.5,
            "&:hover": {
              color: "#2563eb"
            }
          }}
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ width: 14, height: 14 }}>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"></path>
          </svg>
          添加
        </Typography>
      </Box>

      <Collapse in={isExpanded}>
        {/* 排序列表 - 柔和圆润风格 */}
        <Box sx={{ bgcolor: "#f9fafb", borderRadius: 4, border: "1px solid #e5e7eb", p: 2 }}>
          <Typography variant="body2" sx={{ mb: 2, fontWeight: 500 }}>
            添加排序条件
          </Typography>

          <Box
            sx={{
              display: "flex",
              gap: 1,
              flexWrap: "wrap",
              alignItems: "flex-end",
            }}
          >
            {/* 选择列 */}
            <FormControl size="small" sx={{ minWidth: 120 }}>
              <InputLabel>排序列</InputLabel>
              <Select
                value={newSort.column}
                label="排序列"
                onChange={(e) =>
                  setNewSort((prev) => ({
                    ...prev,
                    column: e.target.value,
                  }))
                }
                disabled={disabled}
              >
                {columns.map((column) => {
                  const columnName =
                    typeof column === "string" ? column : column.name;
                  const isAlreadyUsed = orderBy.some(
                    (sort) => sort.column === columnName,
                  );

                  return (
                    <MenuItem
                      key={columnName}
                      value={columnName}
                      disabled={isAlreadyUsed}
                    >
                      {columnName}
                      {isAlreadyUsed && (
                        <Chip
                          label="已使用"
                          size="small"
                          color="default"
                          sx={{ ml: 1, height: 16 }}
                        />
                      )}
                    </MenuItem>
                  );
                })}
              </Select>
            </FormControl>

            {/* 选择方向 */}
            <FormControl size="small" sx={{ minWidth: 100 }}>
              <InputLabel>方向</InputLabel>
              <Select
                value={newSort.direction}
                label="方向"
                onChange={(e) =>
                  setNewSort((prev) => ({
                    ...prev,
                    direction: e.target.value,
                  }))
                }
                disabled={disabled}
              >
                <MenuItem value={SortDirection.ASC}>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                    <ArrowUpwardIcon fontSize="small" />
                    升序
                  </Box>
                </MenuItem>
                <MenuItem value={SortDirection.DESC}>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                    <ArrowDownwardIcon fontSize="small" />
                    降序
                  </Box>
                </MenuItem>
              </Select>
            </FormControl>

            {/* 转换类型 */}
            <FormControl size="small" sx={{ minWidth: 100 }}>
              <InputLabel>转换类型</InputLabel>
              <Select
                value={newSort.cast || "auto"}
                label="转换类型"
                onChange={(e) =>
                  setNewSort((prev) => ({
                    ...prev,
                    cast: e.target.value,
                  }))
                }
                disabled={disabled}
              >
                <MenuItem value="auto">自动</MenuItem>
                <MenuItem value="numeric">按数值</MenuItem>
                <MenuItem value="datetime">按日期时间</MenuItem>
                <MenuItem value="string">按字符串</MenuItem>
              </Select>
            </FormControl>

            <Tooltip title="当文本类型的列实际内容为数值或日期时，选择相应类型可确保排序的正确性。">
              <HelpOutlineIcon
                color="action"
                sx={{ fontSize: 18, alignSelf: "center", cursor: "help" }}
              />
            </Tooltip>

            {/* 添加按钮 */}
            <Button
              variant="contained"
              size="small"
              startIcon={<AddIcon />}
              onClick={handleAddSort}
              disabled={disabled || !newSort.column}
              sx={{ ml: 1 }}
            >
              添加
            </Button>
          </Box>
        </Box>

        {/* 已添加的排序条件列表 */}
        {orderBy.length > 0 && (
          <Paper variant="outlined" sx={{ mb: 2, bgcolor: "background.paper" }}>
            <Box
              sx={{ p: 2, borderBottom: "1px solid", borderColor: "divider" }}
            >
              <Typography variant="body2" sx={{ fontWeight: 500 }}>
                排序条件 ({orderBy.length})
              </Typography>
              <Typography variant="caption" color="text.secondary">
                排序优先级从上到下递减
              </Typography>
            </Box>

            <List dense>
              {orderBy.map((sort, index) => (
                <React.Fragment key={sort.id}>
                  <ListItem sx={{ py: 1 }}>
                    <ListItemText
                      primary={
                        <Box
                          sx={{ display: "flex", alignItems: "center", gap: 1 }}
                        >
                          <Typography
                            variant="body2"
                            sx={{ fontWeight: 500, minWidth: 20 }}
                          >
                            {index + 1}.
                          </Typography>
                          <Chip
                            label={sort.column}
                            size="small"
                            color="primary"
                            variant="outlined"
                          />
                          <Chip
                            icon={getDirectionIcon(sort.direction)}
                            label={getDirectionDisplayName(sort.direction)}
                            size="small"
                            color={getDirectionColor(sort.direction)}
                            variant="outlined"
                          />
                          {sort.cast && sort.cast !== "auto" && (
                            <Chip
                              label={
                                sort.cast === "numeric"
                                  ? "按数值"
                                  : sort.cast === "datetime"
                                    ? "按日期"
                                    : "按字符"
                              }
                              size="small"
                              color="info"
                              variant="outlined"
                            />
                          )}
                        </Box>
                      }
                      secondary={
                        <Box
                          sx={{
                            display: "flex",
                            gap: 1,
                            mt: 1,
                            alignItems: "center",
                          }}
                        >
                          {/* 编辑方向 */}
                          <FormControl size="small" sx={{ minWidth: 100 }}>
                            <Select
                              value={sort.direction}
                              onChange={(e) =>
                                handleUpdateSort(
                                  sort.id,
                                  "direction",
                                  e.target.value,
                                )
                              }
                              disabled={disabled}
                              variant="outlined"
                            >
                              <MenuItem value={SortDirection.ASC}>
                                升序
                              </MenuItem>
                              <MenuItem value={SortDirection.DESC}>
                                降序
                              </MenuItem>
                            </Select>
                          </FormControl>

                          {/* 编辑转换类型 */}
                          <FormControl size="small" sx={{ minWidth: 100 }}>
                            <Select
                              value={sort.cast || "auto"}
                              onChange={(e) =>
                                handleUpdateSort(
                                  sort.id,
                                  "cast",
                                  e.target.value,
                                )
                              }
                              disabled={disabled}
                              variant="outlined"
                            >
                              <MenuItem value="auto">自动</MenuItem>
                              <MenuItem value="numeric">按数值</MenuItem>
                              <MenuItem value="datetime">按日期时间</MenuItem>
                              <MenuItem value="string">按字符串</MenuItem>
                            </Select>
                          </FormControl>

                          <Tooltip title="当文本类型的列实际内容为数值或日期时，选择相应类型可确保排序的正确性。">
                            <HelpOutlineIcon
                              color="action"
                              sx={{ fontSize: 18, cursor: "help" }}
                            />
                          </Tooltip>

                          {/* 移动按钮 */}
                          <Box sx={{ display: "flex", gap: 0.5, ml: 1 }}>
                            <Tooltip title="上移">
                              <IconButton
                                size="small"
                                onClick={() => handleMoveSort(sort.id, "up")}
                                disabled={disabled || index === 0}
                              >
                                <ArrowUpwardIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="下移">
                              <IconButton
                                size="small"
                                onClick={() => handleMoveSort(sort.id, "down")}
                                disabled={
                                  disabled || index === orderBy.length - 1
                                }
                              >
                                <ArrowDownwardIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          </Box>
                        </Box>
                      }
                    />

                    <ListItemSecondaryAction>
                      <Tooltip title="删除排序条件">
                        <IconButton
                          edge="end"
                          size="small"
                          onClick={() => handleRemoveSort(sort.id)}
                          disabled={disabled}
                          color="error"
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </ListItemSecondaryAction>
                  </ListItem>

                  {index < orderBy.length - 1 && <Divider />}
                </React.Fragment>
              ))}
            </List>
          </Paper>
        )}

        {/* 提示信息 */}
        {orderBy.length === 0 && (
          <Paper sx={{ p: 3, textAlign: "center", bgcolor: "grey.50" }}>
            <Typography variant="body2" color="text.secondary">
              还没有配置排序条件
            </Typography>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ display: "block", mt: 1 }}
            >
              排序可以控制结果的顺序
            </Typography>
          </Paper>
        )}
      </Collapse>
    </Box>
  );
};

export default SortControls;