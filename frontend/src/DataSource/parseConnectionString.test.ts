import { describe, it, expect } from "vitest";
import { parseConnectionString } from "./parseConnectionString";

describe("parseConnectionString", () => {
  it("parses a JDBC MySQL URL with host/port/db", () => {
    expect(
      parseConnectionString(
        "jdbc:mysql://rr-2zem69b0s32cl098k.mysql.rds.aliyuncs.com:3306/sorting"
      )
    ).toEqual({
      type: "mysql",
      host: "rr-2zem69b0s32cl098k.mysql.rds.aliyuncs.com",
      port: 3306,
      database: "sorting",
    });
  });

  it("parses a mysql:// URL with user and password", () => {
    expect(parseConnectionString("mysql://root:s3cr3t@localhost:3306/app")).toEqual({
      type: "mysql",
      host: "localhost",
      port: 3306,
      database: "app",
      username: "root",
      password: "s3cr3t",
    });
  });

  it("parses postgresql with default port and a schema query param", () => {
    expect(
      parseConnectionString("postgresql://reader@db.example.com/analytics?currentSchema=reporting")
    ).toEqual({
      type: "postgresql",
      host: "db.example.com",
      port: 5432,
      database: "analytics",
      username: "reader",
      schema: "reporting",
    });
  });

  it("treats the postgres:// alias as postgresql and defaults the port", () => {
    expect(parseConnectionString("postgres://localhost/mydb")).toEqual({
      type: "postgresql",
      host: "localhost",
      port: 5432,
      database: "mydb",
    });
  });

  it("decodes percent-encoded credentials", () => {
    const r = parseConnectionString("mysql://us%40er:p%40ss@host:3306/db");
    expect(r?.username).toBe("us@er");
    expect(r?.password).toBe("p@ss");
  });

  it("recognizes a jdbc:sqlite path", () => {
    expect(parseConnectionString("jdbc:sqlite:/var/db/app.sqlite")).toEqual({
      type: "sqlite",
      database: "/var/db/app.sqlite",
    });
  });

  it("recognizes a bare SQLite file path", () => {
    expect(parseConnectionString("/Users/keliang/data/local.db")).toEqual({
      type: "sqlite",
      database: "/Users/keliang/data/local.db",
    });
  });

  it("ignores the ?ssl query for MySQL but keeps host/db", () => {
    const r = parseConnectionString("mysql://h:3307/d?useSSL=true&serverTimezone=UTC");
    expect(r).toMatchObject({ type: "mysql", host: "h", port: 3307, database: "d" });
    expect(r?.schema).toBeUndefined();
  });

  it("returns null for empty or unrecognized input", () => {
    expect(parseConnectionString("")).toBeNull();
    expect(parseConnectionString("   ")).toBeNull();
    expect(parseConnectionString("just some text")).toBeNull();
    expect(parseConnectionString("https://example.com/data.csv")).toBeNull();
  });
});
