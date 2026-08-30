"use strict"

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

function objectProperty(object, name) {
  if (!object || object.type !== "ObjectExpression") return null
  for (let i = 0; i < object.properties.length; i++) {
    const property = object.properties[i]
    if (propertyName(property) === name) return property.value
  }
  return null
}

function booleanLiteral(node) {
  if (!node || node.type !== "Literal") return null
  if (node.value === true) return true
  if (node.value === false) return false
  return null
}

function isResultObject(node) {
  const ok = booleanLiteral(objectProperty(node, "ok"))
  if (ok === true) return Boolean(objectProperty(node, "value"))
  if (ok !== false) return false
  const error = objectProperty(node, "error")
  return Boolean(objectProperty(error, "code") && objectProperty(error, "message"))
}

function exportedFunctionNames(assignments) {
  const names = []
  const seen = {}
  for (let i = 0; i < assignments.length; i++) {
    const right = assignments[i]
    if (right.type !== "ObjectExpression") continue
    for (let j = 0; j < right.properties.length; j++) {
      const property = right.properties[j]
      const name = propertyName(property)
      if (!name || !property.value || property.value.type !== "Identifier") {
        continue
      }
      if (property.value.name !== name) continue
      if (seen[name]) continue
      seen[name] = true
      names.push(name)
    }
  }
  return names
}

module.exports = {
  meta: {
    type: "problem",
    docs: {
      description:
        "require listed catalog/transfer/install APIs to return { ok, value } or { ok, error }",
    },
    schema: [
      {
        type: "object",
        properties: {
          functions: {
            type: "array",
            items: { type: "string" },
            minItems: 1,
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      notResult:
        "{{name}}() must return { ok: true, value } or { ok: false, error: { code, message } }",
      missingFunction: "expected Result API function {{name}}",
    },
  },
  create(context) {
    const configured = context.options[0] && context.options[0].functions
    const functionStack = []
    const functions = new Map()
    const exportAssignments = []

    function currentRecord() {
      if (functionStack.length === 0) return null
      return functionStack[functionStack.length - 1]
    }

    function classifyExpr(node, record, yes, no, seenIds) {
      if (!node) return "no"
      if (node.type === "ObjectExpression") {
        return isResultObject(node) ? "yes" : "no"
      }
      if (node.type === "CallExpression" && node.callee.type === "Identifier") {
        const callee = functions.get(node.callee.name)
        if (!callee) return "no"
        if (yes.has(callee.node)) return "yes"
        if (no.has(callee.node)) return "no"
        return "pending"
      }
      if (node.type === "Identifier") {
        const inits = record.bindings[node.name]
        if (!inits || inits.length === 0) return "no"
        if (seenIds.has(node.name)) return "pending"
        seenIds.add(node.name)
        let pending = false
        for (let i = 0; i < inits.length; i++) {
          const status = classifyExpr(inits[i], record, yes, no, seenIds)
          if (status === "no") return "no"
          if (status === "pending") pending = true
        }
        return pending ? "pending" : "yes"
      }
      return "no"
    }

    function classifyFunctions() {
      const yes = new Set()
      const no = new Set()
      let changed = true
      while (changed) {
        changed = false
        functions.forEach(function (record) {
          if (yes.has(record.node) || no.has(record.node)) return
          if (record.returns.length === 0) {
            no.add(record.node)
            changed = true
            return
          }
          let pending = false
          for (let i = 0; i < record.returns.length; i++) {
            const status = classifyExpr(record.returns[i].argument, record, yes, no, new Set())
            if (status === "no") {
              no.add(record.node)
              changed = true
              return
            }
            if (status === "pending") pending = true
          }
          if (!pending) {
            yes.add(record.node)
            changed = true
          }
        })
      }
      return yes
    }

    return {
      FunctionDeclaration(node) {
        const record = {
          node: node,
          returns: [],
          bindings: {},
        }
        functions.set(node.id.name, record)
        functionStack.push(record)
      },
      "FunctionDeclaration:exit"() {
        functionStack.pop()
      },
      FunctionExpression() {
        functionStack.push(null)
      },
      "FunctionExpression:exit"() {
        functionStack.pop()
      },
      ReturnStatement(node) {
        const record = currentRecord()
        if (record) record.returns.push(node)
      },
      VariableDeclarator(node) {
        const record = currentRecord()
        if (!record || node.id.type !== "Identifier") return
        const name = node.id.name
        if (!record.bindings[name]) record.bindings[name] = []
        record.bindings[name].push(node.init)
      },
      AssignmentExpression(node) {
        if (isModuleExports(node.left) && node.operator === "=") {
          exportAssignments.push(node.right)
        }
        const record = currentRecord()
        if (!record || node.left.type !== "Identifier") return
        const name = node.left.name
        if (!record.bindings[name]) record.bindings[name] = []
        record.bindings[name].push(node.right)
      },
      "Program:exit"() {
        const yes = classifyFunctions()
        const exported = exportedFunctionNames(exportAssignments)
        const targets = configured || exported
        const seen = {}

        for (let i = 0; i < targets.length; i++) {
          const name = targets[i]
          if (seen[name]) continue
          seen[name] = true
          const record = functions.get(name)
          if (!record) {
            if (configured) {
              context.report({
                node: context.sourceCode.ast,
                messageId: "missingFunction",
                data: { name: name },
              })
            }
            continue
          }
          for (let j = 0; j < record.returns.length; j++) {
            const status = classifyExpr(
              record.returns[j].argument,
              record,
              yes,
              new Set(),
              new Set()
            )
            if (status !== "yes") {
              context.report({
                node: record.returns[j],
                messageId: "notResult",
                data: { name: name },
              })
            }
          }
          if (record.returns.length === 0) {
            context.report({
              node: record.node,
              messageId: "notResult",
              data: { name: name },
            })
          }
        }
      },
    }
  },
}
