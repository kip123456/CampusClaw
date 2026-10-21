import { z } from "zod/v4";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types";

export const name = "calculate";
export const description = "Perform arithmetic operations (+, -, *, /) on two numbers.";

export const inputSchema = {
  expression: z.string().describe("Arithmetic expression like '2 + 3' or '10 / 4'"),
};

export async function handler(args: { expression: string }): Promise<CallToolResult> {
  const parts = args.expression.trim().split(/\s+/);
  if (parts.length !== 3) {
    return {
      content: [{ type: "text" as const, text: `Invalid expression: "${args.expression}". Expected format: "<number> <op> <number>"` }],
      isError: true,
    };
  }

  const left = parseFloat(parts[0]);
  const op = parts[1];
  const right = parseFloat(parts[2]);

  if (isNaN(left) || isNaN(right)) {
    return {
      content: [{ type: "text" as const, text: `Invalid numbers in expression: "${args.expression}"` }],
      isError: true,
    };
  }

  let result: number;
  switch (op) {
    case "+": result = left + right; break;
    case "-": result = left - right; break;
    case "*": result = left * right; break;
    case "/":
      if (right === 0) {
        return {
          content: [{ type: "text" as const, text: "Division by zero is not allowed." }],
          isError: true,
        };
      }
      result = left / right;
      break;
    default:
      return {
        content: [{ type: "text" as const, text: `Unsupported operator: "${op}". Use +, -, *, /.` }],
        isError: true,
      };
  }

  return {
    content: [{ type: "text" as const, text: String(result) }],
  };
}