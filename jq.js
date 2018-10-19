// jqjs - jq JSON query language in JavaScript
// Copyright (C) 2018 Michael Homer
/*
* Permission is hereby granted, free of charge, to any person obtaining a copy
* of this software and associated documentation files (the "Software"), to deal
* in the Software without restriction, including without limitation the rights
* to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
* copies of the Software, and to permit persons to whom the Software is
* furnished to do so, subject to the following conditions:
*
* The above copyright notice and this permission notice shall be included in all
* copies or substantial portions of the Software.
*
* THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
* IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
* FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
* AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
* LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
* OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
* SOFTWARE.
*/

const functions = {
    'tostring/0': function*(input) {
        if (typeof input == 'string')
            yield input
        yield prettyPrint(input, '', '', '')
    }
}

function compile(prog) {
    let filter = parse(tokenise(prog).tokens)
    return input => filter.node.apply(input)
}

function compileNode(prog) {
    return parse(tokenise(prog).tokens).node
}

function isAlpha(c) {
    return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z')
}

function isDigit(c) {
    return (c >= '0' && c <= '9')
}

function prettyPrint(val, indent='', step='    ', LF='\n') {
    let SP = step ? ' ' : ''
    if (typeof val == 'undefined')
        return val
    if (val === null) {
        return 'null'
    } else if (val.constructor == Array) {
        let ret = '['
        let first = true
        for (let v of Object.values(val)) {
            ret += (first ? '' : ',') + LF + indent + step +
                prettyPrint(v, indent + step, step, LF)
            first = false
        }
        ret += LF + indent + ']'
        return ret
    } else if (typeof val == 'object') {
        let ret = '{'
        let first = true
        for (let k of Object.keys(val)) {
            ret += (first ? '' : ',') + LF + indent + step +
                '"' + k + '":' +SP+ prettyPrint(val[k], indent + step, step, LF)
            first = false
        }
        ret += LF + indent + '}'
        return ret
    } else if (typeof val == 'string') {
        return '"' + escapeString(val) + '"'
    } else if (typeof val == 'number') {
        return '' + val
    } else if (typeof val == 'boolean') {
        return val ? 'true' : 'false'
    }
}

function escapeString(s) {
    s = s.replace(/\\/g, '\\\\')
    s = s.replace(/"/g, '\\"')
    s = s.replace(/\n/g, '\\n')
    s = s.replace(/[\x00-\x1f]/g,
        x => '\\u00' + x.charCodeAt(0).toString(16).padStart(2, '0'))
    return s
}

// Recursive-descent parser for JQ query language

// Split input program into tokens. Tokens are:
// quote, number, identifier-index, dot-square, dot, left-square,
// right-square, left-paren, right-paren, pipe, comma,
// identifier, colon, left-brace, right-brace
function tokenise(str, startAt=0, parenDepth) {
    let ret = []
    function error(msg) {
        throw msg;
    }
    let i
    toplevel: for (i = startAt; i < str.length; i++) {
        let c = str[i]
        if (c == ' ')
            continue;
        if (c == '"' || c == "'") {
            let st = c
            let tok = ""
            let escaped = false
            let uniEsc
            let cu = 0
            for (i++; i < str.length; i++) {
                if (uniEsc) {
                    uniEsc--
                    cu *= 16
                    cu += Number.parseInt(str[i], 16)
                    if (uniEsc == 0) {
                        tok += String.fromCharCode(cu)
                        cu = 0
                    }
                } else if (escaped) {
                    let q = str[i]
                    if (q == '"' || q == "'") tok += q
                    else if (q == 'n') tok += '\n'
                    else if (q == 't') tok += '\t'
                    else if (q == 'r') tok += '\r'
                    else if (q == 'b') tok += '\b'
                    else if (q == 'f') tok += '\f'
                    else if (q == '/') tok += '/'
                    else if (q == '\\')tok += '\\'
                    else if (q == 'u') uniEsc = 4
                    else if (q == '(') {
                        // Interpolation
                        let r = tokenise(str, i + 1, 0)
                        ret.push({type: 'quote-interp', value: tok})
                        tok = ''
                        ret = ret.concat(r.tokens)
                        i = r.i
                    }
                    else throw "invalid escape " + q
                    escaped = false
                } else if (str[i] == '\\') {
                    escaped = true
                } else if (str[i] == st) {
                    ret.push({type: 'quote', value: tok})
                    continue toplevel
                } else {
                    escaped = false
                    tok += str[i]
                }
            }
            error("unterminated string literal")
        } else if (isDigit(c)) {
            let tok = ''
            while (isDigit(str[i]) || str[i] == '.')
                tok += str[i++]
            ret.push({type: 'number', value: Number.parseFloat(tok)})
                i--
        } else if (c == '.') {
            let d = str[i+1]
            if (isAlpha(d)) {
                i++
                let tok = ''
                while (isAlpha(str[i]) || isDigit(str[i]))
                    tok += str[i++]
                ret.push({type: 'identifier-index', value: tok})
                i--
            } else if (d == '[') {
                i++
                ret.push({type: 'dot-square'})
            } else if (d == '.') {
                i++
                ret.push({type: 'dot-dot'})
            } else {
                ret.push({type: 'dot'})
            }
        } else if (c == '[') {
            ret.push({type: 'left-square'})
        } else if (c == ']') {
            ret.push({type: 'right-square'})
        } else if (c == '(') {
            ret.push({type: 'left-paren'})
            parenDepth++
        } else if (c == ')') {
            ret.push({type: 'right-paren'})
            parenDepth--
            if (parenDepth < 0)
                return {tokens: ret, i}
        } else if (c == '{') {
            ret.push({type: 'left-brace'})
        } else if (c == '}') {
            ret.push({type: 'right-brace'})
        } else if (c == ',') {
            ret.push({type: 'comma'})
        } else if (c == '|') {
            let d = str[i+1]
            if (d == '=') {
                ret.push({type: 'pipe-equals'})
                i++
            } else
                ret.push({type: 'pipe'})
        // Infix operators
        } else if (c == '+' || c == '*' || c == '-' || c == '/' || c == '%') {
            ret.push({type: 'op', op: c})
        } else if (isAlpha(c)) {
            let tok = ''
            while (isAlpha(str[i]) || isDigit(str[i]))
                tok += str[i++]
            ret.push({type: 'identifier', value: tok})
            i--
        } else if (c == ':') {
            ret.push({type: 'colon'})
        }
    }
    return {tokens: ret, i}
}

// Parse a token stream by recursive descent.
//
// Returns {node: {*apply(input)}, i}, where i is the position in the
// token stream and node is one of the filtering nodes defined below.
// Returns at end of stream or when a token of type until is found.
function parse(tokens, startAt=0, until='none') {
    let i = startAt
    let t = tokens[i]
    let ret = []
    let commaAccum = []
    while (t && (until.indexOf(t.type) == -1)) {
        // Simple cases
        if (t.type == 'identifier-index') {
            ret.push(new IdentifierIndex(t.value))
        } else if (t.type == 'number') {
            ret.push(new NumberNode(t.value))
        } else if (t.type == 'quote') {
            ret.push(new StringNode(t.value))
        } else if (t.type == 'dot') {
            ret.push(new IdentityNode())
        } else if (t.type == 'dot-dot') {
            ret.push(new RecursiveDescent())
        // Identifiers are only booleans for now
        } else if (t.type == 'identifier') {
            if (t.value == 'true' || t.value == 'false')
                ret.push(new BooleanNode(t.value == 'true'))
            else {
                // Named function
                let fname = t.value
                let args = []
                if (tokens[i+1] && tokens[i+1].type == 'left-paren') {
                    i++
                    while (tokens[i].type != 'right-paren') {
                        let arg = parse(tokens, i + 1, ['comma', 'right-paren'])
                        args.push(arg.node)
                        i = arg.i
                    }
                }
                ret.push(new FunctionCall(fname + '/' + args.length, args))
            }
        // Recursive square bracket cases
        } else if (t.type == 'dot-square') {
            let r = parseDotSquare(tokens, i)
            ret.push(r.node)
            i = r.i
        } else if (t.type == 'left-square') {
            // Find the body of the brackets first
            let r = parse(tokens, i + 1, ['right-square', 'colon'])
            if (ret.length) {
                let lhs = makeFilterNode(ret)
                ret = []
                if (tokens[r.i].type == 'colon') {
                    // Slice
                    if (r.node.length === 0)
                        r.node = new NumberNode(0)
                    let e = parse(tokens, r.i + 1, ['right-square'])
                    if (e.node.length === 0)
                        e.node = new NumberNode(-1)
                    ret.push(new SliceNode(lhs, r.node, e.node))
                    r = e
                } else if (r.node.length === 0)
                    ret.push(new SpecificValueIterator(lhs))
                else
                    ret.push(new IndexNode(lhs, r.node))
            } else {
                ret.push(new ArrayNode(r.node))
            }
            i = r.i
        // Recursive parenthesis case
        } else if (t.type == 'left-paren') {
            // Find the body of the brackets first
            let r = parse(tokens, i + 1, 'right-paren')
            ret.push(r.node)
            i = r.i
        // Object literal
        } else if (t.type == 'left-brace') {
            let r = parseObject(tokens, i + 1)
            ret.push(r.node)
            i = r.i
        // Comma consumes everything previous and splits in-place
        // (parsing carries on in this method)
        } else if (t.type == 'comma') {
            commaAccum.push(makeFilterNode(ret))
            ret = []
        // Pipe consumes everything previous *including* commas
        // and splits by recursing for the right-hand side.
        } else if (t.type == 'pipe') {
            if (commaAccum.length) {
                // .x,.y | .[1] is the same as (.x,.y) | .[1]
                commaAccum.push(makeFilterNode(ret))
                ret = [new CommaNode(commaAccum)]
                commaAccum = []
            }
            let lhs = makeFilterNode(ret)
            let r = parse(tokens, i + 1, until)
            let rhs = r.node
            i = r.i
            if (tokens[i] && until.indexOf(tokens[i].type) != -1)
                i--
            ret = [new PipeNode(lhs, rhs)]
        // Infix operators
        } else if (t.type == 'op') {
            if (ret.length == 0 && t.op == '-' && tokens[i+1].type == 'number') {
                tokens[i+1].value = -tokens[i+1].value
                t = tokens[++i]
                continue
            }
            let lhs = makeFilterNode(ret)
            let op = t.op
            let stream = [lhs, t]
            let r = parse(tokens, i + 1, ['op', 'comma', 'pipe', 'right-paren',
                'right-brace', 'right-square'])
            i = r.i
            stream.push(r.node)
            while (i < tokens.length && tokens[i].type == 'op') {
                stream.push(tokens[i])
                let r = parse(tokens, i + 1, ['op', 'comma', 'pipe',
                    'right-paren', 'right-brace', 'right-square'])
                i = r.i
                stream.push(r.node)
            }
            ret = [shuntingYard(stream)]
            if (tokens[i]) i--
        // Update-assignment
        } else if (t.type == 'pipe-equals') {
            let lhs = makeFilterNode(ret)
            let r = parse(tokens, i + 1, ['comma', 'pipe', 'right-paren',
                'right-brace', 'right-square'])
            i = r.i
            let rhs = r.node
            ret = [new UpdateAssignment(lhs, rhs)]
        // Interpolated string literal
        } else if (t.type == 'quote-interp') {
            // Always followed by a paren expression afterwards
            let s = new StringNode(t.value)
            let inner = parse(tokens, i + 1, ['right-paren'])
            i = inner.i
            let adds = new AdditionOperator(s, inner.node)
            while (tokens[i].type == 'quote-interp') {
                s = new StringNode(tokens[i].value)
                inner = parse(tokens, i + 1, ['right-paren'])
                i = inner.i
                adds = new AdditionOperator(adds, s)
                adds = new AdditionOperator(adds, inner.node)
            }
            i++ // Final right paren
            // Must be the ending quote now
            adds = new AdditionOperator(adds, new StringNode(tokens[i].value))
            ret.push(adds)
        } else {
            throw 'could not handle token ' + t.type
        }
        t = tokens[++i]
    }
    // If a comma appeared this array is non-empty and contains all
    // previous branches.
    if (commaAccum.length) {
        commaAccum.push(makeFilterNode(ret))
        return {node: new CommaNode(commaAccum), i}
    }
    return {node: makeFilterNode(ret), i}
}

function makeFilterNode(ret) {
    if (ret.length == 1)
        return ret[0]
    return new FilterNode(ret)
}

function parseDotSquare(tokens, startAt=0) {
    let i = startAt
    let ds = tokens[i]
    i++
    if (tokens[i].type == 'right-square')
        return {node: new GenericValueIterator(), i}
    let r = parse(tokens, i, ['right-square', 'colon'])
    if (tokens[r.i].type == 'colon') {
        // Slice
        let fr = r
        if (fr.length === 0)
            fr.node = new NumberNode(0)
        r = parse(tokens, r.i + 1, ['right-square'])
        if (r.length === 0)
            r.node = new NumberNode(-1)
        return {node: new GenericSlice(fr.node, r.node), i: r.i}
    }
    return {node: new GenericIndex(r.node), i: r.i}
}

// Parse an object literal, expecting to start immediately inside the
// left brace and to consume up to and including the right brace.
function parseObject(tokens, startAt=0) {
    let i = startAt
    let fields = []
    while (tokens[i].type != 'right-brace') {
        if (tokens[i].type == 'identifier') {
            // bare name x
            let ident = tokens[i++]
            if (tokens[i].type == 'colon') {
                // with value x: val
                let r = parse(tokens, i + 1, ['comma', 'right-brace'])
                i = r.i
                fields.push({
                    key: new StringNode(ident.value),
                    value: r.node,
                })
                i--
            } else if (tokens[i].type == 'comma') {
                // no value: equivalent to x : .x
                fields.push({
                    key: new StringNode(ident.value),
                    value: new IdentifierIndex(ident.value),
                })
            } else if (tokens[i].type == 'right-brace') {
                // ditto, last field: equivalent to x : .x
                fields.push({
                    key: new StringNode(ident.value),
                    value: new IdentifierIndex(ident.value),
                })
                i--
            }
        } else if (tokens[i].type == 'quote') {
            // quoted-string key: "x" : val
            let ident = tokens[i++]
            if (tokens[i].type == 'colon') {
                let r = parse(tokens, i + 1, ['comma', 'right-brace'])
                i = r.i
                fields.push({
                    key: new StringNode(ident.value),
                    value: r.node,
                })
                i--
            } else {
                throw 'unexpected ' + tokens[i].type + ', expected colon'
            }
        } else if (tokens[i].type == 'left-paren') {
            // computed key: (.x | .y) : val
            let kr = parse(tokens, i + 1, 'right-paren')
            i = kr.i + 1
            if (tokens[i].type == 'colon') {
                let r = parse(tokens, i + 1, ['comma', 'right-brace'])
                i = r.i
                fields.push({
                    key: kr.node,
                    value: r.node,
                })
                i--
            } else {
                throw 'unexpected ' + tokens[i].type + ', expected colon'
            }
        } else {
            throw 'unexpected ' + tokens[i].type + ' in object'
        }
        i++
        // Consume a comma after a field
        if (tokens[i].type == 'comma')
            i++
    }
    return {
        node: new ObjectNode(fields),
        i
    }
}

function shuntingYard(stream) {
    const prec = { '+' : 5, '-' : 5, '*' : 10, '/' : 10, '%' : 10 }
    let output = []
    let operators = []
    for (let x of stream) {
        if (x.type == 'op') {
            while (operators.length && prec[operators[0].op] >= prec[x.op])
                output.push(operators.shift())
            operators.unshift(x)
        } else {
            output.push(x)
        }
    }
    for (let o of operators)
        output.push(o)
    let constructors = {
        '+': AdditionOperator,
        '*': MultiplicationOperator,
        '-': SubtractionOperator,
        '/': DivisionOperator,
        '%': ModuloOperator
    }
    let stack = []
    for (let o of output) {
        if (o.type == 'op') {
            let r = stack.pop()
            let l = stack.pop()
            stack.push(new constructors[o.op](l, r))
        } else {
            stack.push(o)
        }
    }
    return stack[0]
}

// Convert a value to a consistent type name, addressing the issue
// that arrays are objects.
function nameType(o) {
    if (o === null) return 'null'
    if (typeof o == 'number') return 'number'
    if (typeof o == 'string') return 'string'
    if (typeof o == 'boolean') return 'boolean'
    if (o.constructor == Array) return 'array'
    if (typeof o == 'object') return 'object'
}

// Parse node classes follow. Parse nodes are:
//   FilterNode, generic juxtaposition combination
//   IndexNode, lhs[rhs]
//   SliceNode, lhs[from:to]
//   GenericIndex, .[index]
//   IdentifierIndex .index (delegates to GenericIndex("index"))
//   GenericSlice, .[from:to]
//   IdentityNode, .
//   ValueNode, parent of string/number/boolean
//   StringNode, "abc"
//   NumberNode, 123.45
//   BooleanNode, true/false
//   SpecificValueIterator, lhs[] (yields values from lhs)
//   GenericValueIterator, .[] (yields values from input)
//   CommaNode, .x, .y, .z
//   ArrayNode, [...]
//   PipeNode, a | b | c
//   ObjectNode { x : y, z, "a b" : 12, (.x.y) : .z }
//   RecursiveDescent, ..
//   OperatorNode, a binary infix operator
//   AdditionOperator, a + b
//   MultiplicationOperator, a * b
//   SubtractionOperator, a - b
//   DivisionOperator, a / b
//   ModuloOperator, a % b
//   UpdateAssignment, .x.y |= .z
//   FunctionCall, fname(arg1, arg2)
class ParseNode {}
class FilterNode extends ParseNode {
    constructor(nodes) {
        super()
        this.length = nodes.length
        let p = nodes.pop()
        if (p) {
            this.filter = p
            this.source = nodes.length == 1 ? nodes[0] : new FilterNode(nodes)
        }
    }
    * apply(input) {
        if (!this.filter)
            return
        for (let v of this.source.apply(input)) {
            yield* this.filter.apply(v)
        }
    }
    * paths(input) {
        if (!this.filter) {
            return []
        }
        for (let v of this.source.paths(input)) {
            for (let w of this.filter.paths(input)) {
                yield v.concat(w)
            }
        }
    }
}
class IndexNode extends ParseNode {
    constructor(lhs, index) {
        super()
        this.lhs = lhs
        this.index = index
    }
    * apply(input) {
        for (let l of this.lhs.apply(input))
            for (let i of this.index.apply(input)) {
                if (typeof i == 'number' && i < 0 && nameType(l) == 'array')
                    yield l[l.length + i]
                else
                    yield l[i]
            }
    }
    * paths(input) {
        for (let l of this.lhs.paths(input))
            for (let a of this.index.apply(input))
                yield l.concat([a])
    }
}
class SliceNode extends ParseNode {
    constructor(lhs, from, to) {
        super()
        this.lhs = lhs
        this.from = from
        this.to = to
    }
    * apply(input) {
        for (let l of this.lhs.apply(input))
            for (let s of this.from.apply(input)) {
                if (s < 0) s += l.length
                for (let e of this.to.apply(input)) {
                    if (e < 0) e += l.length
                    yield l.slice(s, e)
                }
            }
    }
    * paths(input) {
        for (let l of this.lhs.paths(input))
            for (let a of this.from.apply(input))
                for (let b of this.to.apply(input))
                    yield l.concat([{start:a, end:b}])
    }
}
class GenericIndex extends ParseNode {
    constructor(innerNode) {
        super()
        this.index = innerNode
    }
    * apply(input) {
        for (let i of this.index.apply(input))
            if (typeof i == 'number' && i < 0 && nameType(input) == 'array')
                yield input[input.length + i]
            else
                yield input[i]
    }
    * paths(input) {
        for (let a of this.index.apply(input))
            yield [a]
    }
}
class IdentifierIndex extends GenericIndex {
    constructor(v) {
        super(new StringNode(v))
    }
}
class GenericSlice extends ParseNode {
    constructor(fr, to) {
        super()
        this.from = fr
        this.to = to
    }
    * apply(input) {
        for (let l of this.from.apply(input)) {
            if (l < 0) l += input.length
            for (let r of this.to.apply(input)) {
                if (r < 0)
                    r += input.length
                yield input.slice(l, r)
            }
        }
    }
    * paths(input) {
        for (let l of this.from.apply(input))
            for (let r of this.to.apply(input))
                yield [{start: l, end: r}]
    }
}
class IdentityNode extends ParseNode {
    constructor() {
        super()
    }
    * apply(input) {
        yield input
    }
    * paths(input) {
        yield []
    }
}
class ValueNode extends ParseNode {
    constructor(v) {
        super()
        this.value = v
    }
    * apply() {
        yield this.value
    }
    * paths(input) {
        yield this.value
    }
}
class StringNode extends ValueNode {
    constructor(v) {
        super(v)
    }
}
class NumberNode extends ValueNode {
    constructor(v) {
        super(v)
    }
}
class BooleanNode extends ValueNode {
    constructor(v) {
        super(v)
    }
}
class SpecificValueIterator extends ParseNode {
    constructor(source) {
        super()
        this.source = source
    }
    * apply(input) {
        for (let o of this.source.apply(input))
            yield* Object.values(o)
    }
    * paths(input) {
        for (let [p, v] of this.zip(this.source.paths(input),
                this.source.apply(input))) {
                if (nameType(v) == 'array')
                    for (let i = 0; i < v.length; i++)
                        yield p.concat([i])
                else
                    for (let i of Object.keys(v)) {
                        yield p.concat([i])
                    }
        }
    }
    * zip(a, b) {
        let aa = a[Symbol.iterator]()
        let bb = b[Symbol.iterator]()
        let v1 = aa.next()
        let v2 = bb.next()
        while (!v1.done && !v2.done) {
            yield [v1.value, v2.value]
            v1 = aa.next()
            v2 = bb.next()
        }
    }
}
class GenericValueIterator extends ParseNode {
    constructor() {
        super()
    }
    * apply(input) {
        yield* input
    }
    * paths(input) {
        if (nameType(input) == 'array')
            for (let i = 0; i < input.length; i++)
                yield [i]
        else
            for (let o of Object.keys(input))
                yield [o]
    }
}
class CommaNode extends ParseNode {
    constructor(branches) {
        super()
        this.branches = branches
    }
    * apply(input) {
        for (let b of this.branches)
            yield* b.apply(input)
    }
    * paths(input) {
        for (let b of this.branches)
            yield* b.paths(input)
    }
}
class ArrayNode extends ParseNode {
    constructor(body) {
        super()
        this.body = body
    }
    * apply(input) {
        yield Array.from(this.body.apply(input))
    }
}
class PipeNode extends ParseNode {
    constructor(lhs, rhs) {
        super()
        this.lhs = lhs
        this.rhs = rhs
    }
    * apply(input) {
        for (let v of this.lhs.apply(input))
            for (let q of this.rhs.apply(v))
                yield q
    }
    * paths(input) {
        for (let [p, v] of this.zip(this.lhs.paths(input),
                this.lhs.apply(input))) {
            for (let p2 of this.rhs.paths(v)) {
                yield p.concat(p2)
            }
        }
    }
    * zip(a, b) {
        let aa = a[Symbol.iterator]()
        let bb = b[Symbol.iterator]()
        let v1 = aa.next()
        let v2 = bb.next()
        while (!v1.done && !v2.done) {
            yield [v1.value, v2.value]
            v1 = aa.next()
            v2 = bb.next()
        }
    }
}
class ObjectNode extends ParseNode {
    constructor(fields) {
        super()
        this.fields = fields
    }
    * apply(input) {
        let obj = {}
        for (let {key, value} of this.fields) {
            for (let k of key.apply(input))
                for (let v of value.apply(input))
                    obj[k] = v
        }
        yield obj
    }
}
class RecursiveDescent extends ParseNode {
    constructor() {
        super()
    }
    * apply(input) {
        yield* this.recurse(input)
    }
    * recurse(s) {
        yield s
        let t = nameType(s)
        if (t == 'array' || t == 'object')
            for (let v of Object.values(s))
                yield* this.recurse(v)
    }
    * paths(input) {
        yield* this.recursePaths(input, [])
    }
    * recursePaths(s, prefix) {
        yield prefix
        let t = nameType(s)
        if (t == 'array')
            for (let i = 0; i < s.length; i++)
                yield* this.recursePaths(s[i], prefix.concat([i]))
        else if (t == 'object')
            for (let [k,v] of Object.entries(s))
                yield* this.recursePaths(v, prefix.concat([k]))
    }
}
class OperatorNode extends ParseNode {
    constructor(l, r) {
        super()
        this.l = l
        this.r = r
    }
    * apply(input) {
        for (let rr of this.r.apply(input))
            for (let ll of this.l.apply(input))
                yield this.combine(ll, rr, nameType(ll), nameType(rr))
    }
}
class AdditionOperator extends OperatorNode {
    constructor(l, r) {
        super(l, r)
    }
    combine(l, r, lt, rt) {
        if (lt == 'number' && rt == 'number')
            return l + r
        if (l === null)
            return r
        if (r === null)
            return l
        if (lt == 'string' && rt == 'string')
            return l + r
        if (lt == 'array' && rt == 'array')
            return l.concat(r)
        if (lt == 'object' && rt == 'object')
            return Object.assign(Object.assign({}, l), r)
        throw 'type mismatch in +:' + lt + ' and ' + rt + ' cannot be added'
    }
}
class MultiplicationOperator extends OperatorNode {
    constructor(l, r) {
        super(l, r)
    }
    combine(l, r, lt, rt) {
        if (lt == 'number' && rt == 'number')
            return l * r
        if (lt == 'number' && rt == 'string')
            return this.repeat(r, l)
        if (lt == 'string' && rt == 'number')
            return this.repeat(l, r)
        if (lt == 'object' && rt == 'object')
            return this.merge(Object.assign({}, l), r)
        throw 'type mismatch in *:' + lt + ' and ' + rt + ' cannot be multiplied'
    }
    repeat(s, n) {
        if (n == 0)
            return null;
        let r = []
        for (let i = 0; i < n; i++)
            r.push(s)
        return r.join('')
    }
    merge(l, r) {
        for (let k of Object.keys(r)) {
            if (!l.hasOwnProperty(k))
                l[k] = r[k]
            else if (nameType(l[k]) != 'object' || nameType(r[k]) != 'object')
                l[k] = r[k]
            else
                this.merge(l[k], r[k])
        }
        return l
    }
}
class SubtractionOperator extends OperatorNode {
    constructor(l, r) {
        super(l, r)
    }
    combine(l, r, lt, rt) {
        if (lt == 'number' && rt == 'number')
            return l - r
        if (l == null || r == null)
            throw 'type mismatch in -'
        if (lt == 'array' && rt == 'array')
            return l.filter(x => r.indexOf(x) == -1)
        throw 'type mismatch in -:' + lt + ' and ' + rt + ' cannot be subtracted'
    }
}
class DivisionOperator extends OperatorNode {
    constructor(l, r) {
        super(l, r)
    }
    combine(l, r, lt, rt) {
        if (lt == 'number' && rt == 'number')
            return l / r
        if (lt == 'string' && rt == 'string')
            return l.split(r)
        throw 'type mismatch in -:' + lt + ' and ' + rt + ' cannot be divided'
    }
}
class ModuloOperator extends OperatorNode {
    constructor(l, r) {
        super(l, r)
    }
    combine(l, r, lt, rt) {
        if (lt == 'number' && rt == 'number')
            return l % r
        throw 'type mismatch in -:' + lt + ' and ' + rt + ' cannot be divided (remainder)'
    }
}
class UpdateAssignment extends ParseNode {
    constructor(l, r) {
        super()
        this.l = l
        this.r = r
    }
    * apply(input) {
        input = JSON.parse(JSON.stringify(input))
        for (let p of this.l.paths(input)) {
            let it = this.r.apply(this.get(input, p)).next()
            if (it.done)
                input = this.update(input, p, null, true)
            else
                input = this.update(input, p, it.value)
        }
        yield input
    }
    // Pluck the value at a path out of an object
    get(obj, p) {
        let o = obj
        for (let i of p)
            o = o[i]
        return o
    }
    // Set the value at path p to v in obj,
    // or delete the key if del is true.
    update(obj, p, v, del=false) {
        let o = obj
        let last = p.pop()
        for (let i of p)
            o = o[i]
        o[last] = v
        if (del)
            delete o[last]
        return obj
    }
}
class FunctionCall extends ParseNode {
    constructor(fname, args) {
        super()
        this.name = fname
        this.args = args
    }
    apply(input) {
        let func = functions[this.name]
        if (!func)
            throw 'no such function ' + this.name
        let argStack = []
        return func(input, this.args)
    }
}

const jq = {compile, prettyPrint}
// Delete these two lines for a non-module version (CORS-safe)
export { compile, prettyPrint, compileNode }
export default jq
