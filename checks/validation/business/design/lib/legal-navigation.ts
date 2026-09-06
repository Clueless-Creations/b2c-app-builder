import { readFileSync } from "node:fs";
import path from "node:path";
import { createProcessor } from "@mdx-js/mdx";
import {
  isArrayLiteralExpression,
  isArrowFunction,
  isAwaitExpression,
  isBigIntLiteral,
  isBinaryExpression,
  isBlock,
  isBreakStatement,
  isClassDeclaration,
  isClassLikeDeclaration,
  isClassExpression,
  isConditionalExpression,
  isDefaultClause,
  isExportAssignment,
  isExportDeclaration,
  isFalseLiteral,
  isForInStatement,
  isForOfStatement,
  isForStatement,
  isFunctionDeclaration,
  isFunctionExpression,
  isFunctionLikeDeclaration,
  isIdentifier,
  isIfStatement,
  isJsxAttribute,
  isJsxElement,
  isJsxExpression,
  isJsxFragment,
  isJsxSelfClosingElement,
  isLabeledStatement,
  isMethodDeclaration,
  isNoSubstitutionTemplateLiteral,
  isNamedExports,
  isNullLiteral,
  isNumericLiteral,
  isObjectLiteralExpression,
  isPrefixUnaryExpression,
  isPropertyDeclaration,
  isRegularExpressionLiteral,
  isReturnStatement,
  isSpreadElement,
  isStringLiteral,
  isSwitchStatement,
  isThrowStatement,
  isTrueLiteral,
  isTryStatement,
  isVariableDeclarationList,
  isVariableStatement,
  isVoidExpression,
  skipOuterExpressions,
} from "typescript/unstable/ast/is";
import type { JsxAttributes, Node, SourceFile } from "typescript/unstable/ast";
import { ModifierFlags, NodeFlags } from "typescript/unstable/ast";
import { API as TypeScriptAPI } from "typescript/unstable/sync";

export interface LegalNavigationParseFailure {
  file: string;
  message: string;
}

export interface LegalNavigationAnalysis {
  hasTerms: boolean;
  hasPrivacy: boolean;
  parseFailures: LegalNavigationParseFailure[];
}

interface NavigableTag {
  name: string;
  attributes: Map<string, string>;
}

interface DestinationState {
  terms: boolean;
  privacy: boolean;
}

type TypeScriptScope = Map<string, Node | null>;
type TypeScriptControlFlow = number;

const TYPESCRIPT_FLOW_CONTINUES = 1;
const TYPESCRIPT_FLOW_TERMINATES = 2;
const TYPESCRIPT_FLOW_BREAKS = 4;

interface MdxNode {
  type: string;
  name?: string | null;
  identifier?: string;
  url?: string;
  value?: unknown;
  attributes?: MdxAttribute[];
  children?: MdxNode[];
  data?: { estree?: EstreeNode };
}

interface MdxAttribute {
  type: string;
  name?: string;
  value?: string | { type?: string; value?: string; data?: { estree?: EstreeNode } } | null;
}

interface EstreeNode {
  type: string;
  [key: string]: unknown;
}

const INERT_ELEMENT_NAMES = new Set(["script", "style", "textarea", "title", "template"]);
const VUE_BRANCH_ATTRIBUTE_NAMES = new Set(["v-if", "v-else-if", "v-else"]);
const VOID_HTML_ELEMENT_NAMES = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);
const mdxProcessor = createProcessor({ format: "mdx" });

function isLowercaseInertElement(name: string): boolean {
  return name === name.toLowerCase() && INERT_ELEMENT_NAMES.has(name);
}

export function analyzeLegalNavigation(files: string[], options: { cwd: string }): LegalNavigationAnalysis {
  const uniqueFiles = [...new Set(files)];
  const typeScriptFiles = uniqueFiles.filter((file) => {
    const extension = path.extname(file);
    return extension === ".tsx" || extension === ".jsx";
  });
  const { tagsByFile, failures: typeScriptFailures } = extractTypeScriptNavigableTags(typeScriptFiles, options.cwd);
  const parseFailures = [...typeScriptFailures];
  const state: DestinationState = { terms: false, privacy: false };

  for (const file of uniqueFiles) {
    const extension = path.extname(file);
    if (extension === ".tsx" || extension === ".jsx") {
      addTagDestinations(state, tagsByFile.get(file) ?? []);
      continue;
    }

    let source: string;
    try {
      source = readFileSync(file, "utf8");
    } catch (error) {
      parseFailures.push({ file, message: errorMessage(error) });
      continue;
    }

    try {
      if (extension === ".mdx") {
        addMdxDestinations(state, source);
      } else {
        const template = analyzeTemplateNavigation(source, extension);
        addTagDestinations(state, template.tags);
        state.terms ||= template.destinations.terms;
        state.privacy ||= template.destinations.privacy;
      }
    } catch (error) {
      parseFailures.push({ file, message: errorMessage(error) });
    }
  }

  return { hasTerms: state.terms, hasPrivacy: state.privacy, parseFailures };
}

function errorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.split("\n", 1)[0] || "Unknown parser failure";
}

function addDestination(state: DestinationState, value: string): void {
  const lower = value.toLowerCase();
  if (lower.includes("terms")) state.terms = true;
  if (lower.includes("privacy")) state.privacy = true;
}

function addTagDestinations(state: DestinationState, tags: NavigableTag[]): void {
  for (const tag of tags) {
    const names = tag.name.toLowerCase() === "a" ? ["href", "routerlink"] : isComponentLinkTag(tag.name) ? ["href", "to"] : [];
    for (const name of names) {
      const value = tag.attributes.get(name);
      if (value !== undefined) addDestination(state, value);
    }
  }
}

function isComponentLinkTag(name: string): boolean {
  return name === "Link" || name === "NavLink" || name === "RouterLink" || name === "NuxtLink" || name === "router-link" || name === "nuxt-link";
}

function extractTypeScriptNavigableTags(files: string[], cwd: string): { tagsByFile: Map<string, NavigableTag[]>; failures: LegalNavigationParseFailure[] } {
  const tagsByFile = new Map(files.map((file) => [file, [] as NavigableTag[]]));
  const failures: LegalNavigationParseFailure[] = [];
  if (files.length === 0) return { tagsByFile, failures };

  const api = new TypeScriptAPI({ cwd });
  try {
    const snapshot = api.updateSnapshot({ openFiles: files });
    try {
      for (const file of files) {
        const project = snapshot.getDefaultProjectForFile(file);
        if (!project) {
          failures.push({ file, message: "TypeScript did not return a project for this file" });
          continue;
        }
        const sourceFile = project.program.getSourceFile(file);
        if (!sourceFile) {
          failures.push({ file, message: "TypeScript did not return a source tree for this file" });
          continue;
        }
        const diagnostic = project.program.getSyntacticDiagnostics(file)[0];
        if (diagnostic) {
          failures.push({ file, message: `TypeScript parse error TS${diagnostic.code}: ${diagnostic.text}` });
          continue;
        }
        extractExportedTypeScriptNavigableTags(sourceFile, tagsByFile.get(file)!);
      }
    } finally {
      snapshot.dispose();
    }
  } catch (error) {
    const message = errorMessage(error);
    for (const file of files) failures.push({ file, message });
  } finally {
    api.close();
  }
  return { tagsByFile, failures };
}

function extractExportedTypeScriptNavigableTags(sourceFile: SourceFile, tags: NavigableTag[]): void {
  const rootScope = collectTopLevelTypeScriptDeclarations(sourceFile);

  const visitOutput = (node: Node, resolving = new Set<string>(), scope = rootScope): void => {
    const expression = skipOuterExpressions(node);
    if (isJsxElement(expression)) {
      const name = expression.openingElement.tagName.getText(sourceFile);
      if (isLowercaseInertElement(name)) return;
      const localComponent = visitLocalTypeScriptComponent(expression.openingElement.tagName, resolving, scope);
      if (!localComponent) {
        tags.push({ name, attributes: extractTypeScriptAttributes(expression.openingElement.attributes, sourceFile) });
        for (const child of expression.children) visitOutput(child, resolving, scope);
      }
      return;
    }
    if (isJsxSelfClosingElement(expression)) {
      const name = expression.tagName.getText(sourceFile);
      if (!isLowercaseInertElement(name)) {
        const localComponent = visitLocalTypeScriptComponent(expression.tagName, resolving, scope);
        if (!localComponent) tags.push({ name, attributes: extractTypeScriptAttributes(expression.attributes, sourceFile) });
      }
      return;
    }
    if (isJsxFragment(expression)) {
      for (const child of expression.children) visitOutput(child, resolving, scope);
      return;
    }
    if (isJsxExpression(expression)) {
      if (expression.expression) visitOutput(expression.expression, resolving, scope);
      return;
    }
    if (isConditionalExpression(expression)) {
      const truthiness = staticTypeScriptTruthiness(expression.condition, sourceFile);
      if (truthiness !== false) visitOutput(expression.whenTrue, resolving, scope);
      if (truthiness !== true) visitOutput(expression.whenFalse, resolving, scope);
      return;
    }
    if (isBinaryExpression(expression)) {
      const operator = expression.operatorToken.getText(sourceFile);
      if (operator === "&&") {
        if (staticTypeScriptTruthiness(expression.left, sourceFile) !== false) visitOutput(expression.right, resolving, scope);
        return;
      }
      if (operator === "||") {
        const truthiness = staticTypeScriptTruthiness(expression.left, sourceFile);
        if (truthiness === true) visitOutput(expression.left, resolving, scope);
        else if (truthiness === false) visitOutput(expression.right, resolving, scope);
        else {
          visitOutput(expression.left, resolving, scope);
          visitOutput(expression.right, resolving, scope);
        }
        return;
      }
      if (operator === "??") {
        const nullishness = staticTypeScriptNullishness(expression.left, sourceFile);
        if (nullishness === true) visitOutput(expression.right, resolving, scope);
        else if (nullishness === false) visitOutput(expression.left, resolving, scope);
        else {
          visitOutput(expression.left, resolving, scope);
          visitOutput(expression.right, resolving, scope);
        }
        return;
      }
      if (operator === "," || operator === "=" || operator === "&&=" || operator === "||=" || operator === "??=") {
        visitOutput(expression.right, resolving, scope);
      }
      return;
    }
    if (isArrayLiteralExpression(expression)) {
      for (const element of expression.elements) visitOutput(element, resolving, scope);
      return;
    }
    if (isSpreadElement(expression) || isAwaitExpression(expression)) visitOutput(expression.expression, resolving, scope);
  };

  const visitFunctionBody = (node: Node, resolving = new Set<string>(), scope = rootScope): TypeScriptControlFlow => {
    if (isReturnStatement(node)) {
      if (node.expression) visitOutput(node.expression, resolving, scope);
      return TYPESCRIPT_FLOW_TERMINATES;
    }
    if (isThrowStatement(node)) return TYPESCRIPT_FLOW_TERMINATES;
    if (isBreakStatement(node)) return TYPESCRIPT_FLOW_BREAKS;
    if (isIfStatement(node)) {
      const truthiness = staticTypeScriptTruthiness(node.expression, sourceFile);
      if (truthiness === true) return visitFunctionBody(node.thenStatement, resolving, scope);
      if (truthiness === false) return node.elseStatement ? visitFunctionBody(node.elseStatement, resolving, scope) : TYPESCRIPT_FLOW_CONTINUES;
      const thenFlow = visitFunctionBody(node.thenStatement, resolving, scope);
      const elseFlow = node.elseStatement ? visitFunctionBody(node.elseStatement, resolving, scope) : TYPESCRIPT_FLOW_CONTINUES;
      return thenFlow | elseFlow;
    }
    if (isBlock(node)) {
      const blockScope = extendTypeScriptScope(scope, node.statements);
      let blockFlow = TYPESCRIPT_FLOW_CONTINUES;
      for (const statement of node.statements) {
        if ((blockFlow & TYPESCRIPT_FLOW_CONTINUES) === 0) break;
        const statementFlow = visitFunctionBody(statement, resolving, blockScope);
        blockFlow = (blockFlow & ~TYPESCRIPT_FLOW_CONTINUES) | statementFlow;
      }
      return blockFlow;
    }
    if (isTryStatement(node)) {
      const tryTagStart = tags.length;
      const tryFlow = visitFunctionBody(node.tryBlock, resolving, scope);
      let combinedFlow = tryFlow;
      if (node.catchClause) {
        const catchScope = new Map(scope);
        if (node.catchClause.variableDeclaration) addTypeScriptBinding(catchScope, node.catchClause.variableDeclaration.name, null);
        const catchFlow = visitFunctionBody(node.catchClause.block, resolving, catchScope);
        combinedFlow |= catchFlow;
      }
      const finallyTagStart = tags.length;
      const finallyFlow = node.finallyBlock ? visitFunctionBody(node.finallyBlock, resolving, scope) : TYPESCRIPT_FLOW_CONTINUES;
      if ((finallyFlow & TYPESCRIPT_FLOW_CONTINUES) === 0) {
        const finallyTags = tags.splice(finallyTagStart);
        tags.splice(tryTagStart);
        tags.push(...finallyTags);
      }
      return (finallyFlow & ~TYPESCRIPT_FLOW_CONTINUES) | ((finallyFlow & TYPESCRIPT_FLOW_CONTINUES) === 0 ? 0 : combinedFlow);
    }
    if (isLabeledStatement(node)) {
      const flow = visitFunctionBody(node.statement, resolving, scope);
      return (flow & ~TYPESCRIPT_FLOW_BREAKS) | ((flow & TYPESCRIPT_FLOW_BREAKS) === 0 ? 0 : TYPESCRIPT_FLOW_CONTINUES);
    }
    if (isSwitchStatement(node)) {
      let switchScope = scope;
      for (const clause of node.caseBlock.clauses) switchScope = extendTypeScriptScope(switchScope, clause.statements);
      const clauses = node.caseBlock.clauses;
      const hasDefault = clauses.some((clause) => isDefaultClause(clause));
      let switchFlow = hasDefault ? 0 : TYPESCRIPT_FLOW_CONTINUES;
      for (let start = 0; start < clauses.length; start += 1) {
        let startFlow = TYPESCRIPT_FLOW_CONTINUES;
        for (let index = start; index < clauses.length && (startFlow & TYPESCRIPT_FLOW_CONTINUES) !== 0; index += 1) {
          let clauseFlow = TYPESCRIPT_FLOW_CONTINUES;
          for (const statement of clauses[index]!.statements) {
            if ((clauseFlow & TYPESCRIPT_FLOW_CONTINUES) === 0) break;
            const statementFlow = visitFunctionBody(statement, resolving, switchScope);
            clauseFlow = (clauseFlow & ~TYPESCRIPT_FLOW_CONTINUES) | statementFlow;
          }
          startFlow = (startFlow & ~TYPESCRIPT_FLOW_CONTINUES) | clauseFlow;
        }
        switchFlow |= startFlow;
      }
      return (switchFlow & ~TYPESCRIPT_FLOW_BREAKS) | ((switchFlow & TYPESCRIPT_FLOW_BREAKS) === 0 ? 0 : TYPESCRIPT_FLOW_CONTINUES);
    }
    if (isForStatement(node) || isForInStatement(node) || isForOfStatement(node)) {
      const initializer = node.initializer;
      const loopScope = initializer && isVariableDeclarationList(initializer) ? extendTypeScriptDeclarationListScope(scope, initializer) : scope;
      const bodyFlow = visitFunctionBody(node.statement, resolving, loopScope);
      return TYPESCRIPT_FLOW_CONTINUES | (bodyFlow & TYPESCRIPT_FLOW_TERMINATES);
    }
    if (isFunctionLikeDeclaration(node) || isClassLikeDeclaration(node)) return TYPESCRIPT_FLOW_CONTINUES;
    node.forEachChild((child) => visitFunctionBody(child, resolving, scope));
    return TYPESCRIPT_FLOW_CONTINUES;
  };

  const visitExportedValue = (node: Node, resolving = new Set<string>(), scope = rootScope): void => {
    const expression = skipOuterExpressions(node);
    if (isIdentifier(expression)) {
      if (resolving.has(expression.text)) return;
      if (!scope.has(expression.text)) return;
      const declaration = scope.get(expression.text);
      if (!declaration) return;
      const next = new Set(resolving);
      next.add(expression.text);
      visitExportedValue(declaration, next, scope);
      return;
    }
    if (isFunctionDeclaration(expression)) {
      if (expression.body) visitFunctionBody(expression.body, resolving, extendTypeScriptFunctionScope(scope, expression.parameters, expression.body));
      return;
    }
    if (isArrowFunction(expression) || isFunctionExpression(expression)) {
      if (expression.body) {
        const functionScope = extendTypeScriptFunctionScope(scope, expression.parameters, expression.body);
        if (isBlock(expression.body)) visitFunctionBody(expression.body, resolving, functionScope);
        else visitOutput(expression.body, resolving, functionScope);
      }
      return;
    }
    if (isClassDeclaration(expression) || isClassExpression(expression)) {
      visitClassRender(expression, resolving, scope);
      return;
    }
    visitOutput(expression, resolving, scope);
  };

  function visitClassRender(node: Node, resolving: Set<string>, scope: TypeScriptScope): void {
    if (!isClassDeclaration(node) && !isClassExpression(node)) return;
    for (const member of node.members) {
      if (isMethodDeclaration(member)) {
        if (hasTypeScriptModifier(member, ModifierFlags.Static)) continue;
        if (isIdentifier(member.name) && member.name.text === "render" && member.body) {
          visitFunctionBody(member.body, resolving, extendTypeScriptFunctionScope(scope, member.parameters, member.body));
        }
        continue;
      }
      if (isPropertyDeclaration(member) && isIdentifier(member.name) && member.name.text === "render" && member.initializer) {
        if (hasTypeScriptModifier(member, ModifierFlags.Static)) continue;
        visitExportedValue(member.initializer, resolving, scope);
      }
    }
  }

  function visitLocalTypeScriptComponent(tagName: Node, resolving: Set<string>, scope: TypeScriptScope): boolean {
    if (!isIdentifier(tagName) || !/^[A-Z]/.test(tagName.text)) return false;
    if (!scope.has(tagName.text)) return false;
    const declaration = scope.get(tagName.text);
    if (!declaration) return true;
    if (resolving.has(tagName.text)) return true;
    const next = new Set(resolving);
    next.add(tagName.text);
    visitExportedValue(declaration, next, scope);
    return true;
  }

  for (const statement of sourceFile.statements) {
    if ((isFunctionDeclaration(statement) || isClassDeclaration(statement)) && hasTypeScriptModifier(statement, ModifierFlags.Export)) {
      visitExportedValue(statement);
      continue;
    }
    if (isVariableStatement(statement)) {
      const directlyExported = hasTypeScriptModifier(statement, ModifierFlags.Export);
      for (const declaration of statement.declarationList.declarations) {
        if (!declaration.initializer || !isIdentifier(declaration.name)) continue;
        if (directlyExported) visitExportedValue(declaration.initializer, new Set([declaration.name.text]));
      }
      continue;
    }
    if (isExportAssignment(statement)) {
      visitExportedValue(statement.expression);
      continue;
    }
    if (
      isExportDeclaration(statement) &&
      !statement.isTypeOnly &&
      !statement.moduleSpecifier &&
      statement.exportClause &&
      isNamedExports(statement.exportClause)
    ) {
      for (const specifier of statement.exportClause.elements) {
        if (specifier.isTypeOnly) continue;
        const localName = specifier.propertyName ?? specifier.name;
        if (isIdentifier(localName)) visitExportedValue(localName);
      }
    }
  }
}

function collectTopLevelTypeScriptDeclarations(sourceFile: SourceFile): TypeScriptScope {
  return extendTypeScriptVarScope(extendTypeScriptScope(new Map(), sourceFile.statements), sourceFile);
}

function extendTypeScriptScope(parent: TypeScriptScope, statements: readonly Node[]): TypeScriptScope {
  const scope = new Map(parent);
  for (const statement of statements) {
    if (isFunctionDeclaration(statement) && statement.name) scope.set(statement.name.text, statement);
    if (isClassDeclaration(statement) && statement.name) scope.set(statement.name.text, statement);
    if (!isVariableStatement(statement)) continue;
    addTypeScriptDeclarationList(scope, statement.declarationList);
  }
  return scope;
}

function extendTypeScriptDeclarationListScope(parent: TypeScriptScope, declarationList: Node): TypeScriptScope {
  const scope = new Map(parent);
  addTypeScriptDeclarationList(scope, declarationList);
  return scope;
}

function addTypeScriptDeclarationList(scope: TypeScriptScope, declarationList: Node): void {
  if (!isVariableDeclarationList(declarationList)) return;
  for (const declaration of declarationList.declarations) {
    addTypeScriptBinding(scope, declaration.name, declaration.initializer ?? null);
  }
}

function extendTypeScriptParameterScope(parent: TypeScriptScope, parameters: readonly { name: Node }[]): TypeScriptScope {
  const scope = new Map(parent);
  for (const parameter of parameters) addTypeScriptBinding(scope, parameter.name, null);
  return scope;
}

function extendTypeScriptFunctionScope(parent: TypeScriptScope, parameters: readonly { name: Node }[], body: Node): TypeScriptScope {
  return extendTypeScriptVarScope(extendTypeScriptParameterScope(parent, parameters), body);
}

function extendTypeScriptVarScope(parent: TypeScriptScope, root: Node): TypeScriptScope {
  const scope = new Map(parent);
  const visit = (node: Node): void => {
    if (node !== root && (isFunctionLikeDeclaration(node) || isClassLikeDeclaration(node))) return;
    if (isVariableDeclarationList(node) && (node.flags & NodeFlags.BlockScoped) === 0) {
      addTypeScriptDeclarationList(scope, node);
    }
    node.forEachChild(visit);
  };
  visit(root);
  return scope;
}

function addTypeScriptBinding(scope: TypeScriptScope, name: Node, declaration: Node | null): void {
  if (isIdentifier(name)) {
    scope.set(name.text, declaration);
    return;
  }
  name.forEachChild((element) => {
    const bindingName = (element as Node & { name?: Node }).name;
    if (bindingName) addTypeScriptBinding(scope, bindingName, null);
  });
}

function hasTypeScriptModifier(node: Node, flag: ModifierFlags): boolean {
  return Boolean((((node as Node & { modifierFlags?: number }).modifierFlags ?? 0) & flag) !== 0);
}

function extractTypeScriptAttributes(attributes: JsxAttributes, sourceFile: SourceFile): Map<string, string> {
  const values = new Map<string, string>();
  for (const property of attributes.properties) {
    if (!isJsxAttribute(property) || !property.initializer) continue;
    const name = property.name.getText(sourceFile).toLowerCase();
    if (isStringLiteral(property.initializer)) {
      values.set(name, property.initializer.text);
      continue;
    }
    if (!isJsxExpression(property.initializer) || !property.initializer.expression) continue;
    const expression = skipOuterExpressions(property.initializer.expression);
    if (isStringLiteral(expression) || isNoSubstitutionTemplateLiteral(expression)) values.set(name, expression.text);
  }
  return values;
}

type StaticTypeScriptPrimitive =
  | { kind: "boolean"; value: boolean }
  | { kind: "number"; value: number }
  | { kind: "bigint"; value: bigint }
  | { kind: "string"; value: string }
  | { kind: "null" }
  | { kind: "undefined" };

function staticTypeScriptPrimitive(node: Node, sourceFile: SourceFile): StaticTypeScriptPrimitive | undefined {
  const expression = skipOuterExpressions(node);
  if (isTrueLiteral(expression)) return { kind: "boolean", value: true };
  if (isFalseLiteral(expression)) return { kind: "boolean", value: false };
  if (isNullLiteral(expression)) return { kind: "null" };
  if (isVoidExpression(expression)) return { kind: "undefined" };
  if (isStringLiteral(expression) || isNoSubstitutionTemplateLiteral(expression)) return { kind: "string", value: expression.text };
  if (isNumericLiteral(expression)) {
    const value = Number(expression.text.replaceAll("_", ""));
    return Number.isNaN(value) ? undefined : { kind: "number", value };
  }
  if (isBigIntLiteral(expression)) {
    try {
      return { kind: "bigint", value: BigInt(expression.text.slice(0, -1).replaceAll("_", "")) };
    } catch {
      return undefined;
    }
  }
  if (isPrefixUnaryExpression(expression)) {
    const operator = expression.getText(sourceFile).trimStart()[0];
    if (operator === "!") {
      const truthiness = staticTypeScriptTruthiness(expression.operand, sourceFile);
      return truthiness === undefined ? undefined : { kind: "boolean", value: !truthiness };
    }
    const operand = staticTypeScriptPrimitive(expression.operand, sourceFile);
    if (operator === "+" && operand?.kind === "number") return operand;
    if (operator === "-" && operand?.kind === "number") return { kind: "number", value: -operand.value };
    if (operator === "-" && operand?.kind === "bigint") return { kind: "bigint", value: -operand.value };
  }
  return undefined;
}

function staticTypeScriptTruthiness(node: Node, sourceFile: SourceFile): boolean | undefined {
  const expression = skipOuterExpressions(node);
  const primitive = staticTypeScriptPrimitive(expression, sourceFile);
  if (primitive) {
    if (primitive.kind === "null" || primitive.kind === "undefined") return false;
    return Boolean(primitive.value);
  }
  if (
    isArrayLiteralExpression(expression) ||
    isObjectLiteralExpression(expression) ||
    isRegularExpressionLiteral(expression) ||
    isArrowFunction(expression) ||
    isFunctionExpression(expression) ||
    isClassExpression(expression) ||
    isJsxElement(expression) ||
    isJsxSelfClosingElement(expression) ||
    isJsxFragment(expression)
  ) {
    return true;
  }
  if (isConditionalExpression(expression)) {
    const condition = staticTypeScriptTruthiness(expression.condition, sourceFile);
    if (condition === true) return staticTypeScriptTruthiness(expression.whenTrue, sourceFile);
    if (condition === false) return staticTypeScriptTruthiness(expression.whenFalse, sourceFile);
    const whenTrue = staticTypeScriptTruthiness(expression.whenTrue, sourceFile);
    const whenFalse = staticTypeScriptTruthiness(expression.whenFalse, sourceFile);
    return whenTrue !== undefined && whenTrue === whenFalse ? whenTrue : undefined;
  }
  if (isBinaryExpression(expression)) {
    const operator = expression.operatorToken.getText(sourceFile);
    const comparison = staticTypeScriptComparison(expression, sourceFile);
    if (comparison !== undefined) return comparison;
    const left = staticTypeScriptTruthiness(expression.left, sourceFile);
    const right = staticTypeScriptTruthiness(expression.right, sourceFile);
    if (operator === "&&") {
      if (left === false || right === false) return false;
      return left === true ? right : undefined;
    }
    if (operator === "||") {
      if (left === true || right === true) return true;
      return left === false ? right : undefined;
    }
    if (operator === "??") {
      const nullishness = staticTypeScriptNullishness(expression.left, sourceFile);
      if (nullishness === true) return right;
      if (nullishness === false) return left;
      return left !== undefined && left === right ? left : undefined;
    }
  }
  return undefined;
}

function staticTypeScriptComparison(node: Node, sourceFile: SourceFile): boolean | undefined {
  if (!isBinaryExpression(node)) return undefined;
  const operator = node.operatorToken.getText(sourceFile);
  if (!["===", "!==", "<", "<=", ">", ">="].includes(operator)) return undefined;
  const left = staticTypeScriptPrimitive(node.left, sourceFile);
  const right = staticTypeScriptPrimitive(node.right, sourceFile);
  if (!left || !right) return undefined;

  const same = staticPrimitiveIdentity(left) === staticPrimitiveIdentity(right);
  if (operator === "===") return same;
  if (operator === "!==") return !same;
  if (left.kind === "number" && right.kind === "number") return compareOrderedPrimitives(left.value, right.value, operator);
  if (left.kind === "bigint" && right.kind === "bigint") return compareOrderedPrimitives(left.value, right.value, operator);
  if (left.kind === "string" && right.kind === "string") return compareOrderedPrimitives(left.value, right.value, operator);
  return undefined;
}

function staticPrimitiveIdentity(value: StaticTypeScriptPrimitive): string {
  if (value.kind === "null" || value.kind === "undefined") return value.kind;
  return `${value.kind}:${String(value.value)}`;
}

function compareOrderedPrimitives(left: number | bigint | string, right: number | bigint | string, operator: string): boolean | undefined {
  if (typeof left !== typeof right) return undefined;
  if (operator === "<") return left < right;
  if (operator === "<=") return left <= right;
  if (operator === ">") return left > right;
  if (operator === ">=") return left >= right;
  return undefined;
}

function staticTypeScriptNullishness(node: Node, sourceFile: SourceFile): boolean | undefined {
  const expression = skipOuterExpressions(node);
  if (isNullLiteral(expression) || isVoidExpression(expression)) return true;
  if (
    isTrueLiteral(expression) ||
    isFalseLiteral(expression) ||
    isStringLiteral(expression) ||
    isNoSubstitutionTemplateLiteral(expression) ||
    isNumericLiteral(expression) ||
    isBigIntLiteral(expression) ||
    isArrayLiteralExpression(expression) ||
    isObjectLiteralExpression(expression) ||
    isRegularExpressionLiteral(expression) ||
    isArrowFunction(expression) ||
    isFunctionExpression(expression) ||
    isClassExpression(expression) ||
    isJsxElement(expression) ||
    isJsxSelfClosingElement(expression) ||
    isJsxFragment(expression) ||
    isPrefixUnaryExpression(expression)
  ) {
    return false;
  }
  if (isConditionalExpression(expression)) {
    const condition = staticTypeScriptTruthiness(expression.condition, sourceFile);
    if (condition === true) return staticTypeScriptNullishness(expression.whenTrue, sourceFile);
    if (condition === false) return staticTypeScriptNullishness(expression.whenFalse, sourceFile);
    const whenTrue = staticTypeScriptNullishness(expression.whenTrue, sourceFile);
    const whenFalse = staticTypeScriptNullishness(expression.whenFalse, sourceFile);
    return whenTrue !== undefined && whenTrue === whenFalse ? whenTrue : undefined;
  }
  if (isBinaryExpression(expression) && expression.operatorToken.getText(sourceFile) === "??") {
    const left = staticTypeScriptNullishness(expression.left, sourceFile);
    if (left === true) return staticTypeScriptNullishness(expression.right, sourceFile);
    if (left === false) return false;
    const right = staticTypeScriptNullishness(expression.right, sourceFile);
    return right === false ? false : undefined;
  }
  return undefined;
}

function addMdxDestinations(state: DestinationState, source: string): void {
  const tree = mdxProcessor.parse(source) as unknown as MdxNode;
  const definitions = new Map<string, string>();
  collectMdxDefinitions(tree, definitions);
  visitMdxNode(tree, state, definitions);
}

function collectMdxDefinitions(node: MdxNode, definitions: Map<string, string>): void {
  if (node.type === "mdxjsEsm") return;
  if ((node.type === "mdxJsxFlowElement" || node.type === "mdxJsxTextElement") && isLowercaseInertElement(node.name ?? "")) return;
  if (node.type === "definition" && typeof node.identifier === "string" && typeof node.url === "string") {
    definitions.set(node.identifier.toLowerCase(), node.url);
  }
  for (const child of node.children ?? []) collectMdxDefinitions(child, definitions);
}

function visitMdxNode(node: MdxNode, state: DestinationState, definitions: Map<string, string>): void {
  if (node.type === "mdxjsEsm") return;
  if (node.type === "link" && typeof node.url === "string") addDestination(state, node.url);
  if (node.type === "linkReference" && typeof node.identifier === "string") {
    const url = definitions.get(node.identifier.toLowerCase());
    if (url !== undefined) addDestination(state, url);
  }

  if (node.type === "mdxFlowExpression" || node.type === "mdxTextExpression") {
    if (node.data?.estree) visitEstreeNode(node.data.estree, state);
    return;
  }

  if (node.type === "mdxJsxFlowElement" || node.type === "mdxJsxTextElement") {
    const name = node.name ?? "";
    if (isLowercaseInertElement(name)) return;
    const tag = mdxTag(node);
    if (tag) addTagDestinations(state, [tag]);
  }

  for (const child of node.children ?? []) visitMdxNode(child, state, definitions);
}

function mdxTag(node: MdxNode): NavigableTag | undefined {
  const name = node.name ?? "";
  if (name.toLowerCase() !== "a" && !isComponentLinkTag(name)) return undefined;
  const attributes = new Map<string, string>();
  for (const attribute of node.attributes ?? []) {
    if (attribute.type !== "mdxJsxAttribute" || !attribute.name) continue;
    const attributeName = attribute.name.toLowerCase();
    if (attributeName !== "href" && attributeName !== "to" && attributeName !== "routerlink") continue;
    if (typeof attribute.value === "string") {
      attributes.set(attributeName, attribute.value);
      continue;
    }
    const value = attribute.value?.data?.estree ? staticEstreeProgramValue(attribute.value.data.estree) : undefined;
    if (value !== undefined) attributes.set(attributeName, value);
  }
  return { name, attributes };
}

function visitEstreeNode(node: EstreeNode, state: DestinationState): void {
  if (node.type === "Program") {
    const body = Array.isArray(node.body) ? node.body : [];
    const statement = body.length === 1 && isEstreeNode(body[0]) && body[0].type === "ExpressionStatement" ? body[0] : undefined;
    if (statement) visitEstreeValue(statement.expression, state);
    return;
  }
  if (node.type === "ConditionalExpression") {
    const truthiness = staticEstreeTruthiness(node.test);
    if (truthiness !== false) visitEstreeValue(node.consequent, state);
    if (truthiness !== true) visitEstreeValue(node.alternate, state);
    return;
  }
  if (node.type === "LogicalExpression") {
    const truthiness = staticEstreeTruthiness(node.left);
    if (node.operator === "&&") {
      if (truthiness !== false) visitEstreeValue(node.right, state);
      return;
    }
    if (node.operator === "||") {
      if (truthiness === true) visitEstreeValue(node.left, state);
      else if (truthiness === false) visitEstreeValue(node.right, state);
      else {
        visitEstreeValue(node.left, state);
        visitEstreeValue(node.right, state);
      }
      return;
    }
    if (node.operator === "??") {
      const nullishness = staticEstreeNullishness(node.left);
      if (nullishness === true) visitEstreeValue(node.right, state);
      else if (nullishness === false) visitEstreeValue(node.left, state);
      else {
        visitEstreeValue(node.left, state);
        visitEstreeValue(node.right, state);
      }
      return;
    }
    return;
  }
  if (node.type === "JSXElement") {
    const opening = isEstreeNode(node.openingElement) ? node.openingElement : undefined;
    const name = opening ? estreeJsxName(opening.name) : undefined;
    if (name && isLowercaseInertElement(name)) return;
    if (opening) {
      const tag = estreeJsxTag(opening);
      if (tag) addTagDestinations(state, [tag]);
    }
    visitEstreeValue(node.children, state);
    return;
  }
  if (node.type === "JSXFragment") {
    visitEstreeValue(node.children, state);
    return;
  }
  if (node.type === "JSXExpressionContainer") {
    visitEstreeValue(node.expression, state);
    return;
  }
  if (node.type === "ArrayExpression") {
    visitEstreeValue(node.elements, state);
    return;
  }
  if (node.type === "SpreadElement") {
    visitEstreeValue(node.argument, state);
    return;
  }
  if (node.type === "SequenceExpression") {
    const expressions = Array.isArray(node.expressions) ? node.expressions : [];
    visitEstreeValue(expressions.at(-1), state);
    return;
  }
  if (node.type === "AssignmentExpression") {
    if (node.operator === "=" || node.operator === "&&=" || node.operator === "||=" || node.operator === "??=") {
      visitEstreeValue(node.right, state);
    }
    return;
  }
  if (node.type === "AwaitExpression") {
    visitEstreeValue(node.argument, state);
    return;
  }
}

function visitEstreeValue(value: unknown, state: DestinationState): void {
  if (Array.isArray(value)) {
    for (const item of value) visitEstreeValue(item, state);
  } else if (isEstreeNode(value)) {
    visitEstreeNode(value, state);
  }
}

function isEstreeNode(value: unknown): value is EstreeNode {
  return typeof value === "object" && value !== null && typeof (value as { type?: unknown }).type === "string";
}

function estreeJsxName(value: unknown): string | undefined {
  if (!isEstreeNode(value) || value.type !== "JSXIdentifier" || typeof value.name !== "string") return undefined;
  return value.name;
}

function estreeJsxTag(opening: EstreeNode): NavigableTag | undefined {
  const name = estreeJsxName(opening.name);
  if (!name || (name.toLowerCase() !== "a" && !isComponentLinkTag(name))) return undefined;
  const attributes = new Map<string, string>();
  const entries = Array.isArray(opening.attributes) ? opening.attributes : [];
  for (const entry of entries) {
    if (!isEstreeNode(entry) || entry.type !== "JSXAttribute") continue;
    const attributeName = estreeJsxName(entry.name)?.toLowerCase();
    if (attributeName !== "href" && attributeName !== "to" && attributeName !== "routerlink") continue;
    const value = staticEstreeValue(entry.value);
    if (value !== undefined) attributes.set(attributeName, value);
  }
  return { name, attributes };
}

function staticEstreeProgramValue(program: EstreeNode): string | undefined {
  const expression = estreeProgramExpression(program);
  return expression ? staticEstreeValue(expression) : undefined;
}

function staticEstreeProgramTruthiness(program: EstreeNode): boolean | undefined {
  const expression = estreeProgramExpression(program);
  return expression ? staticEstreeTruthiness(expression) : undefined;
}

function estreeProgramExpression(program: EstreeNode): EstreeNode | undefined {
  const body = Array.isArray(program.body) ? program.body : [];
  const statement = body.length === 1 && isEstreeNode(body[0]) && body[0].type === "ExpressionStatement" ? body[0] : undefined;
  return statement && isEstreeNode(statement.expression) ? statement.expression : undefined;
}

function staticEstreeValue(value: unknown): string | undefined {
  if (!isEstreeNode(value)) return undefined;
  if (value.type === "Literal" && typeof value.value === "string") return value.value;
  if (value.type === "JSXExpressionContainer") return staticEstreeValue(value.expression);
  if (value.type === "TemplateLiteral") return staticEstreeTemplateValue(value);
  return undefined;
}

function staticEstreeTemplateValue(value: EstreeNode): string | undefined {
  if (value.type !== "TemplateLiteral") return undefined;
  const expressions = Array.isArray(value.expressions) ? value.expressions : [];
  const quasis = Array.isArray(value.quasis) ? value.quasis : [];
  if (quasis.length !== expressions.length + 1) return undefined;

  let result = "";
  for (let index = 0; index < quasis.length; index += 1) {
    const quasi = quasis[index];
    if (!isEstreeNode(quasi) || typeof quasi.value !== "object" || quasi.value === null) return undefined;
    const cooked = (quasi.value as { cooked?: unknown }).cooked;
    const raw = (quasi.value as { raw?: unknown }).raw;
    const text = typeof cooked === "string" ? cooked : typeof raw === "string" ? raw : undefined;
    if (text === undefined) return undefined;
    result += text;
    if (index >= expressions.length) continue;
    const primitive = staticEstreePrimitive(expressions[index]);
    if (!primitive) return undefined;
    result += staticPrimitiveTemplateText(primitive);
  }
  return result;
}

function staticPrimitiveTemplateText(value: StaticTypeScriptPrimitive): string {
  if (value.kind === "null" || value.kind === "undefined") return value.kind;
  return String(value.value);
}

function staticEstreePrimitive(value: unknown): StaticTypeScriptPrimitive | undefined {
  if (!isEstreeNode(value)) return undefined;
  if (value.type === "Literal") {
    if (value.value === null) return { kind: "null" };
    if (typeof value.value === "boolean") return { kind: "boolean", value: value.value };
    if (typeof value.value === "number") return { kind: "number", value: value.value };
    if (typeof value.value === "bigint") return { kind: "bigint", value: value.value };
    if (typeof value.value === "string") return { kind: "string", value: value.value };
    return undefined;
  }
  if (value.type === "TemplateLiteral") {
    const literal = staticEstreeValue(value);
    return literal === undefined ? undefined : { kind: "string", value: literal };
  }
  if (value.type === "UnaryExpression") {
    if (value.operator === "void") return { kind: "undefined" };
    if (value.operator === "!") {
      const truthiness = staticEstreeTruthiness(value.argument);
      return truthiness === undefined ? undefined : { kind: "boolean", value: !truthiness };
    }
    const operand = staticEstreePrimitive(value.argument);
    if (value.operator === "+" && operand?.kind === "number") return operand;
    if (value.operator === "-" && operand?.kind === "number") return { kind: "number", value: -operand.value };
    if (value.operator === "-" && operand?.kind === "bigint") return { kind: "bigint", value: -operand.value };
  }
  return undefined;
}

function staticEstreeComparison(value: EstreeNode): boolean | undefined {
  if (value.type !== "BinaryExpression" || typeof value.operator !== "string") return undefined;
  if (!["===", "!==", "<", "<=", ">", ">="].includes(value.operator)) return undefined;
  const left = staticEstreePrimitive(value.left);
  const right = staticEstreePrimitive(value.right);
  if (!left || !right) return undefined;
  const same = staticPrimitiveIdentity(left) === staticPrimitiveIdentity(right);
  if (value.operator === "===") return same;
  if (value.operator === "!==") return !same;
  if (left.kind === "number" && right.kind === "number") return compareOrderedPrimitives(left.value, right.value, value.operator);
  if (left.kind === "bigint" && right.kind === "bigint") return compareOrderedPrimitives(left.value, right.value, value.operator);
  if (left.kind === "string" && right.kind === "string") return compareOrderedPrimitives(left.value, right.value, value.operator);
  return undefined;
}

function isKnownTruthyEstreeObject(value: EstreeNode): boolean {
  if (
    value.type === "ArrayExpression" ||
    value.type === "ObjectExpression" ||
    value.type === "FunctionExpression" ||
    value.type === "ArrowFunctionExpression" ||
    value.type === "ClassExpression" ||
    value.type === "NewExpression" ||
    value.type === "ImportExpression" ||
    isImportMetaExpression(value)
  ) {
    return true;
  }
  return value.type === "Literal" && ((typeof value.value === "object" && value.value !== null) || (typeof value.regex === "object" && value.regex !== null));
}

function isImportMetaExpression(value: EstreeNode): boolean {
  return (
    value.type === "MetaProperty" &&
    isEstreeNode(value.meta) &&
    value.meta.type === "Identifier" &&
    value.meta.name === "import" &&
    isEstreeNode(value.property) &&
    value.property.type === "Identifier" &&
    value.property.name === "meta"
  );
}

function templateLiteralHasGuaranteedText(value: EstreeNode): boolean {
  if (value.type !== "TemplateLiteral") return false;
  const quasis = Array.isArray(value.quasis) ? value.quasis : [];
  return quasis.some((quasi) => {
    if (!isEstreeNode(quasi) || typeof quasi.value !== "object" || quasi.value === null) return false;
    const cooked = (quasi.value as { cooked?: unknown }).cooked;
    const raw = (quasi.value as { raw?: unknown }).raw;
    return (typeof cooked === "string" && cooked.length > 0) || (typeof cooked !== "string" && typeof raw === "string" && raw.length > 0);
  });
}

function staticEstreeTruthiness(value: unknown): boolean | undefined {
  if (!isEstreeNode(value)) return undefined;
  const primitive = staticEstreePrimitive(value);
  if (primitive) {
    if (primitive.kind === "null" || primitive.kind === "undefined") return false;
    return Boolean(primitive.value);
  }
  if (isKnownTruthyEstreeObject(value)) return true;
  if (templateLiteralHasGuaranteedText(value)) return true;
  if (value.type === "JSXElement" || value.type === "JSXFragment") return true;
  if (value.type === "UnaryExpression" && value.operator === "typeof") return true;
  const comparison = staticEstreeComparison(value);
  if (comparison !== undefined) return comparison;
  if (value.type === "AssignmentExpression") {
    if (value.operator === "=") return staticEstreeTruthiness(value.right);
    if (value.operator === "&&=" || value.operator === "||=" || value.operator === "??=") {
      return staticEstreeLogicalTruthiness(value.operator.slice(0, -1), value.left, value.right);
    }
  }
  if (value.type === "AwaitExpression") {
    const primitive = staticEstreePrimitive(value.argument);
    if (primitive) return primitive.kind === "null" || primitive.kind === "undefined" ? false : Boolean(primitive.value);
    if (isEstreeNode(value.argument) && value.argument.type === "ImportExpression") return true;
    return undefined;
  }
  if (value.type === "SequenceExpression") {
    const expressions = Array.isArray(value.expressions) ? value.expressions : [];
    return staticEstreeTruthiness(expressions.at(-1));
  }
  if (value.type === "ConditionalExpression") {
    const test = staticEstreeTruthiness(value.test);
    if (test === true) return staticEstreeTruthiness(value.consequent);
    if (test === false) return staticEstreeTruthiness(value.alternate);
    const consequent = staticEstreeTruthiness(value.consequent);
    const alternate = staticEstreeTruthiness(value.alternate);
    return consequent !== undefined && consequent === alternate ? consequent : undefined;
  }
  if (value.type === "LogicalExpression") {
    if (value.operator === "&&" || value.operator === "||" || value.operator === "??") {
      return staticEstreeLogicalTruthiness(value.operator, value.left, value.right);
    }
  }
  return undefined;
}

function staticEstreeLogicalTruthiness(operator: string, leftValue: unknown, rightValue: unknown): boolean | undefined {
  const left = staticEstreeTruthiness(leftValue);
  const right = staticEstreeTruthiness(rightValue);
  if (operator === "&&") {
    if (left === false || right === false) return false;
    return left === true ? right : undefined;
  }
  if (operator === "||") {
    if (left === true || right === true) return true;
    return left === false ? right : undefined;
  }
  if (operator === "??") {
    const nullishness = staticEstreeNullishness(leftValue);
    if (nullishness === true) return right;
    if (nullishness === false) return left;
    return left !== undefined && left === right ? left : undefined;
  }
  return undefined;
}

function staticEstreeNullishness(value: unknown): boolean | undefined {
  if (!isEstreeNode(value)) return undefined;
  const primitive = staticEstreePrimitive(value);
  if (primitive) return primitive.kind === "null" || primitive.kind === "undefined";
  if (staticEstreeComparison(value) !== undefined) return false;
  if (value.type === "TemplateLiteral" || value.type === "BinaryExpression" || value.type === "UpdateExpression") return false;
  if (value.type === "UnaryExpression") return value.operator === "void";
  if (value.type === "AssignmentExpression") {
    if (value.operator === "=") return staticEstreeNullishness(value.right);
    if (value.operator === "&&=" || value.operator === "||=" || value.operator === "??=") {
      return staticEstreeLogicalNullishness(value.operator.slice(0, -1), value.left, value.right);
    }
  }
  if (value.type === "AwaitExpression") {
    const primitive = staticEstreePrimitive(value.argument);
    if (primitive) return primitive.kind === "null" || primitive.kind === "undefined";
    if (isEstreeNode(value.argument) && value.argument.type === "ImportExpression") return false;
    return undefined;
  }
  if (value.type === "JSXElement" || value.type === "JSXFragment" || isKnownTruthyEstreeObject(value)) {
    return false;
  }
  if (value.type === "SequenceExpression") {
    const expressions = Array.isArray(value.expressions) ? value.expressions : [];
    return staticEstreeNullishness(expressions.at(-1));
  }
  if (value.type === "ConditionalExpression") {
    const test = staticEstreeTruthiness(value.test);
    if (test === true) return staticEstreeNullishness(value.consequent);
    if (test === false) return staticEstreeNullishness(value.alternate);
    const consequent = staticEstreeNullishness(value.consequent);
    const alternate = staticEstreeNullishness(value.alternate);
    return consequent !== undefined && consequent === alternate ? consequent : undefined;
  }
  if (value.type === "LogicalExpression" && (value.operator === "&&" || value.operator === "||" || value.operator === "??")) {
    return staticEstreeLogicalNullishness(value.operator, value.left, value.right);
  }
  return undefined;
}

function staticEstreeLogicalNullishness(operator: string, leftValue: unknown, rightValue: unknown): boolean | undefined {
  const leftTruthiness = staticEstreeTruthiness(leftValue);
  const leftNullishness = staticEstreeNullishness(leftValue);
  const rightNullishness = staticEstreeNullishness(rightValue);
  if (operator === "&&") {
    if (leftTruthiness === true) return rightNullishness;
    if (leftTruthiness === false) return leftNullishness;
    return leftNullishness !== undefined && leftNullishness === rightNullishness ? leftNullishness : undefined;
  }
  if (operator === "||") {
    if (leftTruthiness === true) return leftNullishness;
    if (leftTruthiness === false) return rightNullishness;
    if (rightNullishness === false) return false;
    return leftNullishness !== undefined && leftNullishness === rightNullishness ? leftNullishness : undefined;
  }
  if (operator === "??") {
    if (leftNullishness === true) return rightNullishness;
    if (leftNullishness === false) return false;
    return rightNullishness === false ? false : undefined;
  }
  return undefined;
}

function analyzeTemplateNavigation(source: string, extension: string): { tags: NavigableTag[]; destinations: DestinationState } {
  let rendered = maskTemplateNonRenderedRegions(source, extension);
  const destinations: DestinationState = { terms: false, privacy: false };
  if (extension === ".astro") {
    const expressions = analyzeAstroConditionalExpressions(rendered);
    rendered = expressions.source;
    destinations.terms = expressions.destinations.terms;
    destinations.privacy = expressions.destinations.privacy;
  } else if (extension === ".svelte") {
    rendered = maskSvelteStaticBranches(rendered);
  } else if (extension === ".vue") {
    rendered = maskVueStaticBranches(rendered);
  }
  return { tags: extractTemplateNavigableTags(rendered, extension !== ".html"), destinations };
}

function analyzeAstroConditionalExpressions(source: string): { source: string; destinations: DestinationState } {
  const ranges: Array<[number, number]> = [];
  const destinations: DestinationState = { terms: false, privacy: false };
  let cursor = 0;
  while (cursor < source.length) {
    if (source[cursor] === "<") {
      const closing = parseClosingMarkupTag(source, cursor);
      if (closing) {
        cursor = closing.end;
        continue;
      }
      const opening = parseMarkupTag(source, cursor);
      if (opening) {
        cursor = opening.end;
        continue;
      }
    }
    if (source[cursor] !== "{") {
      cursor += 1;
      continue;
    }
    const end = findBalancedBraceEnd(source, cursor);
    if (end === undefined) {
      cursor += 1;
      continue;
    }
    const expressionSource = source.slice(cursor, end);
    const program = parseMdxExpressionProgram(expressionSource);
    if (program) {
      visitEstreeNode(program, destinations);
      ranges.push([cursor, end]);
    } else if (/<(?:[A-Za-z]|>)/.test(maskJavaScriptLexicalRegionsInExpressions(expressionSource))) {
      throw new Error("Unable to parse an Astro rendered expression that contains markup");
    }
    cursor = end;
  }
  return { source: maskRanges(source, ranges), destinations };
}

function parseMdxExpressionProgram(source: string): EstreeNode | undefined {
  try {
    return findMdxExpressionProgram(mdxProcessor.parse(source) as unknown as MdxNode);
  } catch {
    return undefined;
  }
}

function findMdxExpressionProgram(node: MdxNode): EstreeNode | undefined {
  if ((node.type === "mdxFlowExpression" || node.type === "mdxTextExpression") && node.data?.estree) return node.data.estree;
  for (const child of node.children ?? []) {
    const program = findMdxExpressionProgram(child);
    if (program) return program;
  }
  return undefined;
}

function staticTemplateExpressionTruthiness(source: string): boolean | undefined {
  const program = parseMdxExpressionProgram(`{${source}}`);
  return program ? staticEstreeProgramTruthiness(program) : undefined;
}

type StaticBranchState = "taken" | "not-taken" | "dynamic";
type StaticBranchKind = "if" | "else-if" | "else";

function resolveStaticBranch(
  kind: StaticBranchKind,
  truthiness: boolean | undefined,
  previous: StaticBranchState | undefined,
): { unreachable: boolean; next: StaticBranchState } {
  if (kind === "if") {
    if (truthiness === true) return { unreachable: false, next: "taken" };
    if (truthiness === false) return { unreachable: true, next: "not-taken" };
    return { unreachable: false, next: "dynamic" };
  }
  if (kind === "else") {
    if (previous === "taken") return { unreachable: true, next: "taken" };
    if (previous === "not-taken") return { unreachable: false, next: "taken" };
    return { unreachable: false, next: "dynamic" };
  }
  if (previous === "taken") return { unreachable: true, next: "taken" };
  if (previous === "dynamic") {
    if (truthiness === true) return { unreachable: false, next: "taken" };
    return { unreachable: truthiness === false, next: "dynamic" };
  }
  if (truthiness === true) return { unreachable: false, next: "taken" };
  if (truthiness === false) return { unreachable: true, next: "not-taken" };
  return { unreachable: false, next: "dynamic" };
}

interface VueMaskFrame {
  name: string;
  unreachable: boolean;
  maskStart?: number;
  branchState?: StaticBranchState;
}

function maskVueStaticBranches(source: string): string {
  const searchable = maskJavaScriptLexicalRegionsInExpressions(source);
  const ranges: Array<[number, number]> = [];
  const stack: VueMaskFrame[] = [{ name: "", unreachable: false }];
  let cursor = 0;
  while (cursor < searchable.length) {
    const start = searchable.indexOf("<", cursor);
    if (start < 0) break;
    const closing = parseClosingMarkupTag(source, start);
    if (closing) {
      let matchIndex = -1;
      for (let index = stack.length - 1; index > 0; index -= 1) {
        if (stack[index]!.name.toLowerCase() === closing.name.toLowerCase()) {
          matchIndex = index;
          break;
        }
      }
      if (matchIndex > 0) {
        for (let index = stack.length - 1; index >= matchIndex; index -= 1) {
          const frame = stack.pop()!;
          if (frame.maskStart !== undefined) ranges.push([frame.maskStart, closing.end]);
        }
      }
      cursor = closing.end;
      continue;
    }
    const opening = parseMarkupTag(source, start);
    if (!opening) {
      cursor = start + 1;
      continue;
    }
    const parent = stack.at(-1)!;
    const directive = vueStaticBranchDirective(opening.attributes);
    let ownUnreachable = false;
    if (directive) {
      const decision = resolveStaticBranch(directive.kind, directive.truthiness, parent.branchState);
      ownUnreachable = decision.unreachable;
      parent.branchState = decision.next;
    } else {
      parent.branchState = undefined;
    }
    const unreachable = parent.unreachable || ownUnreachable;
    const maskStart = unreachable && !parent.unreachable ? start : undefined;
    const selfClosing = /\/\s*>$/.test(source.slice(start, opening.end));
    if (selfClosing || VOID_HTML_ELEMENT_NAMES.has(opening.name.toLowerCase())) {
      if (maskStart !== undefined) ranges.push([maskStart, opening.end]);
    } else {
      stack.push({ name: opening.name, unreachable, maskStart });
    }
    cursor = opening.end;
  }
  for (const frame of stack.slice(1)) {
    if (frame.maskStart !== undefined) ranges.push([frame.maskStart, source.length]);
  }
  return maskRanges(source, ranges);
}

function vueStaticBranchDirective(attributes: Map<string, string>): { kind: StaticBranchKind; truthiness?: boolean } | undefined {
  const ifValue = attributes.get("v-if");
  if (ifValue !== undefined) return { kind: "if", truthiness: staticTemplateExpressionTruthiness(ifValue) };
  const elseIfValue = attributes.get("v-else-if");
  if (elseIfValue !== undefined) return { kind: "else-if", truthiness: staticTemplateExpressionTruthiness(elseIfValue) };
  if (attributes.has("v-else")) return { kind: "else" };
  return undefined;
}

interface SvelteMaskFrame {
  kind: "if";
  parentUnreachable: boolean;
  currentUnreachable: boolean;
  branchState: StaticBranchState;
  branchStart: number;
}

interface SvelteStructuralFrame {
  kind: "each" | "await" | "key" | "snippet";
}

function maskSvelteStaticBranches(source: string): string {
  const searchable = maskJavaScriptLexicalRegionsInExpressions(source);
  const ranges: Array<[number, number]> = [];
  const stack: Array<SvelteMaskFrame | SvelteStructuralFrame> = [];
  let cursor = 0;
  while (cursor < searchable.length) {
    const start = searchable.indexOf("{", cursor);
    if (start < 0) break;
    const end = findBalancedBraceEnd(source, start);
    if (end === undefined) break;
    const maskedMarker = searchable.slice(start + 1, end - 1).trim();
    const rawMarker = source.slice(start + 1, end - 1).trim();
    const ifMatch = maskedMarker.match(/^#if\s+/);
    const structuralStart = maskedMarker.match(/^#(each|await|key|snippet)(?:\s|$)/);
    const elseIfMatch = maskedMarker.match(/^:else\s+if\s+/);
    if (ifMatch) {
      const condition = rawMarker.slice(ifMatch[0].length);
      const decision = resolveStaticBranch("if", staticTemplateExpressionTruthiness(condition), undefined);
      const parentUnreachable = stack.some((frame) => frame.kind === "if" && frame.currentUnreachable);
      stack.push({
        kind: "if",
        parentUnreachable,
        currentUnreachable: parentUnreachable || decision.unreachable,
        branchState: decision.next,
        branchStart: end,
      });
    } else if (structuralStart) {
      stack.push({ kind: structuralStart[1] as SvelteStructuralFrame["kind"] });
    } else if (elseIfMatch && stack.at(-1)?.kind === "if") {
      const frame = stack.at(-1)! as SvelteMaskFrame;
      if (frame.currentUnreachable && !frame.parentUnreachable) ranges.push([frame.branchStart, start]);
      const condition = rawMarker.slice(elseIfMatch[0].length);
      const decision = resolveStaticBranch("else-if", staticTemplateExpressionTruthiness(condition), frame.branchState);
      frame.currentUnreachable = frame.parentUnreachable || decision.unreachable;
      frame.branchState = decision.next;
      frame.branchStart = end;
    } else if (/^:else\s*$/.test(maskedMarker) && stack.at(-1)?.kind === "if") {
      const frame = stack.at(-1)! as SvelteMaskFrame;
      if (frame.currentUnreachable && !frame.parentUnreachable) ranges.push([frame.branchStart, start]);
      const decision = resolveStaticBranch("else", undefined, frame.branchState);
      frame.currentUnreachable = frame.parentUnreachable || decision.unreachable;
      frame.branchState = decision.next;
      frame.branchStart = end;
    } else {
      const closing = maskedMarker.match(/^\/(if|each|await|key|snippet)\s*$/);
      if (closing && stack.at(-1)?.kind === closing[1]) {
        const frame = stack.pop()!;
        if (frame.kind === "if" && frame.currentUnreachable && !frame.parentUnreachable) ranges.push([frame.branchStart, start]);
      }
    }
    cursor = end;
  }
  for (const frame of stack) {
    if (frame.kind === "if" && frame.currentUnreachable && !frame.parentUnreachable) ranges.push([frame.branchStart, source.length]);
  }
  return maskRanges(source, ranges);
}

function parseClosingMarkupTag(source: string, start: number): { name: string; end: number } | undefined {
  const match = source.slice(start).match(/^<\/\s*([A-Za-z][A-Za-z0-9:._-]*)\s*>/);
  return match ? { name: match[1]!, end: start + match[0].length } : undefined;
}

function extractTemplateNavigableTags(source: string, expressionAware: boolean): NavigableTag[] {
  const searchable = expressionAware ? maskJavaScriptLexicalRegionsInExpressions(source) : source;
  const tags: NavigableTag[] = [];
  let cursor = 0;
  while (cursor < searchable.length) {
    if (searchable[cursor] !== "<") {
      cursor += 1;
      continue;
    }
    const parsed = parseMarkupTag(source, cursor);
    if (!parsed) {
      cursor += 1;
      continue;
    }
    if (parsed.name.toLowerCase() === "a" || isComponentLinkTag(parsed.name)) tags.push(parsed);
    cursor = parsed.end;
  }
  return tags;
}

function parseMarkupTag(source: string, start: number): (NavigableTag & { end: number }) | undefined {
  let cursor = start + 1;
  if (source[cursor] === "/" || source[cursor] === "!" || source[cursor] === "?") return undefined;
  const nameMatch = source.slice(cursor).match(/^[A-Za-z][A-Za-z0-9:._-]*/);
  if (!nameMatch) return undefined;
  const name = nameMatch[0];
  cursor += name.length;
  const boundary = source[cursor];
  if (boundary !== undefined && !/[\s/>]/.test(boundary)) return undefined;
  const end = findMarkupTagEnd(source, start);
  if (end === undefined) throw new Error(`Malformed opening tag <${name}>: expected a closing > with balanced quotes and expressions`);
  return { name, attributes: parseMarkupAttributes(source, cursor, end - 1), end };
}

function parseMarkupAttributes(source: string, start: number, end: number): Map<string, string> {
  const attributes = new Map<string, string>();
  let cursor = start;
  while (cursor < end) {
    while (cursor < end && /\s/.test(source[cursor] ?? "")) cursor += 1;
    if (source[cursor] === "/") {
      cursor += 1;
      continue;
    }
    const nameMatch = source.slice(cursor, end).match(/^[:@A-Za-z_][:@A-Za-z0-9_.-]*/);
    if (!nameMatch) {
      cursor += 1;
      continue;
    }
    const rawName = nameMatch[0];
    const lowerRawName = rawName.toLowerCase();
    cursor += rawName.length;
    while (cursor < end && /\s/.test(source[cursor] ?? "")) cursor += 1;
    if (source[cursor] !== "=") {
      if (lowerRawName === "v-else") attributes.set(lowerRawName, "");
      continue;
    }
    cursor += 1;
    while (cursor < end && /\s/.test(source[cursor] ?? "")) cursor += 1;

    let rawValue: string;
    const opening = source[cursor];
    if (opening === '"' || opening === "'") {
      const valueEnd = findQuotedEnd(source, cursor, opening);
      if (valueEnd === undefined || valueEnd > end) break;
      rawValue = source.slice(cursor + 1, valueEnd - 1);
      cursor = valueEnd;
    } else if (opening === "{") {
      const valueEnd = findBalancedBraceEnd(source, cursor);
      if (valueEnd === undefined || valueEnd > end) break;
      rawValue = source.slice(cursor, valueEnd);
      cursor = valueEnd;
    } else {
      const valueStart = cursor;
      while (cursor < end && !/[\s>]/.test(source[cursor] ?? "")) cursor += 1;
      rawValue = source.slice(valueStart, cursor).replace(/\/$/, "");
    }

    const normalized = normalizeTemplateAttribute(rawName, rawValue);
    if (normalized) attributes.set(normalized.name, normalized.value);
    if (VUE_BRANCH_ATTRIBUTE_NAMES.has(lowerRawName)) attributes.set(lowerRawName, rawValue);
  }
  return attributes;
}

function normalizeTemplateAttribute(rawName: string, rawValue: string): { name: string; value: string } | undefined {
  const lowerName = rawName.toLowerCase();
  const bound = lowerName.startsWith(":") || lowerName.startsWith("v-bind:");
  const name = lowerName.replace(/^v-bind:/, "").replace(/^:/, "");
  if (name !== "href" && name !== "to" && name !== "routerlink") return undefined;
  if (rawValue.startsWith("{")) {
    const literal = parseJavaScriptLiteral(rawValue.slice(1, -1));
    return literal === undefined ? undefined : { name, value: literal };
  }
  if (bound) {
    const literal = parseJavaScriptLiteral(rawValue);
    return literal === undefined ? undefined : { name, value: literal };
  }
  return { name, value: rawValue };
}

function parseJavaScriptLiteral(source: string): string | undefined {
  const value = source.trim();
  const quote = value[0];
  if ((quote !== '"' && quote !== "'" && quote !== "`") || value[value.length - 1] !== quote) return undefined;
  if (quote === "`" && /(^|[^\\])\$\{/.test(value.slice(1, -1))) return undefined;
  return value.slice(1, -1);
}

function findMarkupTagEnd(source: string, start: number): number | undefined {
  for (let cursor = start + 1; cursor < source.length; cursor += 1) {
    const character = source[cursor];
    if (character === '"' || character === "'") {
      const quoteEnd = findQuotedEnd(source, cursor, character);
      if (quoteEnd === undefined) return undefined;
      cursor = quoteEnd - 1;
    } else if (character === "{") {
      const braceEnd = findBalancedBraceEnd(source, cursor);
      if (braceEnd === undefined) return undefined;
      cursor = braceEnd - 1;
    } else if (character === ">") {
      return cursor + 1;
    }
  }
  return undefined;
}

function findQuotedEnd(source: string, start: number, quote: '"' | "'" | "`"): number | undefined {
  if (quote === "`") return findTemplateLiteralEnd(source, start);
  for (let cursor = start + 1; cursor < source.length; cursor += 1) {
    if (source[cursor] === "\\") cursor += 1;
    else if (source[cursor] === quote) return cursor + 1;
    else if (source[cursor] === "\n" || source[cursor] === "\r") return undefined;
  }
  return undefined;
}

function findTemplateLiteralEnd(source: string, start: number): number | undefined {
  for (let cursor = start + 1; cursor < source.length; cursor += 1) {
    if (source[cursor] === "\\") {
      cursor += 1;
    } else if (source[cursor] === "`") {
      return cursor + 1;
    } else if (source[cursor] === "$" && source[cursor + 1] === "{") {
      const expressionEnd = findBalancedBraceEnd(source, cursor + 1);
      if (expressionEnd === undefined) return undefined;
      cursor = expressionEnd - 1;
    }
  }
  return undefined;
}

function findBalancedBraceEnd(source: string, start: number): number | undefined {
  let depth = 0;
  for (let cursor = start; cursor < source.length; cursor += 1) {
    const character = source[cursor];
    if (character === '"' || character === "'" || character === "`") {
      const quoteEnd = findQuotedEnd(source, cursor, character);
      if (quoteEnd === undefined) return undefined;
      cursor = quoteEnd - 1;
      continue;
    }
    if (source.startsWith("//", cursor)) {
      const newline = source.indexOf("\n", cursor + 2);
      if (newline < 0) return undefined;
      cursor = newline;
      continue;
    }
    if (source.startsWith("/*", cursor)) {
      const commentEnd = source.indexOf("*/", cursor + 2);
      if (commentEnd < 0) return undefined;
      cursor = commentEnd + 1;
      continue;
    }
    if (character === "/" && source[cursor - 1] !== "<" && !isSvelteBlockClosingSlash(source, cursor) && isJavaScriptRegexStart(source, cursor)) {
      const regexEnd = findJavaScriptRegexEnd(source, cursor);
      if (regexEnd === undefined) return undefined;
      cursor = regexEnd - 1;
      continue;
    }
    if (character === "{") depth += 1;
    else if (character === "}") {
      depth -= 1;
      if (depth === 0) return cursor + 1;
    }
  }
  return undefined;
}

function isSvelteBlockClosingSlash(source: string, slash: number): boolean {
  if (source[slash - 1] !== "{") return false;
  return /^(?:if|each|await|key|snippet)\s*}/.test(source.slice(slash + 1));
}

function isJavaScriptRegexStart(source: string, start: number): boolean {
  const prefix = source.slice(Math.max(0, start - 24), start);
  return /(?:^|[=(\[{:;,!?&|+*%^~<>-]|\b(?:return|case|throw))\s*$/.test(prefix);
}

function findJavaScriptRegexEnd(source: string, start: number): number | undefined {
  let inCharacterClass = false;
  for (let cursor = start + 1; cursor < source.length; cursor += 1) {
    const character = source[cursor];
    if (character === "\\") cursor += 1;
    else if (character === "[") inCharacterClass = true;
    else if (character === "]") inCharacterClass = false;
    else if (character === "/" && !inCharacterClass) {
      cursor += 1;
      while (/[A-Za-z]/.test(source[cursor] ?? "")) cursor += 1;
      return cursor;
    } else if (character === "\n" || character === "\r") return undefined;
  }
  return undefined;
}

function maskJavaScriptLexicalRegionsInExpressions(source: string): string {
  const masked = source.split("");
  let braceDepth = 0;
  for (let cursor = 0; cursor < source.length; cursor += 1) {
    const character = source[cursor];
    if (braceDepth === 0) {
      if (character === "{") braceDepth = 1;
      continue;
    }
    if (character === '"' || character === "'" || character === "`") {
      const end = findQuotedEnd(source, cursor, character) ?? source.length;
      maskCharacterRange(masked, cursor, end);
      cursor = end - 1;
      continue;
    }
    if (source.startsWith("//", cursor)) {
      const newline = source.indexOf("\n", cursor + 2);
      const end = newline < 0 ? source.length : newline;
      maskCharacterRange(masked, cursor, end);
      cursor = end - 1;
      continue;
    }
    if (source.startsWith("/*", cursor)) {
      const commentEnd = source.indexOf("*/", cursor + 2);
      const end = commentEnd < 0 ? source.length : commentEnd + 2;
      maskCharacterRange(masked, cursor, end);
      cursor = end - 1;
      continue;
    }
    if (character === "/" && source[cursor - 1] !== "<" && !isSvelteBlockClosingSlash(source, cursor) && isJavaScriptRegexStart(source, cursor)) {
      const end = findJavaScriptRegexEnd(source, cursor) ?? source.length;
      maskCharacterRange(masked, cursor, end);
      cursor = end - 1;
      continue;
    }
    if (character === "{") braceDepth += 1;
    else if (character === "}") braceDepth -= 1;
  }
  return masked.join("");
}

function maskTemplateNonRenderedRegions(source: string, extension: string): string {
  let masked = extension === ".astro" ? maskAstroFrontmatter(source) : source;
  const rawNames = new Set(["script", "style", "textarea", "title"]);
  if (extension === ".html" || extension === ".astro" || extension === ".svelte") rawNames.add("template");
  const expressionAware = extension !== ".html";
  masked = maskRawElementRegions(masked, rawNames, expressionAware, expressionAware);
  const commentSearchSource = expressionAware ? maskJavaScriptLexicalRegionsInExpressions(masked) : masked;
  return maskHtmlCommentsOutsideTags(masked, commentSearchSource);
}

function maskAstroFrontmatter(source: string): string {
  const start = source.charCodeAt(0) === 0xfeff ? 1 : 0;
  const opening = lineAt(source, start);
  if (!/^---[ \t]*$/.test(opening.content)) return source;
  let cursor = opening.next;
  while (cursor < source.length) {
    const line = lineAt(source, cursor);
    if (/^---[ \t]*$/.test(line.content)) return maskRanges(source, [[start, line.next]]);
    cursor = line.next;
  }
  return maskRanges(source, [[start, source.length]]);
}

function maskRawElementRegions(source: string, names: Set<string>, expressionAware: boolean, honorSelfClosing: boolean): string {
  const searchSource = expressionAware ? maskJavaScriptLexicalRegionsInExpressions(source) : source;
  const ranges: Array<[number, number]> = [];
  let cursor = 0;
  while (cursor < searchSource.length) {
    const start = searchSource.indexOf("<", cursor);
    if (start < 0) break;
    if (searchSource.startsWith("<!--", start)) {
      const commentEnd = searchSource.indexOf("-->", start + 4);
      if (commentEnd < 0) break;
      cursor = commentEnd + 3;
      continue;
    }
    const match = searchSource.slice(start).match(/^<\s*([A-Za-z][A-Za-z0-9-]*)\b/);
    if (!match) {
      cursor = start + 1;
      continue;
    }
    const openingEnd = findMarkupTagEnd(searchSource, start);
    if (openingEnd === undefined) break;
    const name = (match[1] ?? "").toLowerCase();
    if (!names.has(name)) {
      cursor = openingEnd;
      continue;
    }
    if (honorSelfClosing && /\/\s*>$/.test(searchSource.slice(start, openingEnd))) {
      ranges.push([start, openingEnd]);
      cursor = openingEnd;
      continue;
    }
    const closing = new RegExp(`<\\/\\s*${name}\\s*>`, "gi");
    closing.lastIndex = openingEnd;
    const closeMatch = closing.exec(searchSource);
    const end = closeMatch ? closing.lastIndex : source.length;
    ranges.push([start, end]);
    cursor = end;
  }
  return maskRanges(source, ranges);
}

function maskHtmlCommentsOutsideTags(source: string, searchSource: string): string {
  const ranges: Array<[number, number]> = [];
  let cursor = 0;
  while (cursor < searchSource.length) {
    const start = searchSource.indexOf("<", cursor);
    if (start < 0) break;
    if (searchSource.startsWith("<!--", start)) {
      const commentEnd = searchSource.indexOf("-->", start + 4);
      const end = commentEnd < 0 ? searchSource.length : commentEnd + 3;
      ranges.push([start, end]);
      cursor = end;
      continue;
    }
    if (/^<\/?\s*[A-Za-z]/.test(searchSource.slice(start))) {
      const tagEnd = findMarkupTagEnd(searchSource, start);
      if (tagEnd === undefined) break;
      cursor = tagEnd;
      continue;
    }
    cursor = start + 1;
  }
  return maskRanges(source, ranges);
}

function lineAt(source: string, start: number): { content: string; next: number } {
  const newline = source.indexOf("\n", start);
  const next = newline < 0 ? source.length : newline + 1;
  let contentEnd = newline < 0 ? source.length : newline;
  if (contentEnd > start && source[contentEnd - 1] === "\r") contentEnd -= 1;
  return { content: source.slice(start, contentEnd), next };
}

function maskRanges(source: string, ranges: Array<[number, number]>): string {
  const masked = source.split("");
  for (const [start, end] of ranges) maskCharacterRange(masked, start, end);
  return masked.join("");
}

function maskCharacterRange(masked: string[], start: number, end: number): void {
  for (let index = start; index < end; index += 1) {
    if (masked[index] !== "\n" && masked[index] !== "\r") masked[index] = " ";
  }
}
