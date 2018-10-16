
function isAlpha(c) {
    return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z')
}

function isDigit(c) {
    return (c >= '0' && c <= '9')
}

function makeFilter(str) {
    console.log('making filter from', str)
    let transform = () => null
    let mode = false
    if (str === '')
        return {
            filter: (x) => [x],
            upto: 0,
            rest: '',
        }
    let nonSpace = 0
    for (let i = 0; i < str.length; i++)
        if (str[i] != ' ') {
            nonSpace = i;
            break;
        }
    if (str[nonSpace] == ']')
        return {
            filter: (x) => [x],
            upto: nonSpace,
            rest: str.substr(nonSpace),
        }
    let comma = false
    let i
    let thisStep
    let start = nonSpace
    for (i = nonSpace; i < str.length; i++) {
        let c = str[i]
        if (mode == 'quote' && c == '"') {
            break
        } else if (mode == 'quote') {
        } else if (mode == 'single-quote' && c == "'") {
            break
        } else if (mode == 'single-quote') {
        } else if (!mode && c == '"') {
            mode = 'quote'
            start = i
        } else if (!mode && c == "'") {
            mode = 'single-quote'
            start = i
        } else if (!mode && c === ' ') {
        } else if (mode != 'quote' && mode != 'single-quote'
            && mode != 'square-index'
            && c == ' ') {
            // Found end
            break
        } else if (!mode && c == ',') {
            comma = true
            start = i + 1
            while (str[i + 1] == ' ')
                i++, start++
        } else if (!mode && isDigit(c)) {
            mode = 'number'
            start = i
        } else if (mode == 'number' && c == ']' || c == ',') {
            break
        } else if (mode == 'number') {
//            if (!isDigit(c))
  //              throw "expected digit"
        } else if (mode == 'object-identifier-index') {
            if (c == '.' || c == ']')
                break
        } else if (mode == 'square-index' && c == ']') {
            mode = 'value-iterator'
            i++
            break
        } else if (mode == 'square-index') {
            let sub = makeFilter(str.substr(i))
            if (sub.rest[0] != ']') {
                throw 'expected ]'
            }
            thisStep = function*(x) {
                for (let i of sub.filter(x)) {
                    console.log('indexing', x, 'with', i)
                    yield x[i]
                }
            }
            i += sub.upto
            break
        } else if (mode == 'dot' && isAlpha(c)) {
            mode = 'object-identifier-index'
        } else if (mode == 'dot' && c == '[') {
            mode = 'square-index'
        } else if (c == '.') {
            mode = 'dot';
        } else if (c == '[') {
            mode = 'array'
            let sub = makeFilter(str.substr(i + 1))
            if (sub.rest[0] != ']') {
                throw 'expected ]'
            }
            thisStep = function(x) {
                return [Array.from(sub.filter(x))]
            }
            i += sub.upto + 2
            break
        } else {
            throw 'unexpected character: ' + c
        }
    }
    if (mode == 'object-identifier-index') {
        thisStep = x => [x[str.substring(start + 1, i)]];
    } else if (mode == 'value-iterator') {
        thisStep = Object.values
    } else if (mode == 'quote' || mode == 'single-quote') {
        let ss = str.substring(start + 1, i)
        thisStep = x => [ss]
        i++
    } else if (mode == 'number') {
        let ss = Number.parseFloat(str.substring(start, i))
        thisStep = x => [ss]
    } else if (mode == 'dot') {
        thisStep = x => [x]
    }
    if (typeof thisStep != 'function') {
        console.log('failed step in', mode, 'step', thisStep)
        throw 'stop running here'
    }
    console.log('rest', str.substr(i))
    let rest = makeFilter(str.substr(i))
    if (rest.comma) {
        let s1 = thisStep
        let rhs = rest.filter
        rest.filter = x => [x]
        thisStep = function*(x) {
            console.log('comma filter given', x)
            for (let a of s1(x)) {
                console.log('lhs gives', a)
                yield a
            }
            for (let b of rhs(x)) {
                console.log('rhs gives', b)
                yield b
            }
        }
    }
    let ret = {
        rest: str.substr(i + rest.upto),
        upto: i + rest.upto,
        filter: function*(input) {
            console.log(thisStep(input))
            for (let x of thisStep(input)) {
                yield* rest.filter(x)
            }
        },
        comma
    }
    return ret
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
