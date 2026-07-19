function fail(message, lineNumber) {
  const suffix = lineNumber === undefined ? "" : ` at line ${lineNumber}`;
  throw new Error(`strict workflow YAML parse failed${suffix}: ${message}`);
}

function indentation(line, lineNumber) {
  const match = /^ */.exec(line);
  const width = match?.[0].length ?? 0;
  if (line.slice(0, width + 1).includes("\t")) {
    fail("tabs are forbidden in indentation", lineNumber);
  }
  return width;
}

function withoutYamlComment(value) {
  let singleQuoted = false;
  let doubleQuoted = false;
  let escaped = false;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (doubleQuoted && escaped) {
      escaped = false;
      continue;
    }
    if (doubleQuoted && character === "\\") {
      escaped = true;
      continue;
    }
    if (!doubleQuoted && character === "'") {
      if (singleQuoted && value[index + 1] === "'") {
        index += 1;
      } else {
        singleQuoted = !singleQuoted;
      }
      continue;
    }
    if (!singleQuoted && character === '"') {
      doubleQuoted = !doubleQuoted;
      continue;
    }
    if (
      !singleQuoted &&
      !doubleQuoted &&
      character === "#" &&
      (index === 0 || /\s/u.test(value[index - 1]))
    ) {
      return value.slice(0, index).trimEnd();
    }
  }
  if (singleQuoted || doubleQuoted) {
    fail("unterminated quoted scalar");
  }
  return value.trimEnd();
}

function mappingPair(value, lineNumber) {
  let singleQuoted = false;
  let doubleQuoted = false;
  let escaped = false;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (doubleQuoted && escaped) {
      escaped = false;
      continue;
    }
    if (doubleQuoted && character === "\\") {
      escaped = true;
      continue;
    }
    if (!doubleQuoted && character === "'") {
      if (singleQuoted && value[index + 1] === "'") {
        index += 1;
      } else {
        singleQuoted = !singleQuoted;
      }
      continue;
    }
    if (!singleQuoted && character === '"') {
      doubleQuoted = !doubleQuoted;
      continue;
    }
    if (!singleQuoted && !doubleQuoted && character === ":") {
      const key = value.slice(0, index).trim();
      const remainder = value.slice(index + 1).trim();
      if (!/^[A-Za-z0-9_.-]+$/u.test(key) || key === "<<") {
        fail(
          `unsupported or unsafe mapping key ${JSON.stringify(key)}`,
          lineNumber,
        );
      }
      return [key, remainder];
    }
  }
  fail("expected a mapping key followed by ':'", lineNumber);
}

function scalar(value, lineNumber) {
  if (/^(?:[&*]|<<\s*:)/u.test(value)) {
    fail("anchors, aliases, and merge keys are forbidden", lineNumber);
  }
  if (value.startsWith('"')) {
    try {
      const parsed = JSON.parse(value);
      if (typeof parsed !== "string")
        fail("double-quoted scalar is not a string");
      return parsed;
    } catch (error) {
      fail(
        `invalid double-quoted scalar: ${
          error instanceof Error ? error.message : String(error)
        }`,
        lineNumber,
      );
    }
  }
  if (value.startsWith("'")) {
    if (!value.endsWith("'") || value.length < 2) {
      fail("invalid single-quoted scalar", lineNumber);
    }
    return value.slice(1, -1).replaceAll("''", "'");
  }
  if (value === "true") return true;
  if (value === "false") return false;
  if (value === "null" || value === "~") return null;
  if (/^-?(?:0|[1-9][0-9]*)$/u.test(value)) return Number(value);
  return value;
}

export function parseStrictWorkflowYaml(source) {
  if (typeof source !== "string") fail("source must be a string");
  const physicalLines = source.replaceAll("\r\n", "\n").split("\n");
  const lines = physicalLines.map((raw, index) => {
    const lineNumber = index + 1;
    const indent = indentation(raw, lineNumber);
    return {
      raw,
      lineNumber,
      indent,
      content: withoutYamlComment(raw.slice(indent)),
    };
  });

  function nextMeaningful(index) {
    while (index < lines.length && lines[index].content.trim() === "") {
      index += 1;
    }
    return index;
  }

  function blockScalar(index, parentIndent, style, lineNumber) {
    let end = index;
    while (end < lines.length) {
      const raw = physicalLines[end];
      if (raw.trim() !== "" && indentation(raw, end + 1) <= parentIndent) break;
      end += 1;
    }
    const contentLines = physicalLines.slice(index, end);
    const nonempty = contentLines.filter((line) => line.trim() !== "");
    if (nonempty.length === 0) return ["", end];
    const contentIndent = Math.min(
      ...nonempty.map((line, offset) =>
        indentation(line, lineNumber + offset + 1),
      ),
    );
    if (contentIndent <= parentIndent) {
      fail("block scalar content is not indented", lineNumber);
    }
    const stripped = contentLines.map((line) =>
      line.trim() === "" ? "" : line.slice(contentIndent),
    );
    const value =
      style[0] === ">"
        ? stripped.join("\n").replaceAll(/\n+/gu, " ").trim()
        : stripped.join("\n");
    return [value, end];
  }

  function mapping(index, indent, initialEntries = []) {
    const result = {};
    for (const [key, value, lineNumber] of initialEntries) {
      if (Object.hasOwn(result, key)) {
        fail(`duplicate mapping key ${key}`, lineNumber);
      }
      result[key] = value;
    }

    while (true) {
      index = nextMeaningful(index);
      if (index >= lines.length || lines[index].indent < indent) break;
      const line = lines[index];
      if (line.indent > indent) {
        fail("unexpected mapping indentation", line.lineNumber);
      }
      if (line.content.startsWith("- ")) break;
      const [key, remainder] = mappingPair(line.content, line.lineNumber);
      if (Object.hasOwn(result, key)) {
        fail(`duplicate mapping key ${key}`, line.lineNumber);
      }
      if (/^[>|][+-]?$/u.test(remainder)) {
        const [value, nextIndex] = blockScalar(
          index + 1,
          indent,
          remainder,
          line.lineNumber,
        );
        result[key] = value;
        index = nextIndex;
        continue;
      }
      if (remainder !== "") {
        result[key] = scalar(remainder, line.lineNumber);
        index += 1;
        continue;
      }
      const childIndex = nextMeaningful(index + 1);
      if (childIndex >= lines.length || lines[childIndex].indent <= indent) {
        result[key] = null;
        index += 1;
        continue;
      }
      const [value, nextIndex] = node(childIndex, lines[childIndex].indent);
      result[key] = value;
      index = nextIndex;
    }
    return [result, index];
  }

  function sequence(index, indent) {
    const result = [];
    while (true) {
      index = nextMeaningful(index);
      if (index >= lines.length || lines[index].indent < indent) break;
      const line = lines[index];
      if (line.indent !== indent || !line.content.startsWith("- ")) break;
      const remainder = line.content.slice(2).trim();
      if (remainder === "") {
        fail("empty sequence items are forbidden", line.lineNumber);
      }

      let pair;
      try {
        pair = mappingPair(remainder, line.lineNumber);
      } catch {
        pair = undefined;
      }
      if (pair === undefined) {
        result.push(scalar(remainder, line.lineNumber));
        index += 1;
        continue;
      }

      const [key, firstRemainder] = pair;
      let firstValue;
      let nextIndex = index + 1;
      if (/^[>|][+-]?$/u.test(firstRemainder)) {
        [firstValue, nextIndex] = blockScalar(
          nextIndex,
          indent + 2,
          firstRemainder,
          line.lineNumber,
        );
      } else if (firstRemainder !== "") {
        firstValue = scalar(firstRemainder, line.lineNumber);
      } else {
        const childIndex = nextMeaningful(nextIndex);
        if (
          childIndex >= lines.length ||
          lines[childIndex].indent <= indent + 2
        ) {
          firstValue = null;
        } else {
          [firstValue, nextIndex] = node(childIndex, lines[childIndex].indent);
        }
      }

      const continuationIndex = nextMeaningful(nextIndex);
      if (
        continuationIndex < lines.length &&
        lines[continuationIndex].indent > indent
      ) {
        const continuationIndent = lines[continuationIndex].indent;
        const [item, afterItem] = mapping(
          continuationIndex,
          continuationIndent,
          [[key, firstValue, line.lineNumber]],
        );
        result.push(item);
        index = afterItem;
      } else {
        result.push({ [key]: firstValue });
        index = nextIndex;
      }
    }
    return [result, index];
  }

  function node(index, indent) {
    const line = lines[index];
    if (line.indent !== indent) {
      fail("node indentation drifted", line.lineNumber);
    }
    return line.content.startsWith("- ")
      ? sequence(index, indent)
      : mapping(index, indent);
  }

  const start = nextMeaningful(0);
  if (start >= lines.length) fail("document is empty");
  const [parsed, end] = node(start, lines[start].indent);
  const trailing = nextMeaningful(end);
  if (trailing < lines.length) {
    fail("unexpected trailing content", lines[trailing].lineNumber);
  }
  return parsed;
}
