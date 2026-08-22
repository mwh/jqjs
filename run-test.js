// This runs the upstream test cases from mainline jq.
// It expects to find the jq.test file in the same directory.
// It outputs only failing test cases, and a summary of the results at the end.
// By default, tests that expect a thrown error will be considered to match
// any thrown error, and will not be reported. --all-mismatches undoes that.
import fs from 'node:fs'
import util from 'node:util'
import jq from './jq.js'

const testSource = fs.readFileSync(new URL('./jq.test', import.meta.url), 'utf8')
const testLines = testSource.split(/\r?\n/)
const showAllMismatches = process.argv.includes('--all-mismatches')
const showOnlySoftMatches = process.argv.includes('--only-soft-matches')

function isComment(line) {
    return /^\s*#/.test(line)
}

function isBlank(line) {
    return line.trim() === ''
}

function isIgnored(line) {
    return isBlank(line) || isComment(line)
}

function pretty(value) {
    return jq.prettyPrint(value, '', '', '')
}

function formatValueForDisplay(value) {
    try {
        return pretty(value)
    } catch (error) {
        // Fall back to inspect so reporting does not crash on deeply nested structures.
        const inspected = util.inspect(value, { depth: 5, breakLength: 120, maxArrayLength: 20 })
        return `<unprintable via jq.prettyPrint: ${stringifyError(error)}; fallback=${inspected}>`
    }
}

function parseJson(text, label) {
    try {
        return JSON.parse(text.replace(/^\uFEFF/, ''))
    } catch (error) {
        throw new Error(`${label} JSON parse failed: ${error.message || error}`)
    }
}

function stringifyError(error) {
    if (error && typeof error === 'object' && 'message' in error && error.message) {
        return String(error.message)
    }
    return String(error)
}

function isExpectedErrorMarker(text) {
    const trimmed = text.trimStart()
    return trimmed.startsWith('jq: error:') || trimmed.startsWith('# Runtime error:')
}

function nextContentIndex(start) {
    let index = start
    while (index < testLines.length && isIgnored(testLines[index])) {
        index++
    }
    return index
}

function parseTests() {
    const cases = []
    let index = 0

    while (index < testLines.length) {
        index = nextContentIndex(index)
        if (index >= testLines.length) {
            break
        }

        if (testLines[index].trim().startsWith('%%FAIL')) {
            const ignoreMessage = /IGNORE MSG/.test(testLines[index])
            index++
            index = nextContentIndex(index)
            if (index >= testLines.length) break
            const program = testLines[index++]

            index = nextContentIndex(index)
            if (index >= testLines.length) break
            const expectedErrorLines = []
            while (index < testLines.length && !isBlank(testLines[index])) {
                expectedErrorLines.push(testLines[index])
                index++
            }

            cases.push({ kind: 'fail', program, expectedError: expectedErrorLines.join('\n'), ignoreMessage })

            while (index < testLines.length && !isBlank(testLines[index])) {
                index++
            }
            continue
        }

        const program = testLines[index++]
        index = nextContentIndex(index)
        if (index >= testLines.length) break
        const input = testLines[index++]

        const expected = []
        while (index < testLines.length) {
            const line = testLines[index]
            if (isComment(line)) {
                index++
                continue
            }
            if (isBlank(line)) {
                index++
                break
            }
            if (line.trim() === '%%FAIL') {
                break
            }
            expected.push(line)
            index++
        }

        cases.push({ kind: 'pass', program, input, expected })
    }

    return cases
}

function runFilter(program, input) {
    const filter = jq.compile(program)
    const actual = []
    for (const value of filter(input)) {
        actual.push(value)
    }
    return actual
}

function parseExpectedValues(expectedLines) {
    const parsed = []
    for (let i = 0; i < expectedLines.length; i++) {
        const line = expectedLines[i]
        if (isExpectedErrorMarker(line)) {
            return { kind: 'error-marker', text: line }
        }
        parsed.push(parseJson(line, `expected output ${i + 1}`))
    }
    return { kind: 'values', values: parsed }
}

function compareArrays(actual, expected) {
    if (actual.length !== expected.length) {
        return false
    }
    for (let i = 0; i < actual.length; i++) {
        if (!jq.valueEquals(actual[i], expected[i])) {
            return false
        }
    }
    return true
}

function runCase(testCase) {
    if (testCase.kind === 'fail') {
        try {
            const filter = jq.compile(testCase.program)
            for (const _ of filter(null)) {
                // Exhaust the iterator to catch runtime failures if the program compiles.
            }
            return { status: 'unexpected-pass' }
        } catch (error) {
            const actualError = stringifyError(error)
            if (testCase.ignoreMessage) {
                return { status: 'expected-fail' }
            }
            if (isExpectedErrorMarker(testCase.expectedError)) {
                return { status: 'soft-expected-fail', actualError }
            }
            if (actualError === testCase.expectedError) {
                return { status: 'expected-fail' }
            }
            return { status: 'wrong-error', actualError }
        }
    }

    try {
        const input = parseJson(testCase.input, 'input')
        const expectedParsed = parseExpectedValues(testCase.expected)
        const actual = runFilter(testCase.program, input)
        if (expectedParsed.kind === 'error-marker') {
            return { status: 'mismatch', actual }
        }
        if (compareArrays(actual, expectedParsed.values)) {
            return { status: 'pass' }
        }
        return { status: 'mismatch', actual }
    } catch (error) {
        const actualError = stringifyError(error)
        if (testCase.expected.length === 1 && isExpectedErrorMarker(testCase.expected[0])) {
            return { status: 'soft-expected-fail', actualError }
        }
        return { status: 'error', error: actualError }
    }
}

const tests = parseTests()
let passed = 0
let failed = 0
let expectedFailures = 0
let softExpectedErrors = 0
let unexpectedPasses = 0

for (let i = 0; i < tests.length; i++) {
    const testCase = tests[i]
    const result = runCase(testCase)
    const label = `test ${i + 1}`

    if (testCase.kind === 'fail') {
        if (result.status === 'expected-fail') {
            expectedFailures++
            continue
        }

        if (result.status === 'soft-expected-fail') {
            softExpectedErrors++
            if (showAllMismatches || showOnlySoftMatches) {
                console.log(`${label}: soft expected error matched`)
                console.log(`  program:  ${testCase.program}`)
                console.log(`  expected: ${testCase.expectedError}`)
                console.log(`  actual:   ${result.actualError}`)
            }
            continue
        }

        failed++
        if (result.status === 'unexpected-pass') {
            unexpectedPasses++
            console.log(`${label}: expected failure but program succeeded`)
        } else if (!onlySoftMatches) {
            console.log(`${label}: expected failure mismatch`)
            console.log(`  program:  ${testCase.program}`)
            console.log(`  input:    ${testCase.input}`)
            console.log(`  expected: ${testCase.expectedError}`)
            console.log(`  actual:   ${result.actualError || result.error}`)
        }
        continue
    }

    if (result.status === 'pass') {
        passed++
        continue
    }

    if (result.status === 'soft-expected-fail') {
        softExpectedErrors++
        if (showAllMismatches || showOnlySoftMatches) {
            console.log(`${label}: soft expected error matched`)
            console.log(`  program:  ${testCase.program}`)
            console.log(`  input:    ${testCase.input}`)
            console.log(`  expected: ${testCase.expected.join(' | ')}`)
            console.log(`  actual:   ${result.actualError}`)
        }
        continue
    }
    if (showOnlySoftMatches) {
        continue
    }

    failed++
    console.log(`${label}: output mismatch`)
    console.log(`  program:  ${testCase.program}`)
    console.log(`  input:    ${testCase.input}`)
    console.log(`  expected: ${testCase.expected.join(' | ')}`)
    if (result.status === 'mismatch') {
        console.log(`  actual:   ${result.actual.map((value) => formatValueForDisplay(value)).join(' | ')}`)
    } else {
        console.log(`  actual error: ${result.error}`)
    }
}

console.log(`\n${passed} passed, ${failed} failed, ${expectedFailures} expected failures, ${softExpectedErrors} soft expected errors, ${unexpectedPasses} unexpected passes`)

if (failed > 0 || unexpectedPasses > 0) {
    process.exitCode = 1
}
