
function isAlpha(c) {
    return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z')
}

function isDigit(c) {
    return (c >= '0' && c <= '9')
}

function prettyPrint(val, indent='') {
    if (val.constructor == Array) {
        let ret = '['
        let first = true
        for (let v of Object.values(val)) {
            ret += (first ? '' : ',') + '\n' + indent + '    ' +
                prettyPrint(v, indent + '    ')
            first = false
        }
        ret += '\n' + indent + ']'
        return ret
    } else if (typeof val == 'object') {
        let ret = '{'
        let first = true
        for (let k of Object.keys(val)) {
            ret += (first ? '' : ',') + '\n' + indent + '    ' +
                '"' + k + '": ' + prettyPrint(val[k], indent + '    ')
            first = false
        }
        ret += '\n' + indent + '}'
        return ret
    } else if (typeof val == 'string') {
        return '"' + val + '"'
    } else if (typeof val == 'number') {
        return '' + val
    } else if (typeof val == 'boolean') {
        return val ? 'true' : 'false'
    }
}

// Recursive-descent parser for JQ query language

// Split input program into tokens. Tokens are:
// quote, number, identifier-index, dot-square, dot, left-square,
// right-square, left-paren, right-paren, pipe, comma,
// identifier, colon
function tokenise(str, startAt=0) {
    let ret = []
    function error(msg) {
        throw msg;
    }
    toplevel: for (let i = startAt; i < str.length; i++) {
        let c = str[i]
        if (c == ' ')
            continue;
        if (c == '"' || c == "'") {
            let st = c
            let tok = ""
            for (i++; i < str.length; i++) {
                if (str[i] == st) {
                    ret.push({type: 'quote', value: tok})
                    continue toplevel
                }
                tok += str[i]
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
            } else {
                ret.push({type: 'dot'})
            }
        } else if (c == '[') {
            ret.push({type: 'left-square'})
        } else if (c == ']') {
            ret.push({type: 'right-square'})
        } else if (c == '(') {
            ret.push({type: 'left-paren'})
        } else if (c == ')') {
            ret.push({type: 'right-paren'})
        } else if (c == ',') {
            ret.push({type: 'comma'})
        } else if (c == '|') {
            ret.push({type: 'pipe'})
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
    return ret
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
    while (t && t.type != until) {
        // Simple cases
        if (t.type == 'identifier-index') {
            ret.push(new IdentifierIndex(t.value))
        } else if (t.type == 'number') {
            ret.push(new NumberNode(t.value))
        } else if (t.type == 'quote') {
            ret.push(new StringNode(t.value))
        } else if (t.type == 'dot') {
            ret.push(new IdentityNode())
        // Identifiers are only booleans for now
        } else if (t.type == 'identifier') {
            if (t.value == 'true' || t.value == 'false')
                ret.push(new BooleanNode(t.value == 'true'))
            else
                throw 'functions not currently supported'
        // Recursive square bracket cases
        } else if (t.type == 'dot-square') {
            let r = parseDotSquare(tokens, i)
            ret.push(r.node)
            i = r.i
        } else if (t.type == 'left-square') {
            // Find the body of the brackets first
            let r = parse(tokens, i + 1, 'right-square')
            if (ret.length) {
                let lhs = new FilterNode(ret)
                ret = []
                if (r.node.length === 0)
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
        // Comma consumes everything previous and splits in-place
        // (parsing carries on in this method)
        } else if (t.type == 'comma') {
            commaAccum.push(new FilterNode(ret))
            ret = []
        // Pipe consumes everything previous *including* commas
        // and splits by recursing for the right-hand side.
        } else if (t.type == 'pipe') {
            if (commaAccum.length) {
                // .x,.y | .[1] is the same as (.x,.y) | .[1]
                commaAccum.push(new FilterNode(ret))
                ret = [new CommaNode(commaAccum)]
                commaAccum = []
            }
            let lhs = new FilterNode(ret)
            let r = parse(tokens, i + 1, until)
            let rhs = r.node
            i = r.i
            ret = [new PipeNode(lhs, rhs)]
        } else {
            throw 'could not handle token ' + t.type
        }
        t = tokens[++i]
    }
    // If a comma appeared this array is non-empty and contains all
    // previous branches.
    if (commaAccum.length) {
        commaAccum.push(new FilterNode(ret))
        return {node: new CommaNode(commaAccum), i}
    }
    if (ret.length == 1)
        return {node: ret[0], i}
    return {node: new FilterNode(ret), i}
}

function parseDotSquare(tokens, startAt=0) {
    let i = startAt
    let ds = tokens[i]
    i++
    if (tokens[i].type == 'right-square')
        return {node: new GenericValueIterator(), i}
    let r = parse(tokens, i, 'right-square')
    return {node: new GenericIndex(r.node), i: r.i}
}

// Parse node classes follow. Parse nodes are:
//   FilterNode, generic juxtaposition combination
//   IndexNode, lhs[rhs]
//   GenericIndex, .[index]
//   IdentifierIndex .index (delegates to GenericIndex("index"))
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
class ParseNode {}
class FilterNode extends ParseNode {
    constructor(nodes) {
        super()
        this.length = nodes.length
        let p = nodes.pop()
        if (p) {
            this.filter = p
            this.source = new FilterNode(nodes)
        }
    }
    * apply(input) {
        if (!this.filter)
            return yield input
        for (let v of this.source.apply(input)) {
            yield* this.filter.apply(v)
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
            for (let i of this.index.apply(input))
                yield l[i]
    }
}
class GenericIndex extends ParseNode {
    constructor(innerNode) {
        super()
        this.index = innerNode
    }
    * apply(input) {
        for (let i of this.index.apply(input))
            yield input[i]
    }
}
class IdentifierIndex extends GenericIndex {
    constructor(v) {
        super(new StringNode(v))
    }
}
class IdentityNode extends ParseNode {
    constructor() {
        super()
    }
    * apply(input) {
        yield input
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
            yield* o
    }
}
class GenericValueIterator extends ParseNode {
    constructor() {
        super()
    }
    * apply(input) {
        yield* input
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
}
