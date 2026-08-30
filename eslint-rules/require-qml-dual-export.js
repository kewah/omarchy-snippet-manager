"use strict"

function isTypeofModule(node) {
  return (
    node.type === "UnaryExpression" &&
    node.operator === "typeof" &&
    node.argument.type === "Identifier" &&
    node.argument.name === "module"
  )
}

function isUndefinedLiteral(node) {
  return node.type === "Literal" && node.value === "undefined"
}

function isModuleDefinedGuard(node) {
  if (node.type !== "BinaryExpression") return false
  if (node.operator !== "!==" && node.operator !== "!=") return false
  return (
    (isTypeofModule(node.left) && isUndefinedLiteral(node.right)) ||
    (isTypeofModule(node.right) && isUndefinedLiteral(node.left))
  )
}

function isModuleExports(node) {
  return (
    node.type === "MemberExpression" &&
    !node.computed &&
    node.object.type === "Identifier" &&
    node.object.name === "module" &&
    node.property.type === "Identifier" &&
    node.property.name === "exports"
  )
}

function propertyName(property) {
  if (property.type !== "Property" || property.kind !== "init" || property.computed) {
    return null
  }
  if (property.key.type === "Identifier") return property.key.name
  if (property.key.type === "Literal" && typeof property.key.value === "string") {
    return property.key.value
  }
  return null
}

function isNamedExportsObject(node) {
  if (node.type !== "ObjectExpression" || node.properties.length === 0) {
    return false
  }
  let named = 0
  for (let i = 0; i < node.properties.length; i++) {
    const name = propertyName(node.properties[i])
    if (!name) return false
    if (name !== "default") named += 1
  }
  return named > 0
}

function consequentStatements(consequent) {
  return consequent.type === "BlockStatement" ? consequent.body : [consequent]
}

function hasNamedModuleExports(consequent) {
  const statements = consequentStatements(consequent)
  for (let i = 0; i < statements.length; i++) {
    const statement = statements[i]
    if (statement.type !== "ExpressionStatement") continue
    const expression = statement.expression
    if (expression.type !== "AssignmentExpression" || expression.operator !== "=") {
      continue
    }
    if (isModuleExports(expression.left) && isNamedExportsObject(expression.right)) {
      return true
    }
  }
  return false
}

module.exports = {
  meta: {
    type: "problem",
    docs: {
      description:
        'require lib/*.js to assign named module.exports inside if (typeof module !== "undefined")',
    },
    schema: [],
    messages: {
      missing:
        'lib/*.js must assign named module.exports inside if (typeof module !== "undefined")',
    },
  },
  create(context) {
    let found = false
    return {
      IfStatement(node) {
        if (isModuleDefinedGuard(node.test) && hasNamedModuleExports(node.consequent)) {
          found = true
        }
      },
      "Program:exit"(node) {
        if (!found) {
          context.report({ node: node, messageId: "missing" })
        }
      },
    }
  },
}
