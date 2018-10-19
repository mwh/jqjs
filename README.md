jqjs is a JavaScript implementation of the [jq] query language. It
implements the core language features in pure JavaScript.

The main entry point to jqjs is the compile function, which turns a jq
program string into a generator function:

    import jq from './jq.js'
    let filter = jq.compile(".x[].y")
    for (let v of filter({x:[{y:2}, {y:4}]}) { ... }

The module also has a prettyPrint function for rendering an object to
text.

Features
--------

jqjs supports *most* of the core jq language features, but lacks
functions and some of the advanced functionality. It also uses
JavaScript strings as backing, so does not have jq proper's Unicode
support.

- [x] Identity: `.`
- [x] Object Identifier-Index: `.foo`, `.foo.bar`
- [x] Generic Object Index: `.[<string>]`
- [x] Array Index: `.[2]`
- [ ] Array/String Slice: `.[10:15]`
- [x] Array/Object Value Iterator: `.[]`
- [x] Comma: `,`
- [x] Pipe: `|`
- [x] Parentheses: `(...)`
- [x] Array Construction: `[...]`
- [x] Object Construction: `{ ... }` including shorthand `{ user, title }`
      and computed keys `{ (.x): true }`
- [ ] Recursive Descent: `..`
- [x] Addition, subtraction, multiplication, division, and modulo,
  including the overloaded type operations.
- [ ] Named functions
    - [ ] Built-in functions
    - [ ] User-defined functions
    - [ ] Mathematical functions
- [ ] Comparisons: `==`, `!=`, `<`, `>`, `<=`, `>=`
- [ ] Conditionals: `if A then B else C`
- [ ] Alternative operator: `//`
- [ ] Try-catch: `try EXP catch EXP`
  - [ ] Error Suppression operator `?`
- [ ] Regular expressions
- [ ] Variable/Symbolic Binding Operator `... as $identifier | ...`
- [ ] Reduce: `reduce .[] as $item (0; . + $item)`
- [ ] foreach: `foreach .[] as $item (...;...;...)`
- [ ] Recursion: `recurse(.children[])`
- [ ] I/O (unlikely to make sense here)
- [x] Update-assignment: `.posts[].comments |= . + ["Another"]`
- [ ] Arithmetic update-assignment: `+=`, `-=`, `*=`, `/=`, `%=`, `//=`
- [ ] Plain assignment: `(.a,.b) = range(2)`
- [ ] Modules with `import` and `include`

Performance
-----------

Not great.

The intention is to be semantically correct first and to have clear code
second. Performance improvements sit after that, if at all. Executing a
program may reëvaluate parts of it or traverse the object multiple times
where that makes things simpler, and internally evaluation happens by
tree-walking the input syntax.

Demonstration
-------------

[demo.html] is a [live demo](https://mwh.github.io/jqjs/demo.html) of how
to use jqjs that lets you enter a jq program and an input JSON value and
see the output JSON values it produces.


[jq]: https://stedolan.github.io/jq/
[demo.html]: demo.html
