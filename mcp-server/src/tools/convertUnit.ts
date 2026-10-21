import { z } from "zod/v4";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types";

export const name = "convertUnit";
export const description = "Convert a numeric value from one unit to another. Supports length, weight, temperature, and area.";

export const inputSchema = {
  value: z.number().describe("Numeric value to convert"),
  fromUnit: z.string().describe("Source unit (e.g. km, kg, celsius, m2)"),
  toUnit: z.string().describe("Target unit (e.g. m, lb, fahrenheit, km2)"),
};

type Category = "length" | "weight" | "temperature" | "area";

const UNITS: Record<string, Category> = {
  km: "length", m: "length", cm: "length", mm: "length", in: "length", ft: "length",
  kg: "weight", g: "weight", lb: "weight",
  celsius: "temperature", fahrenheit: "temperature", kelvin: "temperature",
  m2: "area", km2: "area",
};

const TO_BASE: Record<string, number> = {
  km: 1000, m: 1, cm: 0.01, mm: 0.001, in: 0.0254, ft: 0.3048,
  kg: 1000, g: 1, lb: 453.59237,
  m2: 1, km2: 1_000_000,
};

function tempToBase(unit: string, value: number): number {
  switch (unit) {
    case "celsius": return value;
    case "fahrenheit": return (value - 32) * 5 / 9;
    case "kelvin": return value - 273.15;
    default: return NaN;
  }
}

function tempFromBase(unit: string, celsius: number): number {
  switch (unit) {
    case "celsius": return celsius;
    case "fahrenheit": return celsius * 9 / 5 + 32;
    case "kelvin": return celsius + 273.15;
    default: return NaN;
  }
}

export async function handler(args: { value: number; fromUnit: string; toUnit: string }): Promise<CallToolResult> {
  const { value, fromUnit, toUnit } = args;
  const fromCategory = UNITS[fromUnit.toLowerCase()];
  const toCategory = UNITS[toUnit.toLowerCase()];

  if (!fromCategory || !toCategory) {
    return {
      content: [{ type: "text" as const, text: `Unknown unit: ${!fromCategory ? fromUnit : toUnit}. Supported: km,m,cm,mm,in,ft,kg,g,lb,celsius,fahrenheit,kelvin,m2,km2` }],
      isError: true,
    };
  }

  if (fromCategory !== toCategory) {
    return {
      content: [{ type: "text" as const, text: `Cannot convert ${fromCategory} to ${toCategory}.` }],
      isError: true,
    };
  }

  let base: number;
  let result: number;

  if (fromCategory === "temperature") {
    base = tempToBase(fromUnit.toLowerCase(), value);
    result = tempFromBase(toUnit.toLowerCase(), base);
  } else {
    base = value * TO_BASE[fromUnit.toLowerCase()];
    result = base / TO_BASE[toUnit.toLowerCase()];
  }

  const rounded = Math.round(result * 1_000_000) / 1_000_000;

  return {
    content: [{ type: "text" as const, text: `${rounded} ${toUnit}` }],
  };
}