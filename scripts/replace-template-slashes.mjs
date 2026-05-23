import { Lang, parse } from "@ast-grep/napi";

const matcher = {
  rule: {
    kind: "string_fragment",
    regex: "//",
    inside: {
      kind: "template_string",
    },
  },
};

const escapeSlashRuns = (text) =>
  text.replace(/\/+/g, (slashes) =>
    [...slashes].map((_, index) => (index % 2 === 0 ? "\\x2f" : "/")).join("")
  );

process.stdin.setEncoding("utf8");

let source = "";
for await (const chunk of process.stdin) {
  source += chunk;
}

const root = parse(Lang.JavaScript, source);
const ast = root.root();

const edits = ast
  .findAll(matcher)
  .map((node) => {
    const next = escapeSlashRuns(node.text());
    return next === node.text() ? null : node.replace(next);
  })
  .filter(Boolean);

const updated = edits.length === 0 ? source : ast.commitEdits(edits);

process.stdout.write(updated);
