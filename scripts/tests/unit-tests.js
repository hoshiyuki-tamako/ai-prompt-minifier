/* scripts/tests/unit-tests.js — built-in unit-test runner.
   Run from the browser console — one command, zero external tools:

       APM.test.run()          -> every suite, 100% = all cases pass
       APM.test.run("csharp")  -> only cases whose name contains "csharp"
       APM.test.list()         -> all case names (array)

   Design contract:
   - At LOAD time this file defines data + functions ONLY: no listeners,
     no timers, no DOM writes, no network — a page the user never
     touches pays no runtime cost (verified by the boot regression).
   - Cases are evaluated inside run() only; run() is idempotent, so it
     is safe to re-run in the same tab (e.g. after an edit).
   - Expected values are literals pinned from the node ground-truth
     harnesses (t95/t103/t104/t125/t126/t131/t132/t134/t136/t138/t152/t154) —
     computed from the shipped contract, never eyeballed.
   - State-touching suites (pipeline / save model / theme / palette)
     drive the REAL app code in-page (io.recompute, Save/Load buttons,
     theme.apply, palette.render); the runner captures the user's state
     before the run and restores it afterwards (try/finally), so tests
     never leave user data mutated.

   Written from scratch for this project (CyberChef is layout/style
   reference only). */
(function (APM) {
    "use strict";

    // ---------- pinned vectors (node ground truth, see header) ----------
    var V =         {
            "minify": [
                [
                    "quoted string kept exact",
                    "a \"b\" c",
                    "a\"b\"c"
                ],
                [
                    "adjacent strings",
                    "\"a\"   \"b\"",
                    "\"a\"\"b\""
                ],
                [
                    "whitespace collapse",
                    "const x   =   1;",
                    "const x=1;"
                ],
                [
                    "string interior exact",
                    "\"keep   this   exact\"",
                    "\"keep   this   exact\""
                ],
                [
                    "quoted whitespace",
                    "\"   \"",
                    "\"   \""
                ],
                [
                    "whitespace only -> empty",
                    "   ",
                    ""
                ],
                [
                    "empty -> empty",
                    "",
                    ""
                ]
            ],
            "strip": [
                [
                    "tags + entities",
                    "<div class=\"a\">Hi&nbsp;&amp;&lt;x&gt;</div>",
                    " Hi &<x> "
                ],
                [
                    "comment only",
                    "a <!-- comment --> b",
                    "a   b"
                ],
                [
                    "doctype + tag",
                    "<!DOCTYPE html><p>x</p>",
                    "  x "
                ],
                [
                    "five named entities",
                    "&amp; &lt; &gt; &quot; &apos;",
                    "& < > \" '"
                ],
                [
                    "numeric + hex refs",
                    "&#65;&#x42;",
                    "AB"
                ],
                [
                    "invalid codepoint -> space",
                    "&#2000000;",
                    " "
                ],
                [
                    "lone ampersand kept",
                    "5 & 6",
                    "5 & 6"
                ],
                [
                    "tag + comment combo (t132)",
                    "<div class=\"a\">Hi&nbsp;&amp;&lt;x&gt;</div><!-- c -->",
                    " Hi &<x>  "
                ]
            ],
            "rcExplicit": [
                [
                    "js-ts url in string",
                    "var u = \"http://x\"; // real",
                    "js-ts",
                    "var u = \"http://x\";  "
                ],
                [
                    "js-ts block",
                    "a /* c */ b",
                    "js-ts",
                    "a   b"
                ],
                [
                    "js-ts line keeps newline",
                    "a // c\nb",
                    "js-ts",
                    "a  \nb"
                ],
                [
                    "js-ts backtick raw",
                    "`a // b`",
                    "js-ts",
                    "`a // b`"
                ],
                [
                    "python line + string",
                    "x = 1  # c\ny = 'a # b'",
                    "python",
                    "x = 1   \ny = 'a # b'"
                ],
                [
                    "python triple quote",
                    "s = \"\"\"\n# not a comment\n\"\"\";\nx = 1  # real",
                    "python",
                    "s = \"\"\"\n# not a comment\n\"\"\";\nx = 1   "
                ],
                [
                    "rust nested block",
                    "let a = 1; /* /* */ x */",
                    "rust",
                    "let a = 1;  "
                ],
                [
                    "css block",
                    ".a { color: red; /* c */ }",
                    "css",
                    ".a { color: red;   }"
                ],
                [
                    "css string kept",
                    "content: \"/* keep */\";",
                    "css",
                    "content: \"/* keep */\";"
                ],
                [
                    "html comment",
                    "a <!-- c --> b",
                    "html-xml",
                    "a   b"
                ],
                [
                    "html attr kept",
                    "<div title=\"<!-- keep -->\">x</div>",
                    "html-xml",
                    "<div title=\"<!-- keep -->\">x</div>"
                ],
                [
                    "c-sh strip",
                    "int x = 1; // c",
                    "c-sh",
                    "int x = 1;  "
                ],
                [
                    "c-sh string kept",
                    "Console.WriteLine(\"a // b\"); // c",
                    "c-sh",
                    "Console.WriteLine(\"a // b\");  "
                ],
                [
                    "java strip",
                    "int x = 1; // c",
                    "java",
                    "int x = 1;  "
                ],
                [
                    "c strip (t138)",
                    "int main() { // hi\n    return 0; /* ok */ }",
                    "c",
                    "int main() {  \n    return 0;   }"
                ],
                [
                    "cpp === c (t138)",
                    "int main() { // hi\n    return 0; /* ok */ }",
                    "cpp",
                    "int main() {  \n    return 0;   }"
                ],
                [
                    "legacy c-cpp alias (t138)",
                    "int main() { // hi\n    return 0; /* ok */ }",
                    "c-cpp",
                    "int main() {  \n    return 0;   }"
                ],
                [
                    "c url string exact",
                    "u = \"http://a  b\"; // c",
                    "c",
                    "u = \"http://a  b\";  "
                ],
                [
                    "c unterminated block",
                    "x = 1; /* oops",
                    "c",
                    "x = 1;  "
                ],
                [
                    "json line strip (t138)",
                    "{\"a\": 1} // x",
                    "json",
                    "{\"a\": 1}  "
                ],
                [
                    "json block strip (t138)",
                    "{\"a\": 1} /* y */ {\"b\": 2}",
                    "json",
                    "{\"a\": 1}   {\"b\": 2}"
                ],
                [
                    "json url string exact",
                    "{\"u\": \"http://a  b\", // c\n\"b\": 1}",
                    "json",
                    "{\"u\": \"http://a  b\",  \n\"b\": 1}"
                ],
                [
                    "json block in string kept",
                    "{\"s\": \"a /* keep */ b\"}",
                    "json",
                    "{\"s\": \"a /* keep */ b\"}"
                ],
                [
                    "json top line comment",
                    "// top\n{\"a\": 1}",
                    "json",
                    " \n{\"a\": 1}"
                ],
                [
                    "go raw string",
                    "s := `a // b` // c",
                    "go",
                    "s := `a // b`  "
                ],
                [
                    "php strip",
                    "<?php $x = 1; // c",
                    "php",
                    "<?php $x = 1;  "
                ],
                [
                    "sql -- boundary",
                    "SELECT 1--2 -- c",
                    "sql",
                    "SELECT 1--2  "
                ],
                [
                    "ruby line",
                    "def f\n  x = 1 # c\nend",
                    "ruby",
                    "def f\n  x = 1  \nend"
                ],
                [
                    "sh shebang kept",
                    "#!/bin/sh\necho hi # c",
                    "sh",
                    "#!/bin/sh\necho hi  "
                ],
                [
                    "powershell line",
                    "$x = 1 # c",
                    "powershell",
                    "$x = 1  "
                ],
                [
                    "kotlin strip",
                    "val x = 1 // c",
                    "kotlin",
                    "val x = 1  "
                ],
                [
                    "swift strip",
                    "let x = 1 // c",
                    "swift",
                    "let x = 1  "
                ],
                [
                    "ruby =begin/=end (line-start delims)",
                    "x = 1 # c\n=begin\nhidden\n=end\ny = 2",
                    "ruby",
                    "x = 1  \n \ny = 2"
                ],
                [
                    "ruby mid-line =end is not a close",
                    "=begin\na # =end\nb\n=end\nc",
                    "ruby",
                    " \nc"
                ],
                [
                    "powershell <# #> block",
                    "$x = 1 <# b #> $y = 2",
                    "powershell",
                    "$x = 1   $y = 2"
                ],
                [
                    "php # line",
                    "<?php $x = 1; # c",
                    "php",
                    "<?php $x = 1;  "
                ],
                [
                    "js-ts unterminated template (to end)",
                    "s = `a // b",
                    "js-ts",
                    "s = `a // b"
                ],
                [
                    "kotlin nested block",
                    "val x = 1 /* a /* b */ c */",
                    "kotlin",
                    "val x = 1  "
                ],
                [
                    "swift nested block",
                    "let x = 1 /* a /* b */ c */",
                    "swift",
                    "let x = 1  "
                ],
                [
                    "markdown: only <!-- --> is a comment",
                    "# T <!-- c -->\n\ntext",
                    "markdown",
                    "# T  \n\ntext"
                ]
            ],
            "rcAuto": [
                [
                    "auto rust",
                    "pub fn main() {} // x",
                    "auto",
                    "pub fn main() {}  "
                ],
                [
                    "auto python",
                    "def f():\n    x = 1  # c",
                    "auto",
                    "def f():\n    x = 1   "
                ],
                [
                    "auto js",
                    "const x = 1; // c",
                    "auto",
                    "const x = 1;  "
                ],
                [
                    "auto css",
                    ".a { color: red; /* c */ }",
                    "auto",
                    ".a { color: red;   }"
                ],
                [
                    "auto html",
                    "<!DOCTYPE html><div><!-- c -->x</div>",
                    "auto",
                    "<!DOCTYPE html><div> x</div>"
                ],
                [
                    "auto c",
                    "#include <stdio.h>\nint main(void) { return 0; } // c",
                    "auto",
                    "#include <stdio.h>\nint main(void) { return 0; }  "
                ],
                [
                    "auto identity hashtag+url",
                    "See #hashtag and https://x.example/a//b for details",
                    "auto",
                    "See #hashtag and https://x.example/a//b for details"
                ],
                [
                    "auto identity prose",
                    "hello world",
                    "auto",
                    "hello world"
                ],
                [
                    "auto identity url",
                    "https://x.example/a//b",
                    "auto",
                    "https://x.example/a//b"
                ]
            ],
            "rcAutoMulti": [
                [
                    "fenced blocks",
                    "Intro prose line.\n\n```python\nx = 1  # c\ny = 2  # d\n```\n\nMore prose here.\n\n```rust\nlet a = 1; // c\n```\n\n```go\nx := 1 // kept\n```\n\nEnd prose.",
                    "auto-multi",
                    "Intro prose line.\n\n```python\nx = 1   \ny = 2   \n```\n\nMore prose here.\n\n```rust\nlet a = 1;  \n```\n\n```go\nx := 1  \n```\n\nEnd prose."
                ],
                [
                    "unfenced runs",
                    "Talk about #hashtag and https://x.example/a//b here.\n\ndef f():\n    x = 1  # c\n\nconst a = 1; // c\nconst b = 2; // d\n\nThe end.",
                    "auto-multi",
                    "Talk about #hashtag and https://x.example/a//b here.\n\ndef f():\n    x = 1   \n\nconst a = 1;  \nconst b = 2;  \n\nThe end."
                ],
                [
                    "jsdoc block",
                    "function f() {\n    /* c */\n    const x = 1; // d\n}",
                    "auto-multi",
                    "function f() {\n     \n    const x = 1;  \n}"
                ],
                [
                    "single hash line untouched",
                    "Prose before.\n# foo\nProse after.",
                    "auto-multi",
                    "Prose before.\n# foo\nProse after."
                ],
                [
                    "bullets untouched",
                    "- first point\n- second point\n- third point",
                    "auto-multi",
                    "- first point\n- second point\n- third point"
                ],
                [
                    "t138 mixed python+rust fences",
                    "# Mixed\n\n```python\nx = 1  # c\n```\n\n```rust\nlet y = 2; // c\n```\n\nend",
                    "auto-multi",
                    "# Mixed\n\n```python\nx = 1   \n```\n\n```rust\nlet y = 2;  \n```\n\nend"
                ]
            ],
            "res": [
                [
                    "N1 basic",
                    "a  b\n\n  c",
                    "a b c",
                    1
                ],
                [
                    "N1 trim",
                    "   x   ",
                    "x",
                    1
                ],
                [
                    "N1 tabs",
                    "a\tb",
                    "a b",
                    1
                ],
                [
                    "N1 strings",
                    "he  \"llo  world\"",
                    "he \"llo world\"",
                    1
                ],
                [
                    "N1 mixed newlines",
                    "a\r\n  b\n\tc",
                    "a b c",
                    1
                ],
                [
                    "no opts = legacy",
                    "a  b",
                    "a b",
                    "__undefined__"
                ],
                [
                    "empty text",
                    "",
                    "",
                    1
                ],
                [
                    "N0 blob",
                    "a\n\n  b\t c",
                    "abc",
                    0
                ],
                [
                    "N0 trim-via-removal",
                    "  x  ",
                    "x",
                    0
                ],
                [
                    "N0 strings",
                    "he  \"llo  world\"",
                    "he\"lloworld\"",
                    0
                ],
                [
                    "N0 only ws",
                    "   \n\t ",
                    "",
                    0
                ],
                [
                    "N2 single->double",
                    "a b",
                    "a  b",
                    2
                ],
                [
                    "N2 trim",
                    "  a   b  ",
                    "a  b",
                    2
                ],
                [
                    "N3",
                    "a b",
                    "a   b",
                    3
                ],
                [
                    "N3 multi",
                    "a\nb\tc",
                    "a   b   c",
                    3
                ],
                [
                    "invalid string -> 1",
                    "a  b",
                    "a b",
                    "abc"
                ],
                [
                    "negative -> 1",
                    "a  b",
                    "a b",
                    -2
                ]
            ],
            "regex": [
                [
                    "s+ collapse",
                    "a   b\n\n  c",
                    {
                        "pattern": "\\s+",
                        "replacement": " "
                    },
                    {
                        "text": "a b c",
                        "meta": "2 replacements"
                    }
                ],
                [
                    "no match",
                    "abc",
                    {
                        "pattern": "zzz",
                        "replacement": "x"
                    },
                    {
                        "text": "abc",
                        "meta": "no match"
                    }
                ],
                [
                    "invalid pattern",
                    "abc",
                    {
                        "pattern": "(",
                        "replacement": "x"
                    },
                    {
                        "text": "abc",
                        "meta": "invalid pattern"
                    }
                ],
                [
                    "empty pattern hint",
                    "abc",
                    {
                        "pattern": "",
                        "replacement": "x"
                    },
                    {
                        "text": "abc",
                        "meta": "no pattern — add one"
                    }
                ],
                [
                    "flag i",
                    "ABC def",
                    {
                        "pattern": "abc",
                        "replacement": "[ABC]",
                        "flags": "i"
                    },
                    {
                        "text": "[ABC] def",
                        "meta": "1 replacement"
                    }
                ],
                [
                    "flag m",
                    "x1\ny2\nx3",
                    {
                        "pattern": "^x",
                        "replacement": "X",
                        "flags": "m"
                    },
                    {
                        "text": "X1\ny2\nX3",
                        "meta": "2 replacements"
                    }
                ],
                [
                    "g forced loop-safe",
                    "aaa",
                    {
                        "pattern": "a",
                        "replacement": "aX"
                    },
                    {
                        "text": "aXaXaX",
                        "meta": "3 replacements"
                    }
                ],
                [
                    "backrefs",
                    "foo bar",
                    {
                        "pattern": "(\\w+)\\s+(\\w+)",
                        "replacement": "$2 $1"
                    },
                    {
                        "text": "bar foo",
                        "meta": "1 replacement"
                    }
                ],
                [
                    "empty replacement deletes",
                    "a1 b22",
                    {
                        "pattern": "\\d+",
                        "replacement": ""
                    },
                    {
                        "text": "a b",
                        "meta": "2 replacements"
                    }
                ],
                [
                    "flag sanitize yi",
                    "ABC",
                    {
                        "pattern": "abc",
                        "replacement": "Z",
                        "flags": "yi"
                    },
                    {
                        "text": "Z",
                        "meta": "1 replacement"
                    }
                ],
                [
                    "singular meta",
                    "abc",
                    {
                        "pattern": "b",
                        "replacement": ""
                    },
                    {
                        "text": "ac",
                        "meta": "1 replacement"
                    }
                ]
            ],
            "cmCSharp": [
                [
                    "csharp A1 collapse",
                    "x   =   1 ;",
                    "csharp",
                    true,
                    "x=1;"
                ],
                [
                    "csharp A1-off",
                    "x   =   1 ;",
                    "csharp",
                    false,
                    "x=1;"
                ],
                [
                    "csharp A2",
                    "int  a  =  5 ;",
                    "csharp",
                    true,
                    "int a=5;"
                ],
                [
                    "csharp A3 a<b",
                    "a < b",
                    "csharp",
                    true,
                    "a<b"
                ],
                [
                    "csharp B1 string",
                    "\"a  b\"",
                    "csharp",
                    true,
                    "\"a  b\""
                ],
                [
                    "csharp B2",
                    "s = \"a  b\" ;",
                    "csharp",
                    true,
                    "s=\"a  b\";"
                ],
                [
                    "csharp B3 char",
                    "'a'",
                    "csharp",
                    true,
                    "'a'"
                ],
                [
                    "csharp B5 escaped quote",
                    "\"a\\\" b\"",
                    "csharp",
                    true,
                    "\"a\\\" b\""
                ],
                [
                    "csharp B6 verbatim",
                    "p = @\"a  b\"\" c\" ;",
                    "csharp",
                    true,
                    "p=@\"a  b\"\" c\";"
                ],
                [
                    "csharp B6-off",
                    "p = @\"a  b\"\" c\" ;",
                    "csharp",
                    false,
                    "p=@\"a  b\"\" c\";"
                ],
                [
                    "csharp B7 interpolated",
                    "m = $\"x={a  b}\" ;",
                    "csharp",
                    true,
                    "m=$\"x={a  b}\";"
                ],
                [
                    "csharp B8 interpolated-verbatim",
                    "v = $@\"x={a  b}\" ;",
                    "csharp",
                    true,
                    "v=$@\"x={a  b}\";"
                ],
                [
                    "csharp B9 raw string C#11",
                    "r = \"\"\"raw  block\n    indented\"\"\" ;",
                    "csharp",
                    true,
                    "r=\"\"\"raw  block\n    indented\"\"\";"
                ],
                [
                    "csharp B10 verbatim multiline",
                    "s = @\"line1  \nline2\" ;",
                    "csharp",
                    true,
                    "s=@\"line1  \nline2\";"
                ],
                [
                    "csharp B11 legacy quirk",
                    "a \"b\" c",
                    "csharp",
                    true,
                    "a\"b\"c"
                ],
                [
                    "csharp C1 line ON",
                    "x = 1; // hi\ny = 2;",
                    "csharp",
                    true,
                    "x=1;y=2;"
                ],
                [
                    "csharp C1 line OFF",
                    "x = 1; // hi\ny = 2;",
                    "csharp",
                    false,
                    "x=1;// hi\ny=2;"
                ],
                [
                    "csharp C2 block ON",
                    "a /* note */ b",
                    "csharp",
                    true,
                    "a b"
                ],
                [
                    "csharp C2 block OFF",
                    "a /* note */ b",
                    "csharp",
                    false,
                    "a/* note */b"
                ],
                [
                    "csharp C3 unterminated ON",
                    "x = 1; /* oops",
                    "csharp",
                    true,
                    "x=1;"
                ],
                [
                    "csharp C4 no-newline ON",
                    "x = 1 // end",
                    "csharp",
                    true,
                    "x=1"
                ],
                [
                    "csharp C5 url string ON",
                    "u = \"http://a  b\" ;",
                    "csharp",
                    true,
                    "u=\"http://a  b\";"
                ],
                [
                    "csharp C6 block in string ON",
                    "s = \"a /* x */ b\" ;",
                    "csharp",
                    true,
                    "s=\"a /* x */ b\";"
                ],
                [
                    "csharp C7 @class",
                    "@class x = 1;",
                    "csharp",
                    true,
                    "@class x=1;"
                ],
                [
                    "csharp D1 empty",
                    "",
                    "csharp",
                    true,
                    ""
                ],
                [
                    "csharp D2 ws-only",
                    "   \n",
                    "csharp",
                    true,
                    ""
                ],
                [
                    "csharp F6 default rc ON",
                    "x = 1; // c\ny = 2;",
                    "csharp",
                    true,
                    "x=1;y=2;"
                ]
            ],
            "cmJson": [
                [
                    "jsonc E1 ON strip",
                    "{\"a\": 1, // c\n\"b\": 2 /* x */}",
                    "json",
                    true,
                    "{\"a\":1,\"b\":2}"
                ],
                [
                    "jsonc E2 url string",
                    "{\"u\": \"http://a  b\", // c\n}",
                    "json",
                    true,
                    "{\"u\":\"http://a  b\",}"
                ],
                [
                    "jsonc E3 block in string",
                    "{\"s\": \"a /* keep */ b\"}",
                    "json",
                    true,
                    "{\"s\":\"a /* keep */ b\"}"
                ],
                [
                    "json E4 OFF collapse-only",
                    "{\"a\": 1, // c\n\"b\": 2}",
                    "json",
                    false,
                    "{\"a\":1,//c\"b\":2}"
                ],
                [
                    "json E5 OFF no comment syntax",
                    "{\"a\": 1, /* x */}",
                    "json",
                    false,
                    "{\"a\":1,/*x*/}"
                ],
                [
                    "json collapse valid",
                    "{ \"a\" :  1 , \"b\" :  [ 1 ,  2 ] }",
                    "json",
                    true,
                    "{\"a\":1,\"b\":[1,2]}"
                ]
            ],
            "jsonParse": {
                "a": 1,
                "b": [
                    1,
                    2
                ]
            },
            "jsonInput": "{ \"a\" :  1 , \"b\" :  [ 1 ,  2 ] }",
            "cmTable": [
                [
                    "bash",
                    "#!/bin/sh\necho \"hi\"   # c\necho $1",
                    "#!/bin/sh echo\"hi\"echo $1",
                    "#!/bin/sh echo\"hi\"# c echo $1"
                ],
                [
                    "c",
                    "int main(void) {\n    int  x = 1;  // c\n    return x;\n}",
                    "int main(void){int x=1;return x;}",
                    "int main(void){int x=1;// c return x;}"
                ],
                [
                    "cpp",
                    "#include <vector>\nstd::vector<int> v;  // c\nint main() { return 0; }",
                    "#include<vector>std::vector<int>v;int main(){return 0;}",
                    "#include<vector>std::vector<int>v;// c int main(){return 0;}"
                ],
                [
                    "go",
                    "func main() {\n    x := 1  // c\n}",
                    "func main(){x:=1}",
                    "func main(){x:=1// c}"
                ],
                [
                    "markdown",
                    "# T\n\nText  here. <!-- c -->\n\n```python\nx = 1  # c\n```\n",
                    "#T Text here.```python\nx = 1  # c\n```",
                    "#T Text here.<!-- c -->```python\nx = 1  # c\n```"
                ],
                [
                    "php",
                    "<?php\n$x = 1;  // c\n?>",
                    "<?php $x=1;?>",
                    "<?php $x=1;// c?>"
                ],
                [
                    "python",
                    "def f():\n    x = 1  # c\n    return x",
                    "def f():x=1 return x",
                    "def f():x=1# c return x"
                ],
                [
                    "ruby",
                    "def hello\n  puts \"hi\"  # c\nend",
                    "def hello puts\"hi\"end",
                    "def hello puts\"hi\"# c end"
                ],
                [
                    "rust",
                    "fn main() {\n    let x = 1;  // c\n}",
                    "fn main(){let x=1;}",
                    "fn main(){let x=1;// c}"
                ],
                [
                    "sql",
                    "SELECT id,  name\nFROM users  -- c\nWHERE active = 1;",
                    "SELECT id,name FROM users WHERE active=1;",
                    "SELECT id,name FROM users-- c WHERE active=1;"
                ],
                [
                    "swift",
                    "func greet() -> String {\n    return \"hi\"  // c\n}",
                    "func greet()->String{return\"hi\"}",
                    "func greet()->String{return\"hi\"// c}"
                ]
            ],
            "cmExtra": [
                [
                    "javascript ON",
                    "var x = 1; // c\nvar y = 2;",
                    "javascript",
                    true,
                    "var x=1;var y=2;"
                ],
                [
                    "javascript OFF",
                    "var x = 1; // c\nvar y = 2;",
                    "javascript",
                    false,
                    "var x=1;// c\nvar y=2;"
                ],
                [
                    "typescript ON",
                    "interface A { x:  string } // c",
                    "typescript",
                    true,
                    "interface A{x:string}"
                ],
                [
                    "typescript OFF",
                    "interface A { x:  string } // c",
                    "typescript",
                    false,
                    "interface A{x:string}// c"
                ],
                [
                    "java ON",
                    "int x = 1; // c",
                    "java",
                    true,
                    "int x=1;"
                ],
                [
                    "java OFF",
                    "int x = 1; // c",
                    "java",
                    false,
                    "int x=1;// c"
                ],
                [
                    "css ON",
                    ".a { color: red; /* c */ }",
                    "css",
                    true,
                    ".a{color:red;}"
                ],
                [
                    "css OFF",
                    ".a { color: red; /* c */ }",
                    "css",
                    false,
                    ".a{color:red;/* c */}"
                ],
                [
                    "kotlin ON",
                    "fun main() {\n    val x = 5  // c\n    println(x)\n}",
                    "kotlin",
                    true,
                    "fun main(){val x=5 println(x)}"
                ],
                [
                    "kotlin OFF",
                    "fun main() {\n    val x = 5  // c\n    println(x)\n}",
                    "kotlin",
                    false,
                    "fun main(){val x=5// c println(x)}"
                ],
                [
                    "html ON",
                    "<!DOCTYPE html>\n<html><body><div class = \"a  b\">Hi  there <!-- c --></div></body></html>",
                    "html",
                    true,
                    "<!DOCTYPE html><html><body><div class = \"a  b\">Hi there</div></body></html>"
                ],
                [
                    "html OFF",
                    "<!DOCTYPE html>\n<html><body><div class = \"a  b\">Hi  there <!-- c --></div></body></html>",
                    "html",
                    false,
                    "<!DOCTYPE html><html><body><div class = \"a  b\">Hi there<!-- c --></div></body></html>"
                ],
                [
                    "python str ON",
                    "b = 1 # c\n# top\nx = \"a  b\"",
                    "python",
                    true,
                    "b=1 x=\"a  b\""
                ],
                [
                    "python str OFF",
                    "b = 1 # c\n# top\nx = \"a  b\"",
                    "python",
                    false,
                    "b=1# c# top x=\"a  b\""
                ],
                [
                    "powershell ON",
                    "$x = Get-Content \"a # b\" # line\n<# block\ncomment #>",
                    "powershell",
                    true,
                    "$x=Get-Content\"a # b\""
                ],
                [
                    "powershell OFF",
                    "$x = Get-Content \"a # b\" # line\n<# block\ncomment #>",
                    "powershell",
                    false,
                    "$x=Get-Content\"a # b\"# line<# block\ncomment #>"
                ],
                [
                    "js regex literal after keyword",
                    "var r = /a b/.test(\"x\")",
                    "javascript",
                    true,
                    "var r=/a b/.test(\"x\")"
                ],
                [
                    "js division after digit",
                    "a = 10 / 2;",
                    "javascript",
                    true,
                    "a=10/2;"
                ],
                [
                    "html raw text (script) byte-exact ON",
                    "<script>var x = \"a  b\"; // c</script>",
                    "html",
                    true,
                    "<script>var x = \"a  b\"; // c</script>"
                ],
                [
                    "html raw text (script) byte-exact OFF",
                    "<script>var x = \"a  b\"; // c</script>",
                    "html",
                    false,
                    "<script>var x = \"a  b\"; // c</script>"
                ],
                [
                    "html bare < > keep spaces",
                    "a < b > c",
                    "html",
                    true,
                    "a < b > c"
                ],
                [
                    "ruby =begin ON",
                    "x = 1 # c\n=begin\nhidden\n=end\ny = 2",
                    "ruby",
                    true,
                    "x=1 y=2"
                ],
                [
                    "ruby =begin OFF",
                    "x = 1 # c\n=begin\nhidden\n=end\ny = 2",
                    "ruby",
                    false,
                    "x=1# c=begin\nhidden\n=end y=2"
                ],
                [
                    "go backtick raw ON",
                    "s := `a // b`\n// c",
                    "go",
                    true,
                    "s:=`a // b`"
                ],
                [
                    "go backtick raw OFF",
                    "s := `a // b`\n// c",
                    "go",
                    false,
                    "s:=`a // b`// c"
                ],
                [
                    "kotlin nested block ON",
                    "val x = 1 /* a /* b */ c */",
                    "kotlin",
                    true,
                    "val x=1"
                ]
            ],
            "cmAuto": [
                [
                    "auto js",
                    "const x = 1;\nconsole.log(  x );",
                    "const x=1;console.log(x);"
                ],
                [
                    "auto css",
                    ".box  { color :  red ; }",
                    ".box{color:red;}"
                ],
                [
                    "auto ts",
                    "interface A { x:  string }",
                    "interface A{x:string}"
                ],
                [
                    "auto python",
                    "def f():\n    x = 1\n    return x",
                    "def f():x=1 return x"
                ],
                [
                    "auto rust",
                    "fn main() {\n    let x = 1;\n}",
                    "fn main(){let x=1;}"
                ],
                [
                    "auto go",
                    "func main() {\n    x := 1\n}",
                    "func main(){x:=1}"
                ],
                [
                    "auto java",
                    "package com.example;\nimport java.util.List;\npublic class Main {\n    public static void main(String[] args) {\n        System.out.println(\"hi\");\n    }\n}",
                    "package com.example;import java.util.List;public class Main{public static void main(String[]args){System.out.println(\"hi\");}}"
                ],
                [
                    "auto c",
                    "#include <stdio.h>\nint main(void) {\n    printf(\"hi\");\n    return 0;\n}",
                    "#include<stdio.h>int main(void){printf(\"hi\");return 0;}"
                ],
                [
                    "auto kotlin",
                    "fun main() {\n    val x = 5\n    println(x)\n}",
                    "fun main(){val x=5 println(x)}"
                ],
                [
                    "auto html",
                    "<!DOCTYPE html>\n<html><body><div class = \"a  b\">Hi  there</div></body></html>",
                    "<!DOCTYPE html><html><body><div class = \"a  b\">Hi there</div></body></html>"
                ],
                [
                    "auto csharp",
                    "using System;\n// hi\nstatic void Main() { /* x */ }",
                    "using System;static void Main(){}"
                ],
                [
                    "identity prose",
                    "hello world",
                    "hello world"
                ],
                [
                    "identity url",
                    "https://x.example/a//b",
                    "https://x.example/a//b"
                ],
                [
                    "identity a=1",
                    "a = 1",
                    "a = 1"
                ],
                [
                    "identity zero-marker block",
                    "a /* c */ b",
                    "a /* c */ b"
                ],
                [
                    "empty auto",
                    "   ",
                    ""
                ]
            ],
            "cmSpecial": [
                [
                    "unknown lang value identity",
                    "x   =   1",
                    "not-a-lang",
                    "x   =   1"
                ],
                [
                    "unknown version value = auto behaviour",
                    "x   =   1 ;",
                    "2025",
                    "x=1;"
                ]
            ],
            "cmVersionBands": [
                [
                    "csharpVersion: auto interpolated",
                    "m = $\"x={a  b}\" ;",
                    "auto",
                    "m=$\"x={a  b}\";"
                ],
                [
                    "csharpVersion: csharp-12 = auto (interpolated)",
                    "m = $\"x={a  b}\" ;",
                    "csharp-12",
                    "m=$\"x={a  b}\";"
                ],
                [
                    "csharpVersion: csharp-11 raw = auto",
                    "r = \"\"\"raw  block\n    indented\"\"\" ;",
                    "csharp-11",
                    "r=\"\"\"raw  block\n    indented\"\"\";"
                ],
                [
                    "csharpVersion: csharp-12 raw = auto",
                    "r = \"\"\"raw  block\n    indented\"\"\" ;",
                    "csharp-12",
                    "r=\"\"\"raw  block\n    indented\"\"\";"
                ],
                [
                    "csharpVersion: csharp-99 (unknown) = auto",
                    "m = $\"x={a  b}\" ;",
                    "csharp-99",
                    "m=$\"x={a  b}\";"
                ],
                [
                    "csharpVersion: garbage version = auto",
                    "m = $\"x={a  b}\" ;",
                    "weird",
                    "m=$\"x={a  b}\";"
                ],
                [
                    "csharpVersion: csharp-5 single-line interp (byte-identical fall-through)",
                    "s = $\"a   { b + c }\" ;",
                    "csharp-5",
                    "s=$\"a   { b + c }\";"
                ],
                [
                    "csharpVersion: csharp-5 interp newline (string closes at NL, hole minified)",
                    "m = $\"x\n  { a + b }\" ;",
                    "csharp-5",
                    "m=$\"x{a+b}\" ;"
                ],
                [
                    "csharpVersion: csharp-6 interp newline (ON = auto)",
                    "m = $\"x\n  { a + b }\" ;",
                    "csharp-6",
                    "m=$\"x\n  { a + b }\";"
                ],
                [
                    "csharpVersion: csharp-5 $@ newline (falls to $ + verbatim)",
                    "v = $@\"x\n  { a + b }\" ;",
                    "csharp-5",
                    "v=$@\"x\n  { a + b }\";"
                ],
                [
                    "csharpVersion: csharp-10 $@ newline (ON)",
                    "v = $@\"x\n  { a + b }\" ;",
                    "csharp-10",
                    "v=$@\"x\n  { a + b }\";"
                ],
                [
                    "csharpVersion: csharp-5 @$ newline (falls to @ $ + regular string)",
                    "v = @$\"x\n  { a + b }\" ;",
                    "csharp-5",
                    "v=@$\"x{a+b}\" ;"
                ],
                [
                    "csharpVersion: csharp-10 raw fall-through (adjacent strings)",
                    "r = \"\"\"raw  block\n    indented\"\"\" ;",
                    "csharp-10",
                    "r=\"\"\"raw  block indented\"\"\" ;"
                ],
                [
                    "csharpVersion: csharp-5 raw fall-through",
                    "r = \"\"\"raw  block\n    indented\"\"\" ;",
                    "csharp-5",
                    "r=\"\"\"raw  block indented\"\"\" ;"
                ],
                [
                    "csharpVersion: csharp-11 raw = auto (repeat)",
                    "r = \"\"\"raw  block\n    indented\"\"\" ;",
                    "csharp-11",
                    "r=\"\"\"raw  block\n    indented\"\"\";"
                ],
                [
                    "csharpVersion: csharp-5 verbatim (not gated)",
                    "p = @\"a  b\"\" c\" ;",
                    "csharp-5",
                    "p=@\"a  b\"\" c\";"
                ],
                [
                    "csharpVersion: csharp-6 verbatim (not gated)",
                    "p = @\"a  b\"\" c\" ;",
                    "csharp-6",
                    "p=@\"a  b\"\" c\";"
                ],
                [
                    "csharpVersion: csharp-5 comments ON",
                    "x = 1; // hi\ny = 2;",
                    "csharp-5",
                    "x=1;y=2;"
                ],
                [
                    "csharpVersion: csharp-10 interp + comments ON",
                    "m = $\"x\n{ a }\" ; // n\ny = 2;",
                    "csharp-10",
                    "m=$\"x\n{ a }\";y=2;"
                ],
                [
                    "csharpVersion: empty csharp-5",
                    "",
                    "csharp-5",
                    ""
                ],
                [
                    "csharpVersion: ws-only csharp-11",
                    "   \n",
                    "csharp-11",
                    ""
                ]
            ],
            "dedup": [
                [
                    "dedup lines: dup removed, first kept",
                    "a\nb\na\nc",
                    {
                        "mode": "lines"
                    },
                    {
                        "text": "a\nb\nc",
                        "meta": "1 duplicate line removed"
                    }
                ],
                [
                    "dedup lines: two dups",
                    "x\nx\nx",
                    {
                        "mode": "lines"
                    },
                    {
                        "text": "x",
                        "meta": "2 duplicate lines removed"
                    }
                ],
                [
                    "dedup lines: CRLF line != LF twin (both kept)",
                    "a\r\na\n",
                    {
                        "mode": "lines"
                    },
                    {
                        "text": "a\r\na\n",
                        "meta": "no duplicate lines"
                    }
                ],
                [
                    "dedup lines: CRLF dup removed, CRLF kept",
                    "a\r\nb\na\r\n",
                    {
                        "mode": "lines"
                    },
                    {
                        "text": "a\r\nb\n",
                        "meta": "1 duplicate line removed"
                    }
                ],
                [
                    "dedup lines: blanks exempt (ON default)",
                    "a\n   \na\n\t\na",
                    {
                        "mode": "lines"
                    },
                    {
                        "text": "a\n   \n\t",
                        "meta": "2 duplicate lines removed"
                    }
                ],
                [
                    "dedup lines: blanks deduped (OFF)",
                    "a\n\na\n\n",
                    {
                        "mode": "lines",
                        "ignoreBlank": false
                    },
                    {
                        "text": "a\n",
                        "meta": "3 duplicate lines removed"
                    }
                ],
                [
                    "dedup lines: blanks deduped (OFF), no trailing newline",
                    "a\n\na",
                    {
                        "mode": "lines",
                        "ignoreBlank": false
                    },
                    {
                        "text": "a\n",
                        "meta": "1 duplicate line removed"
                    }
                ],
                [
                    "dedup lines: no dups identity",
                    "a\nb\nc",
                    {
                        "mode": "lines"
                    },
                    {
                        "text": "a\nb\nc",
                        "meta": "no duplicate lines"
                    }
                ],
                [
                    "dedup lines: empty",
                    "",
                    {
                        "mode": "lines"
                    },
                    ""
                ],
                [
                    "dedup lines: ws-only",
                    "   \n\t ",
                    {
                        "mode": "lines"
                    },
                    ""
                ],
                [
                    "dedup lines: single line",
                    "hello",
                    {
                        "mode": "lines"
                    },
                    {
                        "text": "hello",
                        "meta": "no duplicate lines"
                    }
                ],
                [
                    "dedup lines: leading/trailing spaces part of identity",
                    "a \na\n a",
                    {
                        "mode": "lines"
                    },
                    {
                        "text": "a \na\n a",
                        "meta": "no duplicate lines"
                    }
                ],
                [
                    "dedup lines: default opts (empty opts object)",
                    "a\nb\na",
                    {},
                    {
                        "text": "a\nb",
                        "meta": "1 duplicate line removed"
                    }
                ],
                [
                    "dedup blocks: repeated paragraph, separator collapsed to one",
                    "p1\np2\n\np1\np2\n\nq",
                    {
                        "mode": "blocks"
                    },
                    {
                        "text": "p1\np2\n\nq",
                        "meta": "1 duplicate block removed"
                    }
                ],
                [
                    "dedup blocks: two blocks repeated",
                    "a\n\nb\n\na\n\nb",
                    {
                        "mode": "blocks"
                    },
                    {
                        "text": "a\n\nb",
                        "meta": "2 duplicate blocks removed"
                    }
                ],
                [
                    "dedup blocks: one block per run (identity)",
                    "x\ny\nx\nz",
                    {
                        "mode": "blocks"
                    },
                    {
                        "text": "x\ny\nx\nz",
                        "meta": "no duplicate blocks"
                    }
                ],
                [
                    "dedup blocks: repeated single-line block, separator eaten",
                    "x\n\nx\n\ny",
                    {
                        "mode": "blocks"
                    },
                    {
                        "text": "x\n\ny",
                        "meta": "1 duplicate block removed"
                    }
                ],
                [
                    "dedup blocks: ignoreBlank OFF keeps both separators",
                    "a\nb\n\na\nb\n\nq",
                    {
                        "mode": "blocks",
                        "ignoreBlank": false
                    },
                    {
                        "text": "a\nb\n\n\nq",
                        "meta": "1 duplicate block removed"
                    }
                ],
                [
                    "dedup blocks: no dups identity",
                    "a\n\nb\n\nc",
                    {
                        "mode": "blocks"
                    },
                    {
                        "text": "a\n\nb\n\nc",
                        "meta": "no duplicate blocks"
                    }
                ],
                [
                    "dedup blocks: merge across dups (maximal run)",
                    "a\nb\na",
                    {
                        "mode": "blocks"
                    },
                    {
                        "text": "a\nb\na",
                        "meta": "no duplicate blocks"
                    }
                ],
                [
                    "dedup blocks: CRLF identity",
                    "a\r\nb\n\na\r\nb\n\nc",
                    {
                        "mode": "blocks"
                    },
                    {
                        "text": "a\r\nb\n\nc",
                        "meta": "1 duplicate block removed"
                    }
                ],
                [
                    "dedup blocks: empty",
                    "",
                    {
                        "mode": "blocks"
                    },
                    ""
                ],
                [
                    "dedup blocks: ws-only",
                    "   \n",
                    {
                        "mode": "blocks"
                    },
                    ""
                ],
                [
                    "dedup blocks: trailing duplicate at EOF",
                    "a\n\nb\n\na\n\nb",
                    {
                        "mode": "blocks"
                    },
                    {
                        "text": "a\n\nb",
                        "meta": "2 duplicate blocks removed"
                    }
                ]
            ],
            "defaults": {
                "minify": {},
                "limit": {
                    "unit": "chars",
                    "preset": "390000",
                    "custom": 390000
                },
                "strip-html": {},
                "remove-comment": {
                    "language": "auto"
                },
                "remove-extra-space": {
                    "spaces": 1
                },
                "regex-replace": {
                    "pattern": "",
                    "replacement": "",
                    "flags": ""
                },
                "code-minify": {
                    "language": "auto",
                    "version": "auto",
                    "removeComments": true
                },
                "dedup": {
                    "mode": "lines",
                    "ignoreBlank": true
                }
            },
            "desc": {
                "limit presets": [
                    "10,000",
                    "32,000",
                    "100,000",
                    "200,000",
                    "390,000"
                ],
                "limit units": [
                    "chars",
                    "tokens"
                ],
                "limit unit labels": [
                    "Characters (exact)",
                    "Tokens (estimated)"
                ],
                "cm lang order": [
                    "auto",
                    "bash",
                    "c",
                    "csharp",
                    "cpp",
                    "css",
                    "go",
                    "html",
                    "java",
                    "javascript",
                    "json",
                    "kotlin",
                    "markdown",
                    "php",
                    "powershell",
                    "python",
                    "ruby",
                    "rust",
                    "sql",
                    "swift",
                    "typescript"
                ],
                "cm lang labels": [
                    "Auto",
                    "Bash",
                    "C",
                    "C#",
                    "C++",
                    "CSS",
                    "Go",
                    "HTML",
                    "Java",
                    "JavaScript",
                    "JSON",
                    "Kotlin",
                    "Markdown",
                    "PHP",
                    "PowerShell",
                    "Python",
                    "Ruby",
                    "Rust",
                    "SQL",
                    "Swift",
                    "TypeScript"
                ],
                "cm version": [
                    {
                        "value": "auto",
                        "label": "Auto (latest)"
                    },
                    {
                        "value": "csharp-12",
                        "label": "C# 12"
                    },
                    {
                        "value": "csharp-11",
                        "label": "C# 11"
                    },
                    {
                        "value": "csharp-10",
                        "label": "C# 10"
                    },
                    {
                        "value": "csharp-9",
                        "label": "C# 9"
                    },
                    {
                        "value": "csharp-8",
                        "label": "C# 8"
                    },
                    {
                        "value": "csharp-7",
                        "label": "C# 7"
                    },
                    {
                        "value": "csharp-6",
                        "label": "C# 6"
                    },
                    {
                        "value": "csharp-5",
                        "label": "C# 5"
                    }
                ],
                "cm version single": [
                    {
                        "value": "auto",
                        "label": "Auto (latest)"
                    }
                ],
                "rc lang order": [
                    "auto",
                    "auto-multi",
                    "c",
                    "c-sh",
                    "cpp",
                    "css",
                    "go",
                    "html-xml",
                    "java",
                    "js-ts",
                    "json",
                    "kotlin",
                    "markdown",
                    "php",
                    "powershell",
                    "python",
                    "ruby",
                    "rust",
                    "sh",
                    "sql",
                    "swift"
                ],
                "rc lang labels": [
                    "Auto",
                    "Auto-Multi-Language",
                    "C",
                    "C#",
                    "C++",
                    "CSS",
                    "Go",
                    "HTML/XML",
                    "Java",
                    "JS/TypeScript",
                    "JSON",
                    "Kotlin",
                    "Markdown",
                    "PHP",
                    "PowerShell",
                    "Python",
                    "Ruby",
                    "Rust",
                    "sh/bash",
                    "SQL",
                    "Swift"
                ],
                "filter ids": [
                    "minify",
                    "limit",
                    "strip-html",
                    "remove-comment",
                    "remove-extra-space",
                    "remove-emoji",
                    "regex-replace",
                    "code-minify",
                    "dedup"
                ],
                "filter names asc": [
                    "Code minify",
                    "Duplicate line dedup",
                    "Minify",
                    "Output length limit",
                    "Regex find & replace",
                    "Remove comments",
                    "Remove emoji",
                    "Remove extra space",
                    "Strip HTML"
                ],
                "dedup mode": [
                    {
                        "value": "lines",
                        "label": "Lines — exact duplicate lines (first kept)"
                    },
                    {
                        "value": "blocks",
                        "label": "Blocks — exact duplicate runs of consecutive non-blank lines"
                    }
                ]
            }
        };
    var X = { estDet: 5, truncDet: "hello world this is a" };

    // ---------- deep equality (expected's object keys must all match) ----------
    function deepEq(a, b) {
        if (a === b) return true;
        if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
        if (Object.prototype.toString.call(a) !== Object.prototype.toString.call(b)) return false;
        var keys = Object.keys(a);
        for (var i = 0; i < keys.length; i++) {
            var k = keys[i];
            if (!Object.prototype.hasOwnProperty.call(b, k)) return false;
            if (!deepEq(a[k], b[k])) return false;
        }
        return true;
    }

    // ---------- case registry (data only; evaluated in run()) ----------
    var CASES = [];
    function add(s, n, e, op, a) { CASES.push({ s: s, n: n, e: e, op: op, a: a || [] }); }

    // ---- minify (t95 pin set) ----
    V.minify.forEach(function (c) { add("minify", c[0], c[2], "minify", [c[1]]); });
    add("minify", "unterminated quote (consumes to end)", "a\"b c", "minify", ["a \"b c"]);

    // ---- strip-html (t95 + entity edges) ----
    V.strip.forEach(function (c) { add("strip-html", c[0], c[2], "strip", [c[1]]); });
    add("strip-html", "unterminated comment (consumes to end)", "a  ", "strip", ["a <!-- x"]);

    // ---- remove-comment (t95/t138 sets; [name, input, lang, expected]) ----
    V.rcExplicit.forEach(function (c) { add("remove-comment", c[0], c[3], "rc", [c[1], c[2]]); });
    V.rcAuto.forEach(function (c) { add("remove-comment", c[0], c[3], "rc", [c[1], c[2]]); });
    V.rcAutoMulti.forEach(function (c) { add("remove-comment", c[0], c[3], "rc", [c[1], c[2]]); });

    // ---- remove-extra-space (t134; N = 0/1/2/3 + parse edges) ----
    V.res.forEach(function (c) { add("remove-extra-space", c[0], c[2], "res", [c[1], c[3]]); });

    // ---- regex-replace (t104; text + opts -> {text, meta}) ----
    V.regex.forEach(function (c) { add("regex-replace", c[0], c[3], "regex", [c[1], c[2]]); });

    // ---- code-minify (C# + JSONC + 20-language table + auto + identity) ----
    V.cmCSharp.forEach(function (c) { add("code-minify", c[0], c[4], "cm", [c[1], c[2], c[3]]); });
    V.cmJson.forEach(function (c) { add("code-minify", c[0], c[4], "cm", [c[1], c[2], c[3]]); });
    V.cmTable.forEach(function (r) {
        add("code-minify", r[0] + " ON (comment strip)", r[2], "cm", [r[1], r[0], true]);
        add("code-minify", r[0] + " OFF (comments kept)", r[3], "cm", [r[1], r[0], false]);
    });
    V.cmExtra.forEach(function (c) { add("code-minify", c[0], c[4], "cm", [c[1], c[2], c[3]]); });
    V.cmAuto.forEach(function (c) { add("code-minify", c[0], c[2], "cmAuto", [c[1]]); });
    add("code-minify", V.cmSpecial[0][0], V.cmSpecial[0][3], "cmLang", [V.cmSpecial[0][1], V.cmSpecial[0][2]]);
    add("code-minify", V.cmSpecial[1][0], V.cmSpecial[1][3], "cmVersion", [V.cmSpecial[1][1], V.cmSpecial[1][2]]);
    V.cmVersionBands.forEach(function (c) { add("code-minify", c[0], c[3], "cmVersion", [c[1], c[2]]); });
    add("code-minify", "csharpVersion: csharp-5 comments OFF", "x=1;// hi\ny=2;", "cmVerOff", ["x = 1; // hi\ny = 2;", "csharp-5"]);
    add("code-minify", "csharpVersion: version ignored for javascript", "var s=\"a  b\";var t=`tpl  ${ a + b }`;", "jsVer", ["var s = \"a  b\" ;\nvar t = `tpl  ${ a + b }` ;", "csharp-5"]);
    add("code-minify", "csharpVersion: version ignored for c", "x=1;y=2;", "cVer", ["x   =   1 ; // c\ny   =   2 ;", "csharp-11"]);
    add("code-minify", "json output parses to the same value", V.jsonParse, "jsonParse", [V.jsonInput]);

    // ---- json value options (parse->clean->compact, all-off = legacy) ----
    add("code-minify", "jsonOpts: removeNull only", '{"b":{},"c":[],"d":"","e":1}', "jsonOpts", ['{\n  "a": null,\n  "b": {},\n  "c": [],\n  "d": "",\n  "e": 1\n}', { language: "json", removeComments: true, removeNull: true }]);
    add("code-minify", "jsonOpts: all 4", '{"e":1}', "jsonOpts", ['{"a": null, "b": {}, "c": [], "d": "", "e": 1}', { language: "json", removeComments: true, removeNull: true, removeEmptyObject: true, removeEmptyArray: true, removeEmptyString: true }]);
    add("code-minify", "jsonOpts: nested cascade empties the root", "", "jsonOpts", ['{"a":{"b":null},"c":[]}', { language: "json", removeComments: true, removeNull: true, removeEmptyArray: true, removeEmptyObject: true }]);
    add("code-minify", "jsonOpts: array cascade", "[1]", "jsonOpts", ['[{"x":null},1,""]', { language: "json", removeComments: true, removeNull: true, removeEmptyString: true, removeEmptyObject: true }]);
    add("code-minify", "jsonOpts: root null removed", "", "jsonOpts", ["null", { language: "json", removeComments: true, removeNull: true }]);
    add("code-minify", "jsonOpts: parse failure keeps collapsed", "{bad json", "jsonOpts", ["{bad json", { language: "json", removeComments: true, removeNull: true }]);
    add("code-minify", "jsonOpts: 0 and false never drop", '{"n":0,"b":false}', "jsonOpts", ['{"n":0,"b":false,"z":null}', { language: "json", removeComments: true, removeNull: true, removeEmptyObject: true, removeEmptyArray: true, removeEmptyString: true }]);
    add("code-minify", "jsonOpts: all OFF = legacy collapse", '{"a":null,"b":{},"c":[],"d":"","e":1}', "jsonOpts", ['{"a": null, "b": {}, "c": [], "d": "", "e": 1}', { language: "json", removeComments: true, removeNull: false, removeEmptyObject: false, removeEmptyArray: false, removeEmptyString: false }]);
    add("code-minify", "jsonOpts: descriptor 4 json-only OFF checkboxes", "ok", "jsonOptsDesc");

    // ---- markdown plain-text option (OFF = legacy byte-exact) ----
    add("code-minify", "mdPlain: heading + blockquote + lists", "Title\nquote\nitem\nfirst", "mdPlain", ["# Title\n> quote\n- item\n1. first"]);
    add("code-minify", "mdPlain: emphasis + code + strike", "bold and it here\ncode here\ngone stripped", "mdPlain", ["**bold** and *it* here\n`code` here\n~~gone~~ stripped"]);
    add("code-minify", "mdPlain: link + image", "link and alt", "mdPlain", ["[link](http://x/y) and ![alt](http://z)"]);
    add("code-minify", "mdPlain: table (separator dropped)", "a b\n1 2", "mdPlain", ["| a | b |\n| --- | :---: |\n| 1 | 2 |"]);
    add("code-minify", "mdPlain: fence content kept", "let x = **not** md;", "mdPlain", ["```js\nlet x = **not** md;\n```"]);
    add("code-minify", "mdPlain: in-word underscores kept", "a_b_c stays", "mdPlain", ["a_b_c stays"]);
    add("code-minify", "mdPlain: comment + raw tag + hr", "visible\n\nwrapped", "mdPlain", ["<!-- hidden -->visible\n<hr>\nwrapped"]);
    add("code-minify", "mdPlain: plain prose identity", "Just plain text.", "mdPlain", ["Just plain text."]);
    add("code-minify", "mdPlain: OFF = legacy byte-exact", true, "mdPlainOff", ["# Title\n**bold** text\n[link](http://x)"]);
    add("code-minify", "mdPlain: descriptor markdown-only OFF checkbox", "ok", "mdPlainDesc");

    // ---- emoji (sequence -> one space, zero-emoji identity) ----
    add("emoji", "emoji: lone emoji -> one space", "a   b", "emoji", ["a \uD83D\uDE00 b"]);
    add("emoji", "emoji: trailing check -> space", "100% done  ", "emoji", ["100% done \u2705"]);
    add("emoji", "emoji: flag pair = one sequence", "  flag", "emoji", ["\uD83C\uDDE6\uD83C\uDDE8 flag"]);
    add("emoji", "emoji: ZWJ family = one sequence", "  family", "emoji", ["\uD83D\uDC68\u200D\uD83D\uDC69\u200D\uD83D\uDC67 family"]);
    add("emoji", "emoji: skin tone attached", "  up", "emoji", ["\uD83D\uDC4D\uD83C\uDFFD up"]);
    add("emoji", "emoji: VS16 attached", "  warn", "emoji", ["\u26A0\uFE0F warn"]);
    add("emoji", "emoji: zero emoji identity", "hello world 123", "emoji", ["hello world 123"]);
    add("emoji", "emoji: quoted string (string-agnostic)", "\" \"", "emoji", ['"\uD83D\uDE03"']);
    add("emoji", "emoji: three in a row -> three spaces", "   ", "emoji", ["\uD83D\uDE00\uD83D\uDE00\uD83D\uDE00"]);
    add("emoji", "emoji: non-emoji symbols kept", "a \u2194 b \u2460 100%", "emoji", ["a \u2194 b \u2460 100%"]);
    add("emoji", "emoji: whitespace-only -> empty", "", "emoji", ["   "]);
    add("emoji", "emoji: descriptor name", "Remove emoji", "emojiName");

    // ---- pane status (readouts left-anchored) ----
    add("paneStatus", "posLeft: readouts left-anchored before .pane-controls", true, "posLeft");

    // ---- dedup (t154: lines + blocks modes, byte-exact) ----
    V.dedup.forEach(function (c) { add("dedup", c[0], c[3], "dedup", [c[1], c[2]]); });
    add("dedup", "descriptor: name", "Duplicate line dedup", "dedupName");
    add("dedup", "descriptor: status", true, "dedupStatus");
    add("dedup", "descriptor: mode choices (exact)", V.desc["dedup mode"], "dedupMode");
    add("dedup", "descriptor: checkbox", "ignoreBlank|Ignore blank lines", "dedupCheckbox");

    // ---- tokens (t131 invariants) ----
    var EST = [
        ["empty", "", 0], ["whitespace only", "   \n\t ", 0],
        ["word len3", "abc", 1], ["word len4", "abcd", 1],
        ["word len5", "abcde", 2], ["word len8", "abcdefgh", 2],
        ["word len9", "abcdefghi", 3], ["word len12", "abcdefghijkl", 3],
        ["underscore word", "a_b_c_d", 2], ["digit run", "123456", 2],
        ["symbol len1", "=", 1], ["symbol len2", "==", 1],
        ["symbol len3", "===", 2], ["symbol len4", "====", 2],
        ["symbol len5", "=====", 3], ["'a b' ws attaches", "a b", 2],
        ["'hello world'", "hello world", 4],
        ["determinism", "x = 1 + 2", X.estDet]
    ];
    EST.forEach(function (c) { add("tokens", "estimate: " + c[0], c[2], "tokEst", [c[1]]); });
    add("tokens", "estimate: append-monotonic (non-decreasing)", true, "tokMono", ["the quick brown fox jumps over 13 lazy dogs ==="]);
    add("tokens", "chunks: join reproduces input", "a  b\t= c", "tokChunks", ["a  b\t= c"]);
    add("tokens", "chunks: empty", "", "tokChunks", [""]);
    var TR = [
        ["'aaa bbb ccc' @1", "aaa bbb ccc", 1, "aaa"],
        ["'aaa bbb ccc' @2", "aaa bbb ccc", 2, "aaa bbb"],
        ["'aaa bbb ccc' @3", "aaa bbb ccc", 3, "aaa bbb ccc"],
        ["single chunk cost2 @1 -> ''", "hello", 1, ""],
        ["'a = b' @1 (trailing ws stripped)", "a = b", 1, "a"],
        ["'a = b' @2", "a = b", 2, "a ="],
        ["whitespace-only fits -> ''", "   ", 5, ""],
        ["' a' @1 (byte-exact prefix)", " a", 1, " a"],
        ["covers all @10", "a b c", 10, "a b c"],
        ["budget 0", "a b", 0, ""],
        ["budget negative", "a b", -5, ""],
        ["empty input", "", 5, ""],
        ["determinism @7", "hello world this is a test of chunk boundary cutting", 7, X.truncDet]
    ];
    TR.forEach(function (c) { add("tokens", "truncate: " + c[0], c[3], "tokTrunc", [c[1], c[2]]); });

    // ---- limit (t131: chars legacy + tokens unit + descriptors) ----
    var LIM = [
        ["chars: short unchanged", "hello", { preset: "10000", custom: 10000 }, null, { text: "hello", truncated: false }],
        ["chars: boundary equal -> no trunc", "12345", { preset: "custom", custom: 5 }, null, { text: "12345", truncated: false }],
        ["chars: cut", "1234567890", { preset: "custom", custom: 4 }, null, { text: "1234", truncated: true }],
        ["chars: preset 10000 cut length", "z".repeat(15000), { preset: "10000", custom: 15000 }, "len", 10000],
        ["chars: preset 10000 truncated flag", "z".repeat(15000), { preset: "10000", custom: 15000 }, "flag", true],
        ["chars: 9999 under 10000 -> no cut", "z".repeat(9999), { preset: "10000", custom: 15000 }, "flag", false],
        ["chars: old save (no unit key)", "abcdefgh", { preset: "custom", custom: 3 }, null, { text: "abc", truncated: true }],
        ["chars: explicit unit", "abcdefgh", { unit: "chars", preset: "custom", custom: 3 }, null, { text: "abc", truncated: true }],
        ["no opts -> identity", "anything", null, null, { text: "anything", truncated: false }],
        ["empty text -> identity", "", { unit: "tokens", preset: "custom", custom: 5 }, null, { text: "", truncated: false }],
        ["tokens: cut 2 of 3", "aaa bbb ccc", { unit: "tokens", preset: "custom", custom: 2 }, null, { text: "aaa bbb", truncated: true }],
        ["tokens: fits exactly", "aaa bbb ccc", { unit: "tokens", preset: "custom", custom: 3 }, null, { text: "aaa bbb ccc", truncated: false }],
        ["tokens: budget 1", "aaa bbb ccc", { unit: "tokens", preset: "custom", custom: 1 }, null, { text: "aaa", truncated: true }],
        ["tokens: budget below first chunk", "hello there", { unit: "tokens", preset: "custom", custom: 1 }, null, { text: "", truncated: true }],
        ["tokens vs chars: same text differs", "aaaa aaaa aaaa", { preset: "custom", custom: 2 }, null, { text: "aa" }],
        ["tokens: chunk-boundary of same text", "aaaa aaaa aaaa", { unit: "tokens", preset: "custom", custom: 2 }, null, { text: "aaaa aaaa" }]
    ];
    LIM.forEach(function (c) {
        var a = [c[1], c[2]];
        if (c[3]) a.push(c[3]);
        add("limit", c[0], c[4], "limit", a);
    });
    add("limit", "custom: invalid custom number -> identity (no cut)", { text: "xxxxxxxxxxxxxxxxxxxx", truncated: false }, "limit", ["xxxxxxxxxxxxxxxxxxxx", { preset: "custom", custom: "abc" }]);
    add("limit", "descriptor: preset labels (unit-neutral)", V.desc["limit presets"], "limitPresets");
    add("limit", "descriptor: units + labels", { values: V.desc["limit units"], labels: V.desc["limit unit labels"] }, "limitUnits");
    add("code-minify", "descriptor: 21 language options (exact order + labels)", { order: V.desc["cm lang order"], labels: V.desc["cm lang labels"] }, "cmLangs");
    // The Version select's `choices` is a FUNCTION of the
    // card options — C# → the 9 bands, every other language (incl.
    // Auto) → the single "Auto (latest)" option.
    add("code-minify", "descriptor: version choices is a function of the card options", true, "cmVerIsFn");
    add("code-minify", "descriptor: version(csharp) = 9 options (auto + C# 12…5, exact order + labels)", V.desc["cm version"], "cmVerCs");
    add("code-minify", "descriptor: version(ruby) = single option Auto (latest)", V.desc["cm version single"], "cmVerRuby");
    add("code-minify", "descriptor: version(auto) = single option Auto (latest)", V.desc["cm version single"], "cmVerAuto");
    add("code-minify", "behaviour: legacy csharp-9 + ruby converges to auto at render", true, "cmLegacyConverge");
    add("code-minify", "behaviour: language toggle rebuilds the version select (band not sticky)", true, "cmToggle");
    add("code-minify", "layout: every option renders on its own row (Language/Version stacked; limit Unit + Max length rows)", true, "optRows");
    add("code-minify", "layout: hidden options hide their WHOLE row (auto/json/markdown visibility)", { auto: [1, 0, 0, 0, 0, 0], json: [1, 1, 1, 1, 1, 0], markdown: [1, 0, 0, 0, 0, 1] }, "optVisRows");
    add("remove-comment", "descriptor: 21 options (exact order + labels)", { order: V.desc["rc lang order"], labels: V.desc["rc lang labels"] }, "rcLangs");

    // ---- defaults (every filter's defaultOptions, byte-exact) ----
    Object.keys(V.defaults).forEach(function (id) {
        add("defaults", "defaults: " + id, V.defaults[id], "defaults", [id]);
    });

    // ---- registry (ids + meta pass-through, pure) ----
    add("registry", "registry: 9 filters registered", V.desc["filter ids"], "filterIds");
    add("registry", "registry: metas pass-through (regex card only)", { text: "a# b#", metas: [{ index: 0, meta: "2 replacements" }] }, "registryMetas", ["a1 b22", [{ id: "regex-replace", options: { pattern: "\\d+", replacement: "#" } }]]);
    add("registry", "registry: mixed recipe (minify + regex) metas at index 1", { text: "a B", metas: [{ index: 1, meta: "1 replacement" }] }, "registryMetas", ["a   b", [{ id: "minify", options: {} }, { id: "regex-replace", options: { pattern: "b", replacement: "B" } }]]);
    add("registry", "registry: unknown filter id is skipped (input unchanged)", { text: "x", truncated: false, metas: [] }, "registryUnknown", ["x", [{ id: "no-such-filter", options: {} }]]);

    // ---- pipeline (t132: prefix NEVER minified — real io.recompute) ----
    var PIPE = [
        ["P1 + 'x   =   1' [minify] -> 'P1\nx=1'", "P1", "x   =   1", [{ id: "minify", options: {} }], { output: "P1\nx=1", truncated: false }],
        ["empty prefix = legacy anchor", "", "x   =   1", [{ id: "minify", options: {} }], { output: "x=1", truncated: false }],
        ["prefix whitespace PRESERVED", "P  x\n\n", "a  b", [{ id: "minify", options: {} }], { output: "P  x\n\n\na b", truncated: false }],
        ["empty input + prefix -> prefix only", "SOLO PROMPT", "", [{ id: "minify", options: {} }], { output: "SOLO PROMPT", truncated: false }],
        ["both empty", "", "", [{ id: "minify", options: {} }], { output: "", truncated: false }],
        ["prefix + limit: body truncated, prefix raw", "KEEP", "1234567890", [{ id: "limit", options: { preset: "custom", custom: 4, unit: "chars" } }], { output: "KEEP\n1234", truncated: true }],
        ["minify-hostile prefix stays raw", "a   \"b\"   c", "x   =   1", [{ id: "minify", options: {} }], { output: "a   \"b\"   c\nx=1", truncated: false }],
        ["no limit -> badge stays hidden", "P", "a b", [{ id: "minify", options: {} }], { output: "P\na b", truncated: false }],
        ["counters: raw panes + final output", "ABC", "x   =   1", [{ id: "minify", options: {} }], { output: "ABC\nx=1", truncated: false, prefixCount: "3 chars", inputCount: "9 chars", outputCount: "7 chars" }],
        ["strip-html body + raw prefix", "P", "<div class=\"a\">Hi&nbsp;&amp;&lt;x&gt;</div><!-- c -->", [{ id: "strip-html", options: {} }], { output: "P\n Hi &<x>  ", truncated: false }]
    ];
    PIPE.forEach(function (c) { add("pipeline", c[0], c[4], "pipeline", [c[1], c[2], c[3]]); });

    // ---- save model (real Save/Load buttons + prompt stub) ----
    add("save model", "save: v3 hard shape exact (no input, no theme)", true, "saveShape");
    add("save model", "save: soft v2 shape (persistNow)", true, "softShape");
    add("save model", "load-empty: prefix+recipe reset, input+theme kept", true, "loadEmpty");
    add("save model", "load: hard save keeps input+theme", true, "loadKeeps");
    add("save model", "save: a dedup card round-trips with options intact", true, "dedupSave");
    add("save model", "collapse: apm.ui.leftCollapsed is boolean-or-null", true, "collapseKey");
    add("save model", "import: valid map replaces the saves", true, "importValid");
    add("save model", "import: invalid entries skipped, the good one kept", true, "importSkipped");
    add("save model", "import: bad root (array) leaves saves untouched", true, "importBadRoot");
    add("save model", "import: legacy {name: prefix} map accepted (empty skipped)", true, "importLegacy");
    add("save model", "legacy: prefixPresets migrate to v3 saves (collision kept, key removed)", true, "legacyMigrate");
    add("save model", "legacy: no legacy keys -> no-op, saves untouched", true, "legacyMigrateNone");
    add("save model", "legacy: lastPrefix seeds apm.lastState when absent", true, "legacyResume");
    add("save model", "legacy: empty soft save yields to lastPrefix resume", true, "legacyResumeEmpty");
    add("save model", "legacy: non-empty apm.lastState wins, lastPrefix untouched", true, "legacyResumeKeeps");

    // ---- theme (independent auto-saved setting) ----
    add("theme", "theme: 4 themes, '' = Dark default", { "": "Dark", light: "Light", midnight: "Midnight", paper: "Paper" }, "themeNames");
    add("theme", "theme: apm.theme key holds a valid name", true, "themeKey");

    // ---- palette (DOM order = ASC names) ----
    add("palette", "palette: DOM order = 9 names ASC", V.desc["filter names asc"], "paletteOrder");
    add("palette", "palette: count badge = (9)", "(9)", "paletteCount");
    // search = name + desc + keywords — the short descs stay
    // searchable through the search-only `keywords` field.
    add("palette", "palette: search 'ruby' → Code minify + Remove comments", ["Code minify", "Remove comments"], "paletteSearch", ["ruby"]);
    add("palette", "palette: search 'c#' → Code minify + Remove comments", ["Code minify", "Remove comments"], "paletteSearch", ["c#"]);
    add("palette", "palette: search 'json' → Code minify + Remove comments", ["Code minify", "Remove comments"], "paletteSearch", ["json"]);
    add("palette", "palette: search 'whitespace' → 3 cards (name-ASC)", ["Code minify", "Minify", "Remove extra space"], "paletteSearch", ["whitespace"]);
    add("palette", "palette: search 'token' → Output length limit only", ["Output length limit"], "paletteSearch", ["token"]);
    add("palette", "palette: search 'fortran' → zero hits", [], "paletteSearch", ["fortran"]);

    // ---- focusTrap (modal trap + focus return — DOM drivers) ----
    add("focusTrap", "focusTrap: open → focus lands on the JSON textarea", true, "ftOpen");
    add("focusTrap", "focusTrap: Tab cycles forward inside the modal", true, "ftTabFwd");
    add("focusTrap", "focusTrap: Shift+Tab wraps to the last element", true, "ftShiftWrap");
    add("focusTrap", "focusTrap: Tab wraps to the first element", true, "ftTabWrap");
    add("focusTrap", "focusTrap: import view adds the import-row buttons to the cycle", true, "ftImportView");
    add("focusTrap", "focusTrap: Close button → focus returns to the trigger", true, "ftCloseBtn");
    add("focusTrap", "focusTrap: Esc → focus returns to the trigger", true, "ftEsc");
    add("focusTrap", "focusTrap: overlay click → focus returns to the trigger", true, "ftOverlay");
    add("focusTrap", "focusTrap: import-row Close → focus returns to the trigger", true, "ftImportClose");
    add("focusTrap", "focusTrap: trap detached after close (Tab no longer trapped)", true, "ftNoLeak");

    // ---- paneStatus (line/caret/selection display, pins computed
    //      from the io.js contract math — never eyeballed) ----
    add("paneStatus", "paneStatus: empty panes, none focused — base only", { p: "0 ln", i: "0 ln", o: "0 ln" }, "psBase");
    add("paneStatus", "paneStatus: input focused, caret at start", { p: "0 ln", i: "1 ln · Ln 1, Col 1", o: "1 ln" }, "psCaretStart");
    add("paneStatus", "paneStatus: input focused, caret on line 2", { p: "0 ln", i: "3 ln · Ln 2, Col 1", o: "1 ln" }, "psCaretLine2");
    add("paneStatus", "paneStatus: input selection across two lines", { p: "0 ln", i: "2 ln · Ln 1, Col 2 – Ln 2, Col 2 · 3 ch", o: "1 ln" }, "psSel");
    add("paneStatus", "paneStatus: prefix focused (empty pane)", { p: "0 ln · Ln 1, Col 1", i: "1 ln", o: "1 ln" }, "psPrefix");
    add("paneStatus", "paneStatus: readonly output behaves identically (2-line string output)", { p: "0 ln", i: "2 ln", o: "2 ln · Ln 1, Col 2 – Ln 2, Col 2 · 4 ch" }, "psOutput");
    add("paneStatus", "paneStatus: blur reverts to base only", { p: "0 ln", i: "2 ln", o: "2 ln" }, "psBlur");
    add("paneStatus", "paneStatus: zero pipeline impact (pinned doc)", "x=1", "psNoImpact");

    // ---- splits (resizable columns + peek width; the clamp pins are
    //      CONTRACT-FLOOR INVARIANTS (220/250/320/250px/60% from
    //      scripts/ui/splits.js) checked against the LIVE context size —
    //      viewport-independent, never a fixed-width pin, never eyeballed) ----
    add("splits", "splits: defaults (absent key) = 24%/26%", { f: "24%", r: "26%" }, "spDefaults");
    add("splits", "splits: setPair persists the {f,r} % shape", { f: "30%", r: "34%" }, "spShape");
    add("splits", "splits: clamp — tiny values hit the 220/250px floors (any viewport)", true, "spClampSmall");
    add("splits", "splits: clamp — huge values keep io ≥ 320px (any viewport)", true, "spClampHuge");
    add("splits", "splits: clearPersisted → defaults + key gone + inline vars dropped", true, "spReset");
    add("splits", "splits: peek clamp — 250px min / 60% max (any viewport)", true, "spPeek");
    add("splits", "splits: hard save shape unchanged after a resize", true, "spProfileExempt");
    add("splits", "splits: soft save shape unchanged after a resize", true, "spSoftExempt");

    // ---- panes (vertically resizable I/O panes; apm.ui.panes,
    //      per-browser, profile-exempt) ----
    add("panes", "panes: defaults = {p: 18%, i: 41%}", { p: "18%", i: "41%" }, "pnDefaults");
    add("panes", "panes: setPanes persists the {p,i} % shape", { p: "30%", i: "40%" }, "pnShape");
    add("panes", "panes: clamp — 90/90 at 400px still leaves all three floors", true, "pnClamp");
    add("panes", "panes: double-click reset → defaults + key gone + vars dropped", true, "pnReset");
    add("panes", "panes: keyboard ArrowDown = +10px on the input pane", true, "pnKey");
    add("panes", "panes: malformed stored value → defaults", { p: "18%", i: "41%" }, "pnMalformed");
    add("panes", "panes: hard save shape unchanged after a resize", true, "pnProfileExempt");

    // ---------- app drivers (state-touching ops) ----------
    function withPrompt(value, fn) {
        var orig = window.prompt;
        window.prompt = function () { return value; };
        try { return fn(); } finally { window.prompt = orig; }
    }

    function pipeline(prefix, input, recipe) {
        APM.state.prefix = prefix;
        APM.state.input = input;
        APM.state.recipe = JSON.parse(JSON.stringify(recipe));
        APM.dom.$("prefix").value = prefix;
        APM.dom.$("input").value = input;
        APM.recipe.render();
        APM.io.recompute();
        var $ = APM.dom.$;
        return {
            output: $("output").value,
            truncated: !$("truncated-badge").hidden,
            prefixCount: $("prefix-count").textContent,
            inputCount: $("input-count").textContent,
            outputCount: $("output-count").textContent
        };
    }

    function saveShape() {
        var NAME = "__apmtest_save__";
        APM.state.prefix = "TP";
        APM.state.recipe = [
            { id: "minify", options: {} },
            { id: "code-minify", options: { language: "csharp", removeComments: false } }
        ];
        APM.recipe.render();
        withPrompt(NAME, function () { APM.dom.$("save-btn").click(); });
        var snap = (APM.storage.get("apm.saves") || {})[NAME];
        return !!(snap && typeof snap === "object" &&
            Object.keys(snap).sort().join(",") === "name,prefix,recipe,savedAt,version" &&
            snap.version === 3 && snap.name === NAME && snap.prefix === "TP" &&
            Array.isArray(snap.recipe) && snap.recipe.length === 2 &&
            snap.recipe[1].options.language === "csharp" && snap.recipe[1].options.removeComments === false);
    }

    function softShape() {
        APM.state.prefix = "SP";
        APM.state.input = "SI";
        APM.state.recipe = [{ id: "minify", options: {} }];
        APM.saves.persistNow();
        var ls = APM.storage.get("apm.lastState");
        return !!(ls && typeof ls === "object" &&
            Object.keys(ls).sort().join(",") === "input,prefix,recipe,savedAt,version" &&
            ls.version === 2 && ls.prefix === "SP" && ls.input === "SI" && Array.isArray(ls.recipe));
    }

    function loadEmpty() {
        APM.theme.apply("midnight");
        APM.state.prefix = "OLD-P";
        APM.dom.$("prefix").value = "OLD-P";
        APM.state.input = "KEEP-ME-INPUT";
        APM.dom.$("input").value = "KEEP-ME-INPUT";
        APM.state.recipe = [{ id: "strip-html", options: {} }];
        APM.recipe.render();
        APM.io.recompute();
        APM.dom.$("save-list").value = "";
        APM.dom.$("load-btn").click();
        return !!(APM.state.prefix === "" &&
            JSON.stringify(APM.state.recipe) === JSON.stringify([{ id: "minify", options: {} }]) &&
            APM.state.input === "KEEP-ME-INPUT" &&
            APM.dom.$("input").value === "KEEP-ME-INPUT" &&
            APM.theme.current() === "midnight");
    }

    function loadKeeps() {
        var NAME = "__apmtest_load__";
        APM.state.prefix = "LP";
        APM.state.recipe = [{ id: "minify", options: {} }];
        APM.recipe.render();
        withPrompt(NAME, function () { APM.dom.$("save-btn").click(); });
        APM.theme.apply("paper");
        APM.state.input = "KEEP-INPUT-2";
        APM.dom.$("save-list").value = NAME;
        APM.dom.$("load-btn").click();
        return !!(APM.state.input === "KEEP-INPUT-2" &&
            APM.theme.current() === "paper" &&
            APM.state.prefix === "LP" &&
            APM.state.recipe.length === 1 && APM.state.recipe[0].id === "minify");
    }

    function dedupSave() {
        var NAME = "__apmtest_dedup__";
        APM.state.prefix = "DP";
        APM.state.recipe = [
            { id: "minify", options: {} },
            { id: "dedup", options: { mode: "blocks", ignoreBlank: false } }
        ];
        APM.recipe.render();
        withPrompt(NAME, function () { APM.dom.$("save-btn").click(); });
        var snap = (APM.storage.get("apm.saves") || {})[NAME];
        if (!snap || snap.version !== 3) return false;
        APM.dom.$("save-list").value = NAME;
        APM.dom.$("load-btn").click();
        var r = APM.state.recipe;
        return !!(r.length === 2 && r[1].id === "dedup" &&
            r[1].options.mode === "blocks" && r[1].options.ignoreBlank === false &&
            APM.state.prefix === "DP");
    }

    function collapseKey() {
        var v = APM.storage.get("apm.ui.leftCollapsed");
        return v === null || typeof v === "boolean";
    }

    // ---- import-validation drivers (real modal flow; the runner's
    //      capture/restore owns the user's apm.saves either way) ----
    function importDrive(raw, accept) {
        var orig = window.confirm;
        window.confirm = function () { return accept; };
        try {
            APM.dom.$("saves-json").value = raw;
            APM.dom.$("saves-import-confirm").click();
        } finally {
            window.confirm = orig;
        }
    }
    function importValid() {
        importDrive('{"ok": {"prefix": "P", "recipe": [{"id": "minify", "options": {}}]}}', true);
        var s = APM.storage.get("apm.saves") || {};
        return Object.keys(s).length === 1 && !!s.ok && s.ok.prefix === "P" &&
            s.ok.recipe.length === 1 && s.ok.recipe[0].id === "minify";
    }
    function importSkipped() {
        importDrive('{"bad1": {"prefix": 42}, "bad2": {"recipe": [{"id": "nope"}]}, "good": {"prefix": "G"}}', true);
        var s = APM.storage.get("apm.saves") || {};
        return Object.keys(s).length === 1 && !!s.good && s.good.prefix === "G";
    }
    function importBadRoot() {
        var before = APM.storage.get("apm.saves");
        importDrive("[1,2]", false);
        return JSON.stringify(APM.storage.get("apm.saves")) === JSON.stringify(before);
    }
    function importLegacy() {
        importDrive('{"Python Guru": "You are a Python guru.", "empty": ""}', true);
        var s = APM.storage.get("apm.saves") || {};
        var p = s["Python Guru"];
        return Object.keys(s).length === 1 && !!p && p.prefix === "You are a Python guru." &&
            p.recipe.length === 1 && p.recipe[0].id === "minify";
    }

    // ---- legacy-migration drivers (old app: prefixPresets JSON map +
    //      raw lastPrefix string; the runner capture/restore owns both
    //      legacy keys so the tests never touch real user data) ----
    function legacyMigrate() {
        // Deterministic start: exactly one existing save "keep" (the
        // runner's restore puts the user's saves back afterwards).
        APM.storage.set("apm.saves", { keep: { version: 3, savedAt: "2026-01-01T00:00:00.000Z", name: "keep", prefix: "KEEP", recipe: [{ id: "strip-html", options: {} }] } });
        try { localStorage.setItem("prefixPresets", JSON.stringify({ keep: "OLD-KEEP", "Java Expert": "You are a Java expert." })); } catch (err) { return false; }
        var r = APM.saves.migrateLegacy();
        var s = APM.storage.get("apm.saves") || {};
        var j = s["Java Expert"];
        return !!(r.migrated === 1 && r.collisions === 1 &&
            s.keep && s.keep.prefix === "KEEP" && s.keep.recipe[0].id === "strip-html" &&
            j && j.version === 3 && j.name === "Java Expert" && j.prefix === "You are a Java expert." &&
            j.recipe.length === 1 && j.recipe[0].id === "minify" &&
            APM.storage.rawGet("prefixPresets") === null);
    }
    function legacyMigrateNone() {
        APM.storage.rawRemove("prefixPresets");
        APM.storage.rawRemove("lastPrefix");
        var before = JSON.stringify(APM.storage.get("apm.saves"));
        var r = APM.saves.migrateLegacy();
        return !!(r.migrated === 0 && r.collisions === 0 &&
            JSON.stringify(APM.storage.get("apm.saves")) === before);
    }
    function legacyResume() {
        APM.storage.rawRemove("apm.lastState");
        try { localStorage.setItem("lastPrefix", "You are a helpful expert."); } catch (err) { return false; }
        var r = APM.saves.migrateLegacy();
        var ls = APM.storage.get("apm.lastState");
        return !!(r.resumed === true && ls && ls.version === 2 &&
            ls.prefix === "You are a helpful expert." && ls.input === "" &&
            ls.recipe.length === 1 && ls.recipe[0].id === "minify" &&
            APM.storage.rawGet("lastPrefix") === null);
    }
    function legacyResumeEmpty() {
        // An empty auto-persisted state must not hide the old prefix.
        APM.storage.set("apm.lastState", { version: 2, savedAt: "2026-01-03T00:00:00.000Z", prefix: "", input: "", recipe: [{ id: "minify", options: {} }] });
        try { localStorage.setItem("lastPrefix", "Your OLD prefix text."); } catch (err) { return false; }
        var r = APM.saves.migrateLegacy();
        var ls = APM.storage.get("apm.lastState");
        return !!(r.resumed === true && ls && ls.prefix === "Your OLD prefix text." && ls.input === "" &&
            APM.storage.rawGet("lastPrefix") === null);
    }
    function legacyResumeKeeps() {
        // An existing soft save must win; the stale lastPrefix stays.
        var mine = { version: 2, savedAt: "2026-01-02T00:00:00.000Z", prefix: "NEW-P", input: "NEW-I", recipe: [{ id: "strip-html", options: {} }] };
        APM.storage.set("apm.lastState", mine);
        try { localStorage.setItem("lastPrefix", "OLD-P"); } catch (err) { return false; }
        var r = APM.saves.migrateLegacy();
        var ls = APM.storage.get("apm.lastState");
        return !!(r.resumed === false && ls && ls.prefix === "NEW-P" && ls.input === "NEW-I" &&
            APM.storage.rawGet("lastPrefix") === "OLD-P");
    }

    function themeNames() { return APM.theme.names; }

    function themeKey() {
        var t = APM.storage.get("apm.theme");
        return typeof t === "string" && Object.prototype.hasOwnProperty.call(APM.theme.names, t);
    }

    function paletteOrder() {
        var $ = APM.dom.$;
        var q = $("filter-search").value;
        APM.palette.render("");
        var names = Array.prototype.map.call($("filter-list").querySelectorAll("li"), function (li) {
            return li.querySelector(".op-name").textContent;
        });
        $("filter-search").value = q;
        APM.palette.render(q);
        return names;
    }

    function paletteCount() { return APM.dom.$("filter-count").textContent; }

    function paletteSearch(term) {
        var $ = APM.dom.$;
        var q = $("filter-search").value;
        APM.palette.render(term);
        var names = Array.prototype.map.call($("filter-list").querySelectorAll("li"), function (li) {
            return li.querySelector(".op-name").textContent;
        });
        $("filter-search").value = q;
        APM.palette.render(q);
        return names;
    }

    // ---- panes drivers (vertically resizable I/O panes) ----
    function pnDefaults() {
        APM.splits.clearPanes();
        return APM.splits.readPanes();
    }
    function pnShape() {
        APM.splits.setPanes(30, 40);
        var s = APM.storage.get("apm.ui.panes");
        APM.splits.clearPanes();
        return s;
    }
    function pnClamp() {
        // px-floor invariant (viewport-independent): at 400px height,
        // asking for 90/90 must still leave all three panes at/above
        // their floors (60/120/120) minus the two 5px gutters.
        var io = APM.dom.$("io");
        var old = io.style.height;
        io.style.height = "400px";
        var v = APM.splits.setPanes(90, 90);
        var h = io.clientHeight;
        var pPx = parseFloat(v.p) / 100 * h;
        var iPx = parseFloat(v.i) / 100 * h;
        var oPx = h - pPx - iPx - 10;
        io.style.height = old;
        APM.splits.clearPanes();
        return pPx >= 59.5 && iPx >= 119.5 && oPx >= 119.5;
    }
    function pnReset() {
        APM.splits.setPanes(25, 35);
        APM.dom.$("pane-split-prefix").dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
        return !!(APM.storage.get("apm.ui.panes") === null &&
            APM.splits.readPanes().p === "18%" && APM.splits.readPanes().i === "41%" &&
            getComputedStyle(APM.dom.$("prefix-pane")).flexBasis === "18%");
    }
    function pnKey() {
        APM.splits.clearPanes();
        var el = APM.dom.$("pane-split-input");
        el.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true }));
        var h = APM.dom.$("io").clientHeight;
        var s = APM.splits.readPanes();
        var ok = Math.abs(parseFloat(s.i) - (41 + 10 / h * 100)) < 0.2 &&
            Math.abs(parseFloat(s.p) - 18) < 0.2;
        APM.splits.clearPanes();
        return !!ok;
    }
    function pnMalformed() {
        APM.storage.set("apm.ui.panes", { p: 12, i: "banana" });
        var s = APM.splits.readPanes();
        try { localStorage.removeItem("apm.ui.panes"); } catch (e) { /* blocked */ }
        return s; // the read-back object — malformed in, defaults out
    }
    function pnProfileExempt() {
        APM.splits.setPanes(28, 39);
        var NAME = "__apmtest_panes__";
        APM.state.recipe = [{ id: "minify", options: {} }];
        APM.recipe.render();
        withPrompt(NAME, function () { APM.dom.$("save-btn").click(); });
        var snap = (APM.storage.get("apm.saves") || {})[NAME];
        APM.splits.clearPanes();
        return !!(snap && snap.version === 3 &&
            JSON.stringify(Object.keys(snap).sort()) === JSON.stringify(["name", "prefix", "recipe", "savedAt", "version"]));
    }

    // ---- version dropdown drivers (dynamic choices) ----
    function cmOptValues(sel) {
        return Array.prototype.map.call(sel.querySelectorAll("option"), function (o) { return o.value; });
    }
    function cmLegacyConverge() {
        APM.state.recipe = [{ id: "code-minify", options: { language: "ruby", version: "csharp-9" } }];
        APM.recipe.render();
        var sel = APM.dom.$("code-minify-version-0");
        var ok = cmOptValues(sel).length === 1 && cmOptValues(sel)[0] === "auto" &&
            sel.value === "auto" &&
            APM.state.recipe[0].options.version === "auto";
        APM.state.recipe = [{ id: "minify", options: {} }];
        APM.recipe.render();
        return !!ok;
    }
    function cmToggle() {
        APM.state.recipe = [{ id: "code-minify", options: { language: "ruby", version: "auto" } }];
        APM.recipe.render();
        var langSel = APM.dom.$("code-minify-language-0");
        var verSel = APM.dom.$("code-minify-version-0");
        function setLang(v) {
            langSel.value = v;
            langSel.dispatchEvent(new Event("change"));
        }
        var ok = true;
        setLang("csharp");
        var c1 = cmOptValues(verSel);
        ok = ok && c1.length === 9 && c1[0] === "auto" && c1[8] === "csharp-5";
        verSel.value = "csharp-7";
        verSel.dispatchEvent(new Event("change"));
        ok = ok && APM.state.recipe[0].options.version === "csharp-7";
        setLang("ruby");
        var r1 = cmOptValues(verSel);
        ok = ok && r1.length === 1 && r1[0] === "auto" &&
            verSel.value === "auto" && APM.state.recipe[0].options.version === "auto";
        setLang("csharp");
        var c2 = cmOptValues(verSel);
        ok = ok && c2.length === 9 && verSel.value === "auto";
        APM.state.recipe = [{ id: "minify", options: {} }];
        APM.recipe.render();
        return !!ok;
    }
    function optRows() {
        // Layout contract (M7): each card option is its own .rec-opt row
        // (label + control grouped) — never flat inline siblings.
        function rowsOf(box) {
            var rows = [];
            Array.prototype.forEach.call(box.children, function (c) {
                if (c.className === "rec-opt") rows.push(c);
            });
            return { rows: rows, allRows: rows.length === box.children.length };
        }
        // code-minify: selects box = Language row + Version row;
        // checkboxes box = one valid row per checkbox.
        APM.state.recipe = [{ id: "code-minify", options: { language: "auto", version: "auto" } }];
        APM.recipe.render();
        var boxes = document.querySelectorAll(".rec-card .rec-options");
        var ok = boxes.length === 2;
        var b1 = rowsOf(boxes[0]);
        ok = ok && b1.allRows && b1.rows.length === 2;
        ok = ok && b1.rows[0].querySelector("label").textContent === "Language:" &&
            b1.rows[0].querySelector("#code-minify-language-0") !== null;
        ok = ok && b1.rows[1].querySelector("label").textContent === "Version:" &&
            b1.rows[1].querySelector("#code-minify-version-0") !== null;
        var b2 = rowsOf(boxes[1]);
        var valid = 0;
        Array.prototype.forEach.call(b2.rows, function (r) {
            if (r.querySelectorAll("label").length === 1 &&
                r.querySelectorAll("input[type=checkbox]").length === 1) valid++;
        });
        ok = ok && b2.allRows && b2.rows.length >= 1 && valid === b2.rows.length;
        // limit: Unit row + Max length row (custom number in that row).
        APM.state.recipe = [{ id: "limit", options: {} }];
        APM.recipe.render();
        var lbox = document.querySelector(".rec-card .rec-options");
        var l1 = rowsOf(lbox);
        ok = ok && l1.allRows && l1.rows.length === 2;
        ok = ok && l1.rows[0].querySelector("label").textContent === "Unit:" &&
            l1.rows[0].querySelector("#limit-unit-0") !== null;
        ok = ok && l1.rows[1].querySelector("label").textContent === "Max length:" &&
            l1.rows[1].querySelector("#limit-preset-0") !== null &&
            l1.rows[1].querySelector("input[type=number]") !== null;
        APM.state.recipe = [{ id: "minify", options: {} }];
        APM.recipe.render();
        return !!ok;
    }
    function optVisRows() {
        // Layout contract (M8): an option whose `visible` predicate is
        // false hides its WHOLE .rec-opt row (zero space) — and the
        // rows flip live when the language changes. Row order pinned
        // from the code-minify descriptor: comments (always) | null,
        // empty {}, empty [], empty "" (json) | style (markdown).
        APM.state.recipe = [{ id: "code-minify", options: { language: "auto", version: "auto" } }];
        APM.recipe.render();
        var lang = APM.dom.$("code-minify-language-0");
        function setLang(v) {
            lang.value = v;
            lang.dispatchEvent(new Event("change"));
        }
        function rowVis() {
            var box = document.querySelectorAll(".rec-card .rec-options")[1];
            var out = [];
            Array.prototype.forEach.call(box.children, function (r) {
                out.push(r.hidden ? 0 : 1);
            });
            return out;
        }
        var snap = { auto: rowVis() };
        setLang("json");
        snap.json = rowVis();
        setLang("markdown");
        snap.markdown = rowVis();
        APM.state.recipe = [{ id: "minify", options: {} }];
        APM.recipe.render();
        return snap;
    }

    // ---- focusTrap drivers (open/close the modal, drive Tab synthetically) ----
    function ftKey(el, key, shift) {
        el.dispatchEvent(new KeyboardEvent("keydown", { key: key, shiftKey: !!shift, bubbles: true, cancelable: true }));
    }
    function ftActiveId() { var a = document.activeElement; return (a && a.id) ? a.id : null; }
    function ftEnsureClosed() {
        if (!APM.dom.$("save-modal").hidden) APM.dom.$("save-modal-close").click();
    }
    function ftOpen() {
        ftEnsureClosed();
        APM.dom.$("saves-io-btn").focus();
        APM.dom.$("saves-io-btn").click();
        return ftActiveId();
    }
    function ftStepTo(fromId, toId, shift) {
        APM.dom.$(fromId).focus();
        ftKey(document.activeElement, "Tab", shift);
        return ftActiveId() === toId;
    }

    // ---- paneStatus drivers (display-only pane status) ----
    function psSetup(pv, iv) {
        var $ = APM.dom.$;
        APM.state.prefix = pv; $("prefix").value = pv;
        APM.state.recipe = [{ id: "minify", options: {} }];
        APM.recipe.render();
        APM.state.input = iv; $("input").value = iv;
        APM.io.recompute();
    }
    function psFocus(id, s, e) {
        var ta = APM.dom.$(id);
        ta.focus();
        ta.setSelectionRange(s, e);
        APM.io.refreshPos();
    }
    function psBlur() {
        if (document.activeElement && typeof document.activeElement.blur === "function") {
            document.activeElement.blur();
        }
        APM.io.refreshPos();
    }
    function psRead() {
        var $ = APM.dom.$;
        return { p: $("prefix-pos").textContent, i: $("input-pos").textContent, o: $("output-pos").textContent };
    }

    // ---- splits drivers (column widths + peek width) ----
    function spDefaults() {
        APM.splits.clearPersisted();
        return APM.splits.read();
    }
    function spShape() {
        var v = APM.splits.setPair(30, 34);
        var stored = APM.storage.get("apm.ui.splits");
        return (v.f === stored.f && v.r === stored.r) ? { f: stored.f, r: stored.r } : stored;
    }
    function spClampSmall() {
        // Contract floors (splits.js): filters >= 220px, recipe >= 250px.
        // A tiny request must land on those floors; tolerance covers
        // round1()'s 0.1% rounding (<= ~1px at test viewports).
        APM.splits.setPair(1, 1);
        var v = APM.storage.get("apm.ui.splits");
        var w = APM.dom.$("workspace").clientWidth;
        return Math.abs(parseFloat(v.f) / 100 * w - 220) <= 1 &&
            Math.abs(parseFloat(v.r) / 100 * w - 250) <= 1;
    }
    function spClampHuge() {
        // Contract: the io pane keeps its 320px floor (two 5px gutters).
        APM.splits.setPair(90, 90);
        var v = APM.storage.get("apm.ui.splits");
        var w = APM.dom.$("workspace").clientWidth;
        var io = w * (1 - parseFloat(v.f) / 100 - parseFloat(v.r) / 100) - 10;
        return io >= 319;
    }
    function spReset() {
        APM.splits.setPair(30, 34);
        APM.splits.clearPersisted();
        return APM.storage.get("apm.ui.splits") === null &&
            APM.splits.read().f === "24%" && APM.splits.read().r === "26%" &&
            APM.dom.$("workspace").style.getPropertyValue("--col-f") === "";
    }
    function spPeek() {
        // Contract: peek min 250px of the viewport, max 60%.
        var vw = window.innerWidth;
        return parseFloat(APM.splits.peekPct(1)) / 100 * vw >= 249 &&
            APM.splits.peekPct(99) === 60;
    }
    function spProfileExempt() {
        APM.splits.setPair(30, 34);
        var NAME = "__apmtest_spsave__";
        APM.state.prefix = "SP2";
        APM.state.recipe = [{ id: "minify", options: {} }];
        APM.recipe.render();
        withPrompt(NAME, function () { APM.dom.$("save-btn").click(); });
        var snap = (APM.storage.get("apm.saves") || {})[NAME];
        return !!(snap &&
            Object.keys(snap).sort().join(",") === "name,prefix,recipe,savedAt,version" &&
            JSON.stringify(snap).indexOf("apm.ui") === -1);
    }
    function spSoftExempt() {
        APM.splits.setPair(30, 34);
        APM.state.prefix = "SP3";
        APM.state.input = "SP4";
        APM.state.recipe = [{ id: "minify", options: {} }];
        APM.saves.persistNow();
        var ls = APM.storage.get("apm.lastState");
        return !!(ls &&
            Object.keys(ls).sort().join(",") === "input,prefix,recipe,savedAt,version" &&
            JSON.stringify(ls).indexOf("apm.ui") === -1);
    }

    function monotonicOk(base) {
        var cur = "";
        for (var i = 0; i < base.length; i++) {
            cur = base.slice(0, i + 1);
            if (i > 0 && APM.tokens.estimate(cur) < APM.tokens.estimate(cur.slice(0, i))) return false;
        }
        return true;
    }

    // ---------- dispatch ----------
    function evalCase(c) {
        var F = APM.filters;
        var get = function (id) { return F.get(id); };
        var a = c.a;
        switch (c.op) {
            case "minify": return get("minify").run(a[0]);
            case "strip": return get("strip-html").run(a[0]);
            case "rc": return get("remove-comment").run(a[0], { language: a[1] });
            case "res": return get("remove-extra-space").run(a[0], (a[1] === undefined || a[1] === "__undefined__") ? undefined : { spaces: a[1] });
            case "regex": return get("regex-replace").run(a[0], a[1]);
            case "cm": return get("code-minify").run(a[0], { language: a[1], removeComments: a[2] });
            case "cmAuto": return get("code-minify").run(a[0], { language: "auto" });
            case "cmLang": return get("code-minify").run(a[0], { language: a[1] });
            case "cmVersion": return get("code-minify").run(a[0], { language: "csharp", version: a[1] });
            case "cmVerOff": return get("code-minify").run(a[0], { language: "csharp", version: a[1], removeComments: false });
            case "jsVer": return get("code-minify").run(a[0], { language: "javascript", version: a[1] });
            case "cVer": return get("code-minify").run(a[0], { language: "c", version: a[1] });
            case "jsonParse": return JSON.parse(get("code-minify").run(a[0], { language: "json" }));
            case "jsonOpts": return get("code-minify").run(a[0], a[1]);
            case "jsonOptsDesc": {
                var cs = get("code-minify").checkboxes;
                var ok = ["removeNull", "removeEmptyObject", "removeEmptyArray", "removeEmptyString"].every(function (k) {
                    var c = null; for (var j = 0; j < cs.length; j++) if (cs[j].key === k) c = cs[j];
                    return c && c.def === false && c.visible({ language: "json" }) === true && c.visible({ language: "csharp" }) === false;
                }) && get("code-minify").defaultOptions().removeNull === false;
                return ok ? "ok" : "bad";
            }
            case "mdPlain": return get("code-minify").run(a[0], { language: "markdown", removeComments: true, removeStyle: true });
            case "mdPlainOff": return get("code-minify").run(a[0], { language: "markdown", removeComments: true, removeStyle: false }) === get("code-minify").run(a[0], { language: "markdown", removeComments: true });
            case "mdPlainDesc": {
                var c2 = null, cbs = get("code-minify").checkboxes;
                for (var m = 0; m < cbs.length; m++) if (cbs[m].key === "removeStyle") c2 = cbs[m];
                return c2 && c2.def === false && c2.visible({ language: "markdown" }) === true && c2.visible({ language: "json" }) === false ? "ok" : "bad";
            }
            case "emoji": return get("remove-emoji").run(a[0]);
            case "emojiName": return get("remove-emoji").name;
            case "posLeft": {
                var okAll = true;
                ["prefix", "input", "output"].forEach(function (p) {
                    var pos = APM.dom.$(p + "-pos");
                    var title = pos.parentNode;
                    var controls = title.querySelector(".pane-controls");
                    var ci = Array.prototype.indexOf.call(title.childNodes, pos);
                    var ki = Array.prototype.indexOf.call(title.childNodes, controls);
                    okAll = okAll && title.classList.contains("pane-title") && !controls.contains(pos) && ci < ki;
                });
                return okAll;
            }
            case "dedup": return get("dedup").run(a[0], a[1]);
            case "dedupName": return get("dedup").name;
            case "dedupStatus": return get("dedup").status;
            case "dedupMode": return get("dedup").selects[0].choices;
            case "dedupCheckbox": { var cb = get("dedup").checkboxes[0]; return cb.key + "|" + cb.label; }
            case "dedupSave": return dedupSave();
            case "tokEst": return APM.tokens.estimate(a[0]);
            case "tokTrunc": return APM.tokens.truncate(a[0], a[1]);
            case "tokChunks": return APM.tokens.chunks(a[0]).join("");
            case "tokMono": return monotonicOk(a[0]);
            case "limit": {
                var r = get("limit").run(a[0], a[1]);
                if (a[2] === "len") return r.text.length;
                if (a[2] === "flag") return r.truncated;
                return { text: r.text, truncated: r.truncated };
            }
            case "limitPresets": return get("limit").presets.map(function (p) { return p.label; });
            case "limitUnits": return { values: get("limit").units.map(function (u) { return u.value; }), labels: get("limit").units.map(function (u) { return u.label; }) };
            case "cmLangs": { var s = get("code-minify").selects[0]; return { order: s.choices.map(function (c) { return c.value; }), labels: s.choices.map(function (c) { return c.label; }) }; }
            case "cmVerIsFn": return typeof get("code-minify").selects[1].choices === "function";
            case "cmVerCs": return get("code-minify").selects[1].choices({ language: "csharp" });
            case "cmVerRuby": return get("code-minify").selects[1].choices({ language: "ruby" });
            case "cmVerAuto": return get("code-minify").selects[1].choices({ language: "auto" });
            case "cmLegacyConverge": return cmLegacyConverge();
            case "cmToggle": return cmToggle();
            case "optRows": return optRows();
            case "optVisRows": return optVisRows();
            case "rcLangs": { var s2 = get("remove-comment").selects[0]; return { order: s2.choices.map(function (c) { return c.value; }), labels: s2.choices.map(function (c) { return c.label; }) }; }
            case "filterIds": return F.ids();
            case "defaults": return get(a[0]).defaultOptions();
            case "registryMetas": { var r2 = F.run(a[0], a[1]); return { text: r2.text, metas: r2.metas }; }
            case "registryUnknown": { var r4 = F.run(a[0], a[1]); return { text: r4.text, truncated: r4.truncated, metas: r4.metas }; }
            case "pipeline": return pipeline(a[0], a[1], a[2]);
            case "saveShape": return saveShape();
            case "softShape": return softShape();
            case "loadEmpty": return loadEmpty();
            case "loadKeeps": return loadKeeps();
            case "collapseKey": return collapseKey();
            case "importValid": return importValid();
            case "importSkipped": return importSkipped();
            case "importBadRoot": return importBadRoot();
            case "importLegacy": return importLegacy();
            case "legacyMigrate": return legacyMigrate();
            case "legacyMigrateNone": return legacyMigrateNone();
            case "legacyResume": return legacyResume();
            case "legacyResumeEmpty": return legacyResumeEmpty();
            case "legacyResumeKeeps": return legacyResumeKeeps();
            case "themeNames": return themeNames();
            case "themeKey": return themeKey();
            case "paletteOrder": return paletteOrder();
            case "paletteCount": return paletteCount();
            case "paletteSearch": return paletteSearch(a[0]);
            case "ftOpen": { var id = ftOpen(); var ok = id === "saves-json"; ftEnsureClosed(); return ok; }
            case "ftTabFwd": {
                ftOpen();
                var ok1 = ftStepTo("saves-json", "saves-copy-btn") && ftStepTo("saves-copy-btn", "saves-download-btn") && ftStepTo("saves-download-btn", "saves-import-btn");
                ftEnsureClosed();
                return ok1;
            }
            case "ftShiftWrap": {
                ftOpen();
                var ok2 = ftStepTo("saves-json", "save-modal-close", true);
                ftEnsureClosed();
                return ok2;
            }
            case "ftTabWrap": {
                ftOpen();
                var ok3 = ftStepTo("save-modal-close", "saves-json");
                ftEnsureClosed();
                return ok3;
            }
            case "ftImportView": {
                ftOpen();
                APM.dom.$("saves-import-btn").click();
                var ok4 = ftStepTo("save-modal-close", "saves-import-confirm") && ftStepTo("saves-import-cancel", "saves-json");
                ftEnsureClosed();
                return ok4;
            }
            case "ftCloseBtn": {
                ftOpen();
                APM.dom.$("save-modal-close").click();
                return APM.dom.$("save-modal").hidden && ftActiveId() === "saves-io-btn";
            }
            case "ftEsc": {
                ftOpen();
                ftKey(document.activeElement, "Escape", false);
                return APM.dom.$("save-modal").hidden && ftActiveId() === "saves-io-btn";
            }
            case "ftOverlay": {
                ftOpen();
                APM.dom.$("save-modal").dispatchEvent(new MouseEvent("click", { bubbles: true }));
                return APM.dom.$("save-modal").hidden && ftActiveId() === "saves-io-btn";
            }
            case "ftImportClose": {
                ftOpen();
                APM.dom.$("saves-import-btn").click();
                APM.dom.$("saves-import-cancel").click();
                return APM.dom.$("save-modal").hidden && ftActiveId() === "saves-io-btn";
            }
            case "ftNoLeak": {
                var $m = APM.dom.$;
                ftOpen();
                $m("save-modal-close").click();
                var ev = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
                $m("saves-json").dispatchEvent(ev);
                return $m("save-modal").hidden && ev.defaultPrevented === false && ftActiveId() === "saves-io-btn";
            }
            case "psBase": { psSetup("", ""); psBlur(); return psRead(); }
            case "psCaretStart": { psSetup("", "hello"); psFocus("input", 0, 0); return psRead(); }
            case "psCaretLine2": { psSetup("", "a\nb\nc"); psFocus("input", 2, 2); return psRead(); }
            case "psSel": { psSetup("", "ab\ncd"); psFocus("input", 1, 4); return psRead(); }
            case "psPrefix": { psSetup("", "x"); psFocus("prefix", 0, 0); return psRead(); }
            case "psOutput": { psSetup("", '"ab\ncd"'); psFocus("output", 1, 5); return psRead(); }
            case "psBlur": { psSetup("", '"ab\ncd"'); psFocus("output", 1, 5); psBlur(); return psRead(); }
            case "psNoImpact": {
                psSetup("", "x   =   1");
                psFocus("input", 1, 3);
                psBlur();
                return APM.dom.$("output").value;
            }
            case "spDefaults": return spDefaults();
            case "spShape": return spShape();
            case "spClampSmall": return spClampSmall();
            case "spClampHuge": return spClampHuge();
            case "spReset": return spReset();
            case "spPeek": return spPeek();
            case "spProfileExempt": return spProfileExempt();
            case "spSoftExempt": return spSoftExempt();
            case "pnDefaults": return pnDefaults();
            case "pnShape": return pnShape();
            case "pnClamp": return pnClamp();
            case "pnReset": return pnReset();
            case "pnKey": return pnKey();
            case "pnMalformed": return pnMalformed();
            case "pnProfileExempt": return pnProfileExempt();
            default: throw new Error("APM.test: unknown op " + c.op);
        }
    }

    // ---------- capture / restore (tests never leave user data mutated) ----------
    function capture() {
        return {
            prefix: APM.state.prefix,
            input: APM.state.input,
            recipe: JSON.parse(JSON.stringify(APM.state.recipe)),
            saves: APM.storage.get("apm.saves"),
            lastState: APM.storage.get("apm.lastState"),
            legacyPresets: APM.storage.rawGet("prefixPresets"),
            legacyLast: APM.storage.rawGet("lastPrefix"),
            theme: APM.theme.current(),
            leftCollapsed: APM.leftpane.isCollapsed(),
            splits: APM.storage.get("apm.ui.splits"),
            peek: APM.storage.get("apm.ui.peekWidth"),
            search: APM.dom.$("filter-search").value
        };
    }

    function restore(cap) {
        try {
            APM.state.prefix = cap.prefix;
            APM.state.input = cap.input;
            APM.state.recipe = JSON.parse(JSON.stringify(cap.recipe));
            APM.dom.$("prefix").value = cap.prefix;
            APM.dom.$("input").value = cap.input;
            APM.recipe.render();
            APM.io.recompute();
            if (cap.saves === null) { try { localStorage.removeItem("apm.saves"); } catch (err) { /* blocked */ } }
            else APM.storage.set("apm.saves", cap.saves);
            if (cap.lastState === null) { try { localStorage.removeItem("apm.lastState"); } catch (err) { /* blocked */ } }
            else APM.storage.set("apm.lastState", cap.lastState);
            if (cap.legacyPresets === null) { try { localStorage.removeItem("prefixPresets"); } catch (err) { /* blocked */ } }
            else { try { localStorage.setItem("prefixPresets", cap.legacyPresets); } catch (err) { /* blocked */ } }
            if (cap.legacyLast === null) { try { localStorage.removeItem("lastPrefix"); } catch (err) { /* blocked */ } }
            else { try { localStorage.setItem("lastPrefix", cap.legacyLast); } catch (err) { /* blocked */ } }
            APM.saves.refresh();
            APM.saves.persistNow();
            APM.theme.apply(cap.theme);
            if (APM.leftpane.isCollapsed() !== cap.leftCollapsed) APM.leftpane.toggle();
            if (cap.splits === null) { try { localStorage.removeItem("apm.ui.splits"); } catch (err) { /* blocked */ } }
            else APM.storage.set("apm.ui.splits", cap.splits);
            if (cap.peek === null) { try { localStorage.removeItem("apm.ui.peekWidth"); } catch (err) { /* blocked */ } }
            else APM.storage.set("apm.ui.peekWidth", cap.peek);
            var wstyle = APM.dom.$("workspace").style;
            if (cap.splits) { wstyle.setProperty("--col-f", cap.splits.f); wstyle.setProperty("--col-r", cap.splits.r); }
            else { wstyle.removeProperty("--col-f"); wstyle.removeProperty("--col-r"); }
            if (cap.peek) { wstyle.setProperty("--peek-w", cap.peek); }
            else { wstyle.removeProperty("--peek-w"); }
            var s = APM.dom.$("filter-search");
            if (s.value !== cap.search) { s.value = cap.search; APM.palette.render(cap.search); }
        } catch (err) {
            // best effort: the user's state is restored as far as the
            // environment allows; a failed restore is never fatal.
        }
    }

    // ---------- the runner ----------
    function run(filter) {
        var f = String(filter == null ? "" : filter).trim().toLowerCase();
        var results = { total: 0, passed: 0, failed: 0, failures: [] };
        var cap = capture();
        var suiteSeen = {}, suitePass = {}, order = [];
        try {
            for (var i = 0; i < CASES.length; i++) {
                var c = CASES[i];
                if (f && c.n.toLowerCase().indexOf(f) === -1) continue;
                results.total++;
                if (!(c.s in suiteSeen)) { suiteSeen[c.s] = 0; suitePass[c.s] = 0; order.push(c.s); }
                suiteSeen[c.s]++;
                var actual, threw = null;
                try { actual = evalCase(c); } catch (e) { threw = e; actual = "THREW " + (e && e.message); }
                if (!threw && deepEq(c.e, actual)) {
                    results.passed++; suitePass[c.s]++;
                } else {
                    results.failed++;
                    results.failures.push({ name: c.n, expected: JSON.stringify(c.e), actual: JSON.stringify(actual) });
                }
            }
        } finally {
            restore(cap);
        }
        var allGreen = results.failed === 0;
        for (var j = 0; j < order.length; j++) {
            var s = order[j];
            var green = suitePass[s] === suiteSeen[s];
            console.log("[APM.test] " + (green ? "PASS" : "FAIL") + " " + s + " (" + suitePass[s] + "/" + suiteSeen[s] + ")");
        }
        for (var k = 0; k < results.failures.length; k++) {
            var fl = results.failures[k];
            console.error("[APM.test] FAIL " + fl.name + "\n    expected " + fl.expected + "\n    actual   " + fl.actual);
        }
        console.log("[APM.test] " + results.passed + " passed, " + results.failed + " failed (" + results.total + " total)" + (allGreen ? " — all green" : ""));
        APM.toast.show("Unit tests: " + results.passed + " passed, " + results.failed + " failed");
        return results;
    }

    function list() {
        return CASES.map(function (c) { return c.n; });
    }

    APM.test = { run: run, list: list };
})(window.APM = window.APM || {});

