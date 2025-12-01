/**
 * Select Component Usage Examples
 * 
 * This file demonstrates how to use the Select component
 * based on @radix-ui/react-select with shadcn/ui styling
 */

import React from "react"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "./select"

// Example 1: Basic Select
export function BasicSelectExample() {
  return (
    <Select>
      <SelectTrigger className="w-[180px]">
        <SelectValue placeholder="选择数据库类型" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="mysql">MySQL</SelectItem>
        <SelectItem value="postgresql">PostgreSQL</SelectItem>
        <SelectItem value="sqlite">SQLite</SelectItem>
      </SelectContent>
    </Select>
  )
}

// Example 2: Select with Groups
export function GroupedSelectExample() {
  return (
    <Select>
      <SelectTrigger className="w-[280px]">
        <SelectValue placeholder="选择数据源" />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectLabel>关系型数据库</SelectLabel>
          <SelectItem value="mysql">MySQL</SelectItem>
          <SelectItem value="postgresql">PostgreSQL</SelectItem>
          <SelectItem value="sqlite">SQLite</SelectItem>
        </SelectGroup>
        <SelectGroup>
          <SelectLabel>文件数据源</SelectLabel>
          <SelectItem value="csv">CSV 文件</SelectItem>
          <SelectItem value="parquet">Parquet 文件</SelectItem>
          <SelectItem value="excel">Excel 文件</SelectItem>
        </SelectGroup>
      </SelectContent>
    </Select>
  )
}

// Example 3: Controlled Select
export function ControlledSelectExample() {
  const [value, setValue] = React.useState<string>("")

  return (
    <div className="space-y-2">
      <Select value={value} onValueChange={setValue}>
        <SelectTrigger className="w-[180px]">
          <SelectValue placeholder="选择分隔符" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="comma">逗号 (,)</SelectItem>
          <SelectItem value="tab">制表符 (Tab)</SelectItem>
          <SelectItem value="semicolon">分号 (;)</SelectItem>
          <SelectItem value="pipe">竖线 (|)</SelectItem>
        </SelectContent>
      </Select>
      {value && (
        <p className="text-sm text-muted-foreground">
          当前选择: {value}
        </p>
      )}
    </div>
  )
}

// Example 4: Select with Disabled Items
export function SelectWithDisabledExample() {
  return (
    <Select>
      <SelectTrigger className="w-[200px]">
        <SelectValue placeholder="选择连接" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="conn1">生产环境 MySQL</SelectItem>
        <SelectItem value="conn2">测试环境 PostgreSQL</SelectItem>
        <SelectItem value="conn3" disabled>
          开发环境 SQLite (离线)
        </SelectItem>
      </SelectContent>
    </Select>
  )
}

// Example 5: Form Integration Example
export function FormSelectExample() {
  const [dbType, setDbType] = React.useState<string>("")
  const [port, setPort] = React.useState<string>("")

  React.useEffect(() => {
    // Auto-fill default port based on database type
    switch (dbType) {
      case "mysql":
        setPort("3306")
        break
      case "postgresql":
        setPort("5432")
        break
      case "sqlite":
        setPort("")
        break
      default:
        setPort("")
    }
  }, [dbType])

  return (
    <div className="space-y-4 w-[300px]">
      <div className="space-y-2">
        <label className="text-sm font-medium">数据库类型</label>
        <Select value={dbType} onValueChange={setDbType}>
          <SelectTrigger>
            <SelectValue placeholder="选择数据库类型" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="mysql">MySQL</SelectItem>
            <SelectItem value="postgresql">PostgreSQL</SelectItem>
            <SelectItem value="sqlite">SQLite</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {port && (
        <div className="space-y-2">
          <label className="text-sm font-medium">默认端口</label>
          <input
            type="text"
            value={port}
            readOnly
            className="flex h-10 w-full rounded-md border border-border bg-muted px-3 py-2 text-sm"
          />
        </div>
      )}
    </div>
  )
}
