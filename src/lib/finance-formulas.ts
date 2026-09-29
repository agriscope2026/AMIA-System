export type FormulaCellLookup = (rowIndex: number, columnIndex: number) => unknown;

type Token =
  | { kind: "number"; value: number }
  | { kind: "reference"; value: string }
  | { kind: "identifier"; value: string }
  | { kind: "operator"; value: string };
type FormulaValue = number | string | null | FormulaValue[];

function toFormulaValue(value: unknown): FormulaValue {
  if (Array.isArray(value)) return value.map(toFormulaValue);
  if (typeof value === "number" || typeof value === "string") return value;
  if (typeof value === "boolean") return value ? 1 : 0;
  return null;
}

function flattenValues(value: FormulaValue): (number | string | null)[] {
  if (!Array.isArray(value)) return [value];
  return value.flatMap(flattenValues);
}

const tokenPattern = /\s*(?:(\d+(?:\.\d*)?|\.\d+)|(\$?[A-Z]{1,3}\$?\d+)|([A-Za-z_][A-Za-z0-9_]*)|([+\-*/^(),:%]))/gy;

function tokenize(formula: string): Token[] {
  const input = formula.startsWith("=") ? formula.slice(1) : formula;
  const tokens: Token[] = [];
  let index = 0;
  while (index < input.length) {
    tokenPattern.lastIndex = index;
    const match = tokenPattern.exec(input);
    if (!match) throw new Error("Unsupported formula syntax");
    index = tokenPattern.lastIndex;
    if (match[1]) tokens.push({ kind: "number", value: Number(match[1]) });
    else if (match[2]) tokens.push({ kind: "reference", value: match[2].replace(/\$/g, "") });
    else if (match[3]) tokens.push({ kind: "identifier", value: match[3] });
    else if (match[4]) tokens.push({ kind: "operator", value: match[4] });
  }
  return tokens;
}

function referencePosition(reference: string) {
  const match = /^([A-Z]{1,3})(\d+)$/i.exec(reference);
  if (!match) throw new Error("Invalid cell reference");
  let column = 0;
  for (const character of match[1].toUpperCase()) column = column * 26 + character.charCodeAt(0) - 64;
  return { row: Number(match[2]) - 1, column: column - 1 };
}

export function evaluateFinanceFormula(formula: string, lookup: FormulaCellLookup): number | string {
  let tokens: Token[];
  try {
    tokens = tokenize(formula);
  } catch (error) {
    return error instanceof Error ? `#ERROR: ${error.message}` : "#ERROR";
  }
  let cursor = 0;

  const peek = (value?: string) => {
    const token = tokens[cursor];
    return value === undefined ? token : token?.kind === "operator" && token.value === value;
  };
  const consume = () => tokens[cursor++];
  const numeric = (value: FormulaValue): number => {
    if (Array.isArray(value)) return value.reduce<number>((sum, item) => sum + numeric(item), 0);
    if (value === null) return 0;
    if (typeof value === "string" && value.startsWith("#")) throw new Error(value);
    const result = typeof value === "number" ? value : Number(value);
    return Number.isFinite(result) ? result : 0;
  };
  const reference = (value: string): FormulaValue => {
    const position = referencePosition(value);
    return toFormulaValue(lookup(position.row, position.column));
  };

  const parseExpression = (): FormulaValue => {
    let value = parseTerm();
    while (peek("+") || peek("-")) {
      const operator = (consume() as Token & { kind: "operator" }).value;
      const right = parseTerm();
      value = operator === "+" ? numeric(value) + numeric(right) : numeric(value) - numeric(right);
    }
    return value;
  };
  const parseTerm = (): FormulaValue => {
    let value = parsePower();
    while (peek("*") || peek("/")) {
      const operator = (consume() as Token & { kind: "operator" }).value;
      const right = parsePower();
      if (operator === "/" && numeric(right) === 0) throw new Error("Division by zero");
      value = operator === "*" ? numeric(value) * numeric(right) : numeric(value) / numeric(right);
    }
    return value;
  };
  const parsePower = (): FormulaValue => {
    let value = parseUnary();
    if (peek("^")) {
      consume();
      value = numeric(value) ** numeric(parsePower());
    }
    return value;
  };
  const parseUnary = (): FormulaValue => {
    if (peek("+")) {
      consume();
      return numeric(parseUnary());
    }
    if (peek("-")) {
      consume();
      return -numeric(parseUnary());
    }
    return parsePrimary();
  };
  const parsePrimary = (): FormulaValue => {
    const token = consume();
    if (!token) throw new Error("Incomplete formula");
    if (token.kind === "number") return token.value;
    if (token.kind === "reference") {
      const start = referencePosition(token.value);
      if (peek(":")) {
        consume();
        const endToken = consume();
        if (endToken?.kind !== "reference") throw new Error("Invalid range");
        const end = referencePosition(endToken.value);
        if (start.row > end.row || start.column > end.column || (end.row - start.row + 1) * (end.column - start.column + 1) > 10000) {
          throw new Error("Invalid or oversized range");
        }
        const values: FormulaValue[] = [];
        for (let row = start.row; row <= end.row; row++) {
          for (let column = start.column; column <= end.column; column++) values.push(toFormulaValue(lookup(row, column)));
        }
        return values;
      }
      return reference(token.value);
    }
    if (token.kind === "operator" && token.value === "(") {
      const value = parseExpression();
      if (!peek(")")) throw new Error("Missing closing parenthesis");
      consume();
      return value;
    }
    if (token.kind === "identifier") {
      const name = token.value.toUpperCase();
      if (name === "TRUE") return 1;
      if (name === "FALSE") return 0;
      if (!peek("(")) throw new Error("Unknown formula name");
      consume();
      const args: FormulaValue[] = [];
      let hasMoreArguments = !peek(")");
      while (hasMoreArguments) {
        args.push(parseExpression());
        hasMoreArguments = peek(",") === true;
        if (hasMoreArguments) consume();
      }
      if (!peek(")")) throw new Error("Missing closing parenthesis");
      consume();
      const values = args.flatMap(flattenValues);
      const numbers = values.map(numeric);
      switch (name) {
        case "SUM": return numbers.reduce((sum, item) => sum + item, 0);
        case "AVERAGE": return numbers.length ? numbers.reduce((sum, item) => sum + item, 0) / numbers.length : 0;
        case "MIN": return numbers.length ? Math.min(...numbers) : 0;
        case "MAX": return numbers.length ? Math.max(...numbers) : 0;
        case "COUNT": return values.filter((item) => typeof item === "number" && Number.isFinite(item)).length;
        case "COUNTA": return values.filter((item) => item !== "" && item !== null).length;
        default: throw new Error(`Unsupported function: ${name}`);
      }
    }
    throw new Error("Unsupported formula syntax");
  };

  try {
    const result = parseExpression();
    if (cursor !== tokens.length || Array.isArray(result)) throw new Error("Unexpected formula input");
    return result ?? 0;
  } catch (error) {
    return error instanceof Error ? `#ERROR: ${error.message}` : "#ERROR";
  }
}
